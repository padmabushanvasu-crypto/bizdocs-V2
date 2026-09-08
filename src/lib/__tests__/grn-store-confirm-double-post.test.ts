// Regression tests for the GRN store-confirmation double-post bug.
//
// Live-DB audit found 619 confirmed cases (8 Jun-7 Sep 2026) where a
// single-stage GRN line's accepted_quantity was posted to stock_ledger
// TWICE, both `grn_receipt` / incoming -> free:
//   1) notes "GRN {grn_number} received (single-stage)"   (recordGRNAndUpdatePO)
//   2) notes "GRN {grn_number} store confirmed (partial)" (creditPartialStock)
//
// Root cause: the receipt-time "legacy single-stage" credit in
// recordGRNAndUpdatePO wrote a stock_ledger row without ever setting
// grn_line_items.stock_posted_at, and storeConfirmGRNItems / creditPartialStock
// never checked stock_posted_at before posting again. See
// STOCK_LIFECYCLE_GOVERNANCE.md Sec 2 Stage B for the canonical design (Store
// Confirm is the sole, stock_posted_at-gated poster for a GRN line).
//
// These tests exercise the real exported functions from grn-api.ts against a
// mocked Supabase client, so they fail against the pre-fix code and pass
// against the fix.

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetCompanyId = vi.fn(async () => "company-1");
const mockAddStockLedgerEntry = vi.fn(async () => {});
const mockCreateNotification = vi.fn(async () => {});
const mockUpdateStockBucket = vi.fn(async () => {});
const mockGetNextDocNumber = vi.fn(async () => "GRN-0001");
const mockLogAudit = vi.fn(async () => {});

vi.mock("@/lib/auth-helpers", () => ({
  getCompanyId: mockGetCompanyId,
  sanitizeSearchTerm: (s: string) => s,
}));
vi.mock("@/lib/assembly-orders-api", () => ({
  addStockLedgerEntry: mockAddStockLedgerEntry,
}));
vi.mock("@/lib/notifications-api", () => ({
  createNotification: mockCreateNotification,
}));
vi.mock("@/lib/items-api", () => ({
  updateStockBucket: mockUpdateStockBucket,
}));
vi.mock("@/lib/doc-number-utils", () => ({
  getNextDocNumber: mockGetNextDocNumber,
}));
vi.mock("@/lib/audit-api", () => ({
  logAudit: mockLogAudit,
}));

// ---------------------------------------------------------------------------
// Minimal fake Postgres/Supabase-JS layer.
//
// Backs `items`, `grn_line_items`, `grns`, `stock_ledger` with plain in-memory
// tables and a chainable query builder good enough for the exact call shapes
// grn-api.ts makes (select/eq/neq/in/gt/is/order/limit/single + update, plus
// .rpc()). `rpc('rpc_credit_partial_stock', ...)` re-implements just enough of
// the live Postgres function (see supabase/migrations/20260908000001_*.sql)
// to move stock_free and append a stock_ledger row — including the
// stock_posted_at guard being verified here.
// ---------------------------------------------------------------------------

interface FakeItem { id: string; item_code: string; description: string; current_stock: number; stock_free: number; stock_in_process: number; }
interface FakeGrnLine {
  id: string; grn_id: string; item_id: string | null; description: string | null;
  drawing_number: string | null; conforming_qty: number; store_confirmed_qty: number;
  damaged_qty: number; store_confirmed: boolean; dc_line_item_id: string | null;
  stock_posted_at: string | null; is_final_grn: boolean;
}
interface FakeGrn { id: string; grn_number: string; grn_type: string; linked_dc_id: string | null; company_id: string; store_confirmed: boolean; }
interface FakeLedgerRow { item_id: string; transaction_type: string; qty_in: number; from_state: string; to_state: string; notes: string; }

function createFakeDb() {
  const items = new Map<string, FakeItem>();
  const grnLines = new Map<string, FakeGrnLine>();
  const grns = new Map<string, FakeGrn>();
  const stockLedger: FakeLedgerRow[] = [];
  return { items, grnLines, grns, stockLedger };
}

type FakeDb = ReturnType<typeof createFakeDb>;

