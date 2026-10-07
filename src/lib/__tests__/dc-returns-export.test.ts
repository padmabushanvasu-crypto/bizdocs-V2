import { describe, it, expect, vi, beforeEach } from "vitest";
import * as XLSX from "xlsx-js-style";

// Recording query-builder stub: every call is logged; awaiting resolves per table.
const calls: Array<{ table: string; op: string; args: any[] }> = [];
const tableData: Record<string, any[]> = {};

function makeBuilder(table: string) {
  const b: any = {};
  for (const op of ["select", "eq", "neq", "in", "gte", "lte", "or", "order", "not", "is", "gt", "ilike"]) {
    b[op] = (...args: any[]) => { calls.push({ table, op, args }); return b; };
  }
  b.range = (a: number, z: number) => {
    calls.push({ table, op: "range", args: [a, z] });
    return Promise.resolve({ data: (tableData[table] ?? []).slice(a, z + 1), error: null });
  };
  b.then = (res: any) => res({ data: tableData[table] ?? [], error: null });
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => makeBuilder(t) } }));
vi.mock("@/lib/auth-helpers", () => ({
  getCompanyId: async () => "co-1",
  sanitizeSearchTerm: (s: string) => s.replace(/[(),`\\]/g, "").trim(),
}));
vi.mock("@/lib/assembly-orders-api", () => ({ addStockLedgerEntry: vi.fn() }));
vi.mock("@/lib/doc-number-utils", () => ({ getNextDocNumber: vi.fn() }));
vi.mock("@/lib/items-api", () => ({ updateStockBucket: vi.fn() }));
vi.mock("@/lib/notifications-api", () => ({ createNotification: vi.fn() }));

import { fetchGRNs, fetchDcGrnsForExport } from "@/lib/grn-api";
import { buildDcReturnsWorkbook } from "@/lib/export-utils";

beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(tableData)) delete tableData[k];
});

const on = (table: string, op: string) => calls.filter((c) => c.table === table && c.op === op);

describe("fetchGRNs filters", () => {
  it("uses the real last day of the month (Feb leap year, no UTC shift)", async () => {
    await fetchGRNs({ month: "2028-02", page: 1, pageSize: 25 });
    expect(on("grns", "gte")[0].args).toEqual(["grn_date", "2028-02-01"]);
    expect(on("grns", "lte")[0].args).toEqual(["grn_date", "2028-02-29"]);
  });
  it("searches linked_dc_number only for dc_grn", async () => {
    await fetchGRNs({ search: "DC-12", grn_type: "dc_grn" });
    expect(on("grns", "or")[0].args[0]).toContain("linked_dc_number.ilike.%DC-12%");
    calls.length = 0;
    await fetchGRNs({ search: "DC-12", grn_type: "po_grn" });
    expect(on("grns", "or")[0].args[0]).not.toContain("linked_dc_number");
  });
});

describe("fetchDcGrnsForExport", () => {
  it("scopes to the company and dc_grn, applies filters, pages 1000, joins DC data", async () => {
    tableData.grns = [{ id: "g1", grn_number: "DCR-1", grn_date: "2026-10-02", linked_dc_id: "d1", linked_dc_number: "DC-7", vendor_name: "V", grn_stage: "closed", status: "verified", inward_sl_no: 4 }];
    tableData.grn_line_items = [{ id: "l1", grn_id: "g1", serial_number: 1, item_id: "i1", dc_line_item_id: "dl1", description: "Shaft", drawing_number: "DR-1", unit: "NOS", received_now: 5, accepted_qty: 4, rejected_qty: 1, store_confirmed_qty: 4 }];
    tableData.dc_line_items = [{ id: "dl1", dc_id: "d1", item_code: "X", nature_of_process: "Plating", unit: "NOS", qty_nos: 10 }];
    tableData.delivery_challans = [{ id: "d1", dc_number: "DC-7", dc_date: "2026-09-20" }];
    tableData.items = [{ id: "i1", item_code: "IC-1" }];

    const rows = await fetchDcGrnsForExport({ search: "x", month: "2026-10", status: "verified", showDeleted: false });

    expect(on("grns", "eq").map((c) => c.args)).toEqual(
      expect.arrayContaining([["company_id", "co-1"], ["grn_type", "dc_grn"], ["status", "verified"]]),
    );
    expect(on("grns", "lte")[0].args).toEqual(["grn_date", "2026-10-31"]);
    expect(on("grns", "neq")[0].args).toEqual(["status", "deleted"]);
    expect(on("grns", "range")[0].args).toEqual([0, 999]);
    expect(rows).toEqual([
      expect.objectContaining({
        dc_number: "DC-7", dc_date: "2026-09-20", grn_number: "DCR-1", grn_date: "2026-10-02",
        item_code: "IC-1", drawing_number: "DR-1", nature_of_process: "Plating",
        qty_sent: 10, received: 5, accepted: 4, rejected: 1, store_confirmed: 4,
      }),
    ]);
  });
  it("chunks line-item fetches by 200 GRN ids", async () => {
    tableData.grns = Array.from({ length: 450 }, (_, i) => ({ id: `g${i}`, grn_number: `N${i}`, grn_date: "2026-10-01", status: "draft" }));
    await fetchDcGrnsForExport({});
    expect(on("grn_line_items", "in").map((c) => c.args[1].length)).toEqual([200, 200, 50]);
  });
  it("aborts rather than truncating past 20 pages", async () => {
    tableData.grns = Array.from({ length: 20001 }, (_, i) => ({ id: `g${i}` }));
    await expect(fetchDcGrnsForExport({})).rejects.toThrow(/aborted/);
  });
});

describe("buildDcReturnsWorkbook", () => {
  const row = (o: any = {}) => ({
    dc_number: "DC-7", dc_date: "2026-09-20", grn_number: "DCR-1", grn_date: "2026-10-02", inward_sl_no: 4,
    vendor_name: "V", item_code: "IC-1", drawing_number: "DR-1", description: "Shaft", nature_of_process: "Plating",
    unit: "NOS", qty_sent: 10, received: 5, accepted: 4, rejected: 1, store_confirmed: 4, grn_stage: "closed", status: "verified", ...o,
  });
  const { workbook, filename } = buildDcReturnsWorkbook([row(), row({ status: "draft", received: 2, accepted: 2, rejected: 0, store_confirmed: 0 })], {
    companyName: "Acme Works", generatedAt: "07-Oct-2026 10:00 IST", todayIST: "2026-10-07",
    filters: { search: "", status: "all", month: "2026-10", showDeleted: false }, daysOpen: () => 5,
  });
  const aoa = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets["DC Returns"], { header: 1, blankrows: true });
  it("names the file", () => expect(filename).toBe("DC-Returns_acme-works_2026-10_2026-10-07.xlsx"));
  it("writes header block, DC date (not GRN date) and day counts", () => {
    expect(aoa[1][0]).toBe("DC Returns — Goods Returned from Vendors");
    expect(aoa[2][0]).toContain("Month: Oct 2026");
    expect(aoa[3][0]).toBe("Generated:  07-Oct-2026 10:00 IST");
    expect(aoa[5][2]).toBe("DC Date");
    expect(aoa[6][2]).toBe("20-Sep-2026");
    expect(aoa[6][4]).toBe("02-Oct-2026");
    expect(aoa[6][19]).toBe("Done");
    expect(aoa[7][19]).toBe(5);
  });
  it("totals received/accepted/rejected/confirmed but not Qty Sent", () => {
    const t = aoa[8];
    expect([t[12], t[13], t[14], t[15], t[16]]).toEqual(["", 7, 6, 1, 4]);
  });
  it("uses 'All' in the filename without a month", () => {
    const r = buildDcReturnsWorkbook([], { companyName: "Acme Works", generatedAt: "", todayIST: "2026-10-07", filters: {}, daysOpen: () => 0 });
    expect(r.filename).toBe("DC-Returns_acme-works_All_2026-10-07.xlsx");
  });
});
