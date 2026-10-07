import { describe, it, expect, vi, beforeEach } from "vitest";
import * as XLSX from "xlsx-js-style";

const calls: Array<{ op: string; args: any[] }> = [];
let pages: any[][] = [];
let pageIdx = 0;

function makeBuilder() {
  const b: any = {};
  for (const op of ["select", "eq", "in", "gte", "lte", "or", "order", "not"]) {
    b[op] = (...args: any[]) => { calls.push({ op, args }); return b; };
  }
  b.range = (a: number, z: number) => {
    calls.push({ op: "range", args: [a, z] });
    const data = pages[pageIdx++] ?? [];
    return Promise.resolve({ data, error: null, count: data.length });
  };
  return b;
}
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => { calls.push({ op: "from", args: [t] }); return makeBuilder(); } } }));
vi.mock("@/lib/auth-helpers", () => ({
  getCompanyId: async () => "co-1",
  sanitizeSearchTerm: (s: string) => s.replace(/[(),`\\]/g, "").trim(),
}));

import { fetchDcBalance, fetchDcBalanceForExport } from "@/lib/dc-balance-api";
import { buildDcBalanceWorkbook, dcBalanceTotals } from "@/lib/export-utils";

beforeEach(() => { calls.length = 0; pages = []; pageIdx = 0; });
const on = (op: string) => calls.filter((c) => c.op === op).map((c) => c.args);

const line = (o: any = {}) => ({
  dc_id: "d1", dc_number: "DC-1", dc_date: "2026-10-01", vendor_name: "V", dc_line_item_id: "l" + Math.random(), serial_number: 1,
  item_code: "I-1", drawing_number: "DR", description: "Shaft", nature_of_process: "Plating", unit: "NOS",
  plan_qty: "10", plan_qty_2: null, unit_2: null, received_qty: "4", balance_qty: "6", accepted_qty: "3", rejected_qty: "1",
  store_confirmed_qty: "3", grn_numbers: "G-1, G-2", return_due_date: "2026-10-05", days_overdue: 2, line_status: "partially_received", ...o,
});

describe("filter → query mapping", () => {
  it("default: company scope, Pending + Partial, stable ordering, paging", async () => {
    await fetchDcBalance({ page: 2, pageSize: 50 });
    expect(on("from")[0]).toEqual(["v_dc_line_balance"]);
    expect(on("eq")).toContainEqual(["company_id", "co-1"]);
    expect(on("in")).toContainEqual(["line_status", ["pending", "partially_received"]]);
    expect(on("order").map((a) => a[0])).toEqual(["dc_date", "dc_number", "serial_number", "dc_line_item_id"]);
    expect(on("order")[0][1]).toEqual({ ascending: false });
    expect(on("range")[0]).toEqual([50, 99]);
  });
  it("status 'all' adds no status filter; a specific status is an eq", async () => {
    await fetchDcBalance({ status: "all" });
    expect(on("in")).toEqual([]);
    expect(on("eq").filter((a) => a[0] === "line_status")).toEqual([]);
    calls.length = 0;
    await fetchDcBalance({ status: "pending" });
    expect(on("eq")).toContainEqual(["line_status", "pending"]);
  });
  it("vendor, overdue-only and month (leap Feb) map to filters", async () => {
    await fetchDcBalance({ vendor: "Acme", overdueOnly: true, month: "2028-02" });
    expect(on("eq")).toContainEqual(["vendor_name", "Acme"]);
    expect(on("not")).toContainEqual(["days_overdue", "is", null]);
    expect(on("gte")).toContainEqual(["dc_date", "2028-02-01"]);
    expect(on("lte")).toContainEqual(["dc_date", "2028-02-29"]);
  });
  it("search spans DC no, vendor, item, drawing, description (sanitised)", async () => {
    await fetchDcBalance({ search: "ab(c)" });
    const or = on("or")[0][0] as string;
    for (const col of ["dc_number", "vendor_name", "item_code", "drawing_number", "description"]) expect(or).toContain(`${col}.ilike.%abc%`);
  });
  it("coerces numeric strings and keeps days_overdue null", async () => {
    pages = [[line({ days_overdue: null })]];
    const { data } = await fetchDcBalance({});
    expect(data[0].plan_qty).toBe(10);
    expect(data[0].balance_qty).toBe(6);
    expect(data[0].days_overdue).toBeNull();
  });
});

describe("export fetch", () => {
  it("pages 1000 until a short page", async () => {
    pages = [Array.from({ length: 1000 }, () => line()), Array.from({ length: 5 }, () => line())];
    const rows = await fetchDcBalanceForExport({});
    expect(rows).toHaveLength(1005);
    expect(on("range")).toEqual([[0, 999], [1000, 1999]]);
  });
  it("aborts past 20 pages", async () => {
    pages = Array.from({ length: 25 }, () => Array.from({ length: 1000 }, () => line()));
    await expect(fetchDcBalanceForExport({})).rejects.toThrow(/aborted/);
  });
  it("throws on a non-numeric quantity", async () => {
    pages = [[line({ plan_qty: null })]];
    await expect(fetchDcBalanceForExport({})).rejects.toThrow(/plan_qty/);
  });
});

describe("totals / single-unit rule", () => {
  const r = (unit: string, plan: number, received: number, balance: number) => ({ unit, plan_qty: plan, received_qty: received, balance_qty: balance });
  it("totals when all rows share one unit", () => {
    expect(dcBalanceTotals([r("NOS", 10, 4, 6), r("NOS", 5, 5, 0.5)])).toEqual({ unit: "NOS", plan: 15, received: 9, balance: 6.5 });
  });
  it("returns null for mixed units or no rows", () => {
    expect(dcBalanceTotals([r("NOS", 1, 1, 0), r("KGS", 1, 1, 0)])).toBeNull();
    expect(dcBalanceTotals([])).toBeNull();
  });
  const build = (rows: any[], filters: any = {}) =>
    buildDcBalanceWorkbook(rows.map((x) => ({ ...x, plan_qty: Number(x.plan_qty), received_qty: Number(x.received_qty), balance_qty: Number(x.balance_qty), accepted_qty: 3, rejected_qty: 1, store_confirmed_qty: 3 })),
      { companyName: "Acme Works", generatedAt: "07-Oct-2026 10:00 IST", todayIST: "2026-10-07", filters });
  const aoaOf = (wb: XLSX.WorkBook) => XLSX.utils.sheet_to_json<any[]>(wb.Sheets["DC Balance"], { header: 1, blankrows: true });

  it("writes a totals row (Plan/Received/Balance only) for a single unit", () => {
    const aoa = aoaOf(build([line(), line()]).workbook);
    expect(aoa[1][0]).toBe("DC Balance — Plan vs Received");
    expect(aoa[2][0]).toContain("Status: Pending + Partial");
    const t = aoa[aoa.length - 1];
    expect(t[1]).toBe("TOTAL");
    expect([t[9], t[12], t[13]]).toEqual([20, 8, 12]);
    expect(t[14]).toBe("");
  });
  it("omits the totals row for mixed units", () => {
    const aoa = aoaOf(build([line(), line({ unit: "KGS" })]).workbook);
    expect(aoa.some((row) => row[1] === "TOTAL")).toBe(false);
    expect(aoa).toHaveLength(6 + 2);
  });
  it("names the file by filter, or All", () => {
    expect(build([line()], { status: "all" }).filename).toBe("DC-Balance_acme-works_All_2026-10-07.xlsx");
    expect(build([line()]).filename).toBe("DC-Balance_acme-works_Pending-Partial_2026-10-07.xlsx");
    expect(build([line()], { month: "2026-10", overdueOnly: true, vendor: "V" }).filename).toBe("DC-Balance_acme-works_2026-10-Overdue-Filtered_2026-10-07.xlsx");
  });
});