function buildSupabaseMock(db: FakeDb) {
  function resolveSelect(table: string, filters: Record<string, any>, single: boolean) {
    let rows: any[] = [];
    if (table === "items") rows = [...db.items.values()];
    if (table === "grn_line_items") rows = [...db.grnLines.values()];
    if (table === "grns") rows = [...db.grns.values()];
    if (table === "dc_line_items") rows = [];
    if (table === "mir_line_items") rows = [];

    for (const [key, val] of Object.entries(filters)) {
      if (key.startsWith("neq_")) {
        const col = key.slice(4);
        rows = rows.filter((r) => r[col] !== val);
      } else if (key.startsWith("gt_")) {
        const col = key.slice(3);
        rows = rows.filter((r) => r[col] > val);
      } else if (key === "__in__") {
        const { col, vals } = val as { col: string; vals: any[] };
        rows = rows.filter((r) => vals.includes(r[col]));
      } else {
        rows = rows.filter((r) => r[key] === val);
      }
    }

    if (single) {
      const row = rows[0] ?? null;
      return { data: row, error: row ? null : { message: `${table}: not found` } };
    }
    return { data: rows, error: null };
  }

  function applyUpdate(table: string, filters: Record<string, any>, payload: Record<string, any>) {
    const { data } = resolveSelect(table, filters, false);
    for (const row of data as any[]) {
      const store = table === "items" ? db.items : table === "grn_line_items" ? db.grnLines : db.grns;
      Object.assign((store as Map<string, any>).get(row.id), payload);
    }
    return { data: null, error: null };
  }

  function from(table: string) {
    const filters: Record<string, any> = {};
    let method: "select" | "update" | null = null;
    let payload: Record<string, any> = {};

    const builder: any = {
      select() { method = method ?? "select"; return builder; },
      update(p: Record<string, any>) { method = "update"; payload = p; return builder; },
      eq(col: string, val: any) { filters[col] = val; return builder; },
      neq(col: string, val: any) { filters[`neq_${col}`] = val; return builder; },
      gt(col: string, val: any) { filters[`gt_${col}`] = val; return builder; },
      in(col: string, vals: any[]) { filters.__in__ = { col, vals }; return builder; },
      is() { return builder; },
      order() { return builder; },
      limit() { return builder; },
      not() { return builder; },
      or() { return builder; },
      single() {
        return Promise.resolve(resolveSelect(table, filters, true));
      },
      then(onFulfilled: any, onRejected: any) {
        const result = method === "update"
          ? applyUpdate(table, filters, payload)
          : resolveSelect(table, filters, false);
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  const rpc = vi.fn(async (fnName: string, args: any) => {
    if (fnName === "rpc_record_grn") {
      const grnId = "grn-1";
      db.grns.set(grnId, {
        id: grnId,
        grn_number: args.p_grn.grn_number || "GRN-0001",
        grn_type: args.p_grn.grn_type ?? "po_grn",
        linked_dc_id: args.p_grn.linked_dc_id ?? null,
        company_id: args.p_company_id,
        store_confirmed: false,
      });
      return { data: { id: grnId, grn_number: "GRN-0001" }, error: null };
    }

    if (fnName === "rpc_credit_partial_stock") {
      // Mirrors supabase/migrations/20260908000001_grn_credit_partial_stock_posted_at_guard.sql
      const line = db.grnLines.get(args.p_line_id);
      if (line?.stock_posted_at) {
        return {
          data: null,
          error: { message: `rpc_credit_partial_stock: grn_line_item ${args.p_line_id} already stock-posted at ${line.stock_posted_at} — refusing to post stock again (grn ${args.p_grn_id}).` },
        };
      }
      const item = db.items.get(args.p_item_id);
      if (!item) return { data: null, error: { message: "item not found" } };
      item.stock_free += args.p_store_qty;
      db.stockLedger.push({
        item_id: item.id,
        transaction_type: "grn_receipt",
        qty_in: args.p_store_qty,
        from_state: "incoming",
        to_state: "free",
        notes: `GRN ${args.p_grn_number ?? ""} store confirmed (partial)`.trim(),
      });
      return {
        data: [{ out_resolved_item_id: item.id, out_item_code: item.item_code, out_is_dc_return: false, out_new_free: item.stock_free, out_new_in_process: item.stock_in_process }],
        error: null,
      };
    }

    if (fnName === "rpc_confirm_grn_store") return { data: null, error: null };
    throw new Error(`unmocked rpc: ${fnName}`);
  });

  return { from, rpc };
}

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return globalThis.__FAKE_SUPABASE__;
  },
}));

let db: FakeDb;

beforeEach(() => {
  vi.clearAllMocks();
  db = createFakeDb();
  (globalThis as any).__FAKE_SUPABASE__ = buildSupabaseMock(db);
});

