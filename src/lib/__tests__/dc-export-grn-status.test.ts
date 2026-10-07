import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: Array<{ table: string; op: string; args: any[] }> = [];
const tableData: Record<string, any[]> = {};
let viewError: any = null;

function makeBuilder(table: string) {
  const b: any = {};
  for (const op of ["select", "eq", "neq", "in", "gte", "lte", "order"]) {
    b[op] = (...args: any[]) => { calls.push({ table, op, args }); return b; };
  }
  b.range = (a: number, z: number) => {
    calls.push({ table, op: "range", args: [a, z] });
    if (table === "v_dc_line_balance" && viewError) return Promise.resolve({ data: null, error: viewError });
    return Promise.resolve({ data: (tableData[table] ?? []).slice(a, z + 1), error: null });
  };
  b.then = (res: any) => res({ data: tableData[table] ?? [], error: null });
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => makeBuilder(t) } }));
vi.mock("@/lib/auth-helpers", () => ({ getCompanyId: async () => "co-1", sanitizeSearchTerm: (s: string) => s }));
vi.mock("@/lib/assembly-orders-api", () => ({ addStockLedgerEntry: vi.fn() }));
vi.mock("@/lib/doc-number-utils", () => ({ getNextDocNumber: vi.fn() }));
vi.mock("@/lib/items-api", () => ({ updateStockBucket: vi.fn() }));
vi.mock("@/lib/audit-api", () => ({ logAudit: vi.fn() }));

import { fetchAllDCsForExport } from "@/lib/delivery-challans-api";
import { buildDcReportLineRows } from "@/lib/export-utils";

const view = (id: string, o: any = {}) => ({
  dc_line_item_id: id, grn_numbers: null, plan_qty: 10, received_qty: 0,
  accepted_qty: 0, rejected_qty: 0, balance_qty: 10, line_status: "pending", ...o,
});

beforeEach(() => {
  calls.length = 0;
  viewError = null;
  for (const k of Object.keys(tableData)) delete tableData[k];
  tableData["delivery_challans"] = [
    { id: "dc-1", dc_number: "DC-1", party_name: "V", status: "issued",
      line_items: [
        { id: "l-partial", serial_number: 1, quantity: 10, qty_nos: 10, unit: "Nos" },
        { id: "l-over", serial_number: 2, quantity: 10, qty_nos: 10, unit: "Nos" },
        { id: "l-nogrn", serial_number: 3, quantity: 10, qty_nos: 10, unit: "Nos" },
      ] },
    { id: "dc-2", dc_number: "DC-2", party_name: "V", status: "draft",
      line_items: [{ id: "l-draft", serial_number: 1, quantity: 5, qty_nos: 5, unit: "Nos" }] },
  ];
  tableData["v_dc_line_balance"] = [
    view("l-partial", { grn_numbers: "GRN-1, GRN-2", received_qty: 6, accepted_qty: 5, rejected_qty: 1, balance_qty: 4, line_status: "partially_received" }),
    view("l-over", { grn_numbers: "GRN-3", received_qty: 12, accepted_qty: 12, balance_qty: 0, line_status: "fully_received" }),
    view("l-nogrn"),
  ];
});

describe("DC export GRN status", () => {
  it("scopes the view fetch by company and dc ids", async () => {
    await fetchAllDCsForExport("2026-01-01", "2026-12-31", "co-1");
    const v = calls.filter((c) => c.table === "v_dc_line_balance");
    expect(v.find((c) => c.op === "eq")?.args).toEqual(["company_id", "co-1"]);
    expect(v.find((c) => c.op === "in")?.args).toEqual(["dc_id", ["dc-1", "dc-2"]]);
  });

  it("merges partial, over-received, no-GRN and draft lines", async () => {
    const rows = buildDcReportLineRows(await fetchAllDCsForExport("a", "b", "co-1"));
    const [partial, over, nogrn, draft] = rows;
    expect(partial).toMatchObject({ grn_numbers: "GRN-1, GRN-2", grn_received: 6, grn_accepted: 5, grn_rejected: 1, grn_pending: 4, grn_over_received: null, grn_status: "Partially Received" });
    expect(over).toMatchObject({ grn_received: 12, grn_pending: 0, grn_over_received: 2, grn_status: "Fully Received" });
    expect(nogrn).toMatchObject({ grn_numbers: null, grn_received: 0, grn_pending: 10, grn_over_received: null, grn_status: "Pending" });
    expect(draft).toMatchObject({ grn_numbers: null, grn_received: null, grn_pending: null, grn_over_received: null, grn_status: "Draft" });
    expect(partial.quantity).toBe(10); // existing columns unchanged
  });

  it("throws when the view fetch errors (never exports blank GRN columns)", async () => {
    viewError = new Error("view boom");
    await expect(fetchAllDCsForExport("a", "b", "co-1")).rejects.toThrow("view boom");
  });

  it("throws when a non-draft line is missing from the view", async () => {
    tableData["v_dc_line_balance"] = tableData["v_dc_line_balance"].filter((r) => r.dc_line_item_id !== "l-nogrn");
    await expect(fetchAllDCsForExport("a", "b", "co-1")).rejects.toThrow(/GRN status missing/);
  });
});