describe("GRN store-confirmation double-post fix", () => {
  it("receipt-time single-stage credit no longer writes a stock_ledger entry (was the duplicate)", async () => {
    const { recordGRNAndUpdatePO } = await import("@/lib/grn-api");

    db.items.set("item-1", {
      id: "item-1", item_code: "ITEM-1", description: "Test item",
      current_stock: 0, stock_free: 0, stock_in_process: 0,
    });

    await recordGRNAndUpdatePO({
      grn: { grn_number: "", grn_date: "2026-09-08", grn_type: "po_grn" } as any,
      lineItems: [
        {
          item_id: "item-1",
          drawing_number: "DRW-1",
          description: "Test item",
          accepted_quantity: 10,
        } as any,
      ],
    });

    // The old "received (single-stage)" ledger write is gone entirely — Store
    // Confirm (creditPartialStock -> rpc_credit_partial_stock) is now the
    // sole poster. This assertion fails against the pre-fix code, which
    // called addStockLedgerEntry here with notes "... received (single-stage)".
    expect(mockAddStockLedgerEntry).not.toHaveBeenCalled();

    // The legacy current_stock bump (unrelated to stock_free/ledger, kept for
    // "storekeeper sees it immediately") still happens — no workflow change.
    expect(db.items.get("item-1")?.current_stock).toBe(10);
    // stock_free is untouched at receipt time, exactly as before this fix.
    expect(db.items.get("item-1")?.stock_free).toBe(0);
  });

  it("reproduces the full single-stage flow end-to-end and credits stock_free exactly once", async () => {
    const { recordGRNAndUpdatePO, storeConfirmGRNItems } = await import("@/lib/grn-api");

    db.items.set("item-1", {
      id: "item-1", item_code: "ITEM-1", description: "Test item",
      current_stock: 0, stock_free: 0, stock_in_process: 0,
    });

    await recordGRNAndUpdatePO({
      grn: { grn_number: "", grn_date: "2026-09-08", grn_type: "po_grn" } as any,
      lineItems: [{ item_id: "item-1", drawing_number: "DRW-1", description: "Test item", accepted_quantity: 10 } as any],
    });

    db.grnLines.set("line-1", {
      id: "line-1", grn_id: "grn-1", item_id: "item-1", description: "Test item",
      drawing_number: "DRW-1", conforming_qty: 10, store_confirmed_qty: 0, damaged_qty: 0,
      store_confirmed: false, dc_line_item_id: null, stock_posted_at: null, is_final_grn: true,
    });

    const result = await storeConfirmGRNItems(
      "grn-1",
      [{ id: "line-1", storeQty: 10 }],
      { confirmedBy: "storekeeper-1", confirmedAt: "2026-09-08T10:00:00Z" }
    );

    expect(result.fullyConfirmed).toEqual(["line-1"]);

    const supabase = (globalThis as any).__FAKE_SUPABASE__;
    const creditCalls = supabase.rpc.mock.calls.filter((c: any[]) => c[0] === "rpc_credit_partial_stock");
    expect(creditCalls).toHaveLength(1);

    // Exactly one stock_ledger row for this receipt, not two.
    expect(db.stockLedger).toHaveLength(1);
    expect(db.stockLedger[0]).toMatchObject({ item_id: "item-1", qty_in: 10, from_state: "incoming", to_state: "free" });

    expect(db.items.get("item-1")?.stock_free).toBe(10);
    expect(db.grnLines.get("line-1")?.stock_posted_at).toBeTruthy();
  });

  it("refuses to re-credit stock for a line already marked stock_posted_at (defense-in-depth guard)", async () => {
    const { storeConfirmGRNItems } = await import("@/lib/grn-api");

    db.items.set("item-1", {
      id: "item-1", item_code: "ITEM-1", description: "Test item",
      current_stock: 10, stock_free: 10, stock_in_process: 0,
    });
    db.grns.set("grn-1", {
      id: "grn-1", grn_number: "GRN-0001", grn_type: "po_grn", linked_dc_id: null,
      company_id: "company-1", store_confirmed: false,
    });
    // Simulates a line whose stock was already posted through some other path
    // (e.g. the historical receipt-time bug, or a retried confirm call).
    db.grnLines.set("line-1", {
      id: "line-1", grn_id: "grn-1", item_id: "item-1", description: "Test item",
      drawing_number: "DRW-1", conforming_qty: 10, store_confirmed_qty: 0, damaged_qty: 0,
      store_confirmed: false, dc_line_item_id: null,
      stock_posted_at: "2026-09-07T09:00:00Z", is_final_grn: true,
    });

    const result = await storeConfirmGRNItems(
      "grn-1",
      [{ id: "line-1", storeQty: 10 }],
      { confirmedBy: "storekeeper-1", confirmedAt: "2026-09-08T10:00:00Z" }
    );

    // Confirmation metadata still applies (option (a): no-op on the stock
    // side, but the storekeeper's confirmation is still recorded).
    expect(result.fullyConfirmed).toEqual(["line-1"]);
    expect(db.grnLines.get("line-1")?.store_confirmed_qty).toBe(10);

    // But stock is NOT credited again: no rpc_credit_partial_stock call, no
    // stock_free change, no new ledger row. This assertion fails against the
    // pre-fix code, which called creditPartialStock unconditionally whenever
    // storeQty > 0, with no stock_posted_at check at all.
    const supabase = (globalThis as any).__FAKE_SUPABASE__;
    const creditCalls = supabase.rpc.mock.calls.filter((c: any[]) => c[0] === "rpc_credit_partial_stock");
    expect(creditCalls).toHaveLength(0);
    expect(db.stockLedger).toHaveLength(0);
    expect(db.items.get("item-1")?.stock_free).toBe(10);
  });
});
