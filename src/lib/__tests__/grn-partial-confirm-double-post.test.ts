import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression test for the second GRN double-post bug: the SAME "store
// confirmed (partial)" event recorded twice for the same quantity — a
// re-submitted PARTIAL confirmation (double-click, a client retry after a
// network blip), not the single-stage/store-confirm pair already fixed in
// fix/grn-store-confirm-double-post. 36-37 confirmed duplicate pairs live,
// same GRN+item+qty, 2-8 seconds apart, since 26 May 2026.
//
// Root cause: grn_line_items.stock_posted_at (the guard from the first fix)
// is only set at FULL confirmation, so it does not protect a partial
// confirmation that gets re-submitted before it completes. This test
// exercises the real, exported storeConfirmGRNItems twice in a row with an
// identical partial payload and asserts the stock RPC fires only once.

const rpcCalls: Array<{ name: string; args: any }> = [];
type LedgerRow = {
  item_id: string;
  reference_id: string;
  reference_type: string;
  transaction_type: string;
  qty_in: number;
  notes: string;
  created_at: string;
};
let stockLedgerRows: LedgerRow[];
let testLine: any;

function makeQueryChain(resolve: (filters: Record<string, any>) => { data: any; error: any }) {
  const filters: Record<string, any> = {};
  const chain: any = {
    eq: (k: string, v: any) => { filters[k] = v; return chain; },
    neq: (k: string, v: any) => { filters[`${k}__neq`] = v; return chain; },
    ilike: (k: string, v: any) => { filters[k] = v; return chain; },
    gte: (k: string, v: any) => { filters[`${k}__gte`] = v; return chain; },
    gt: (k: string, v: any) => { filters[`${k}__gt`] = v; return chain; },
    in: (k: string, v: any) => { filters[k] = v; return chain; },
    order: () => chain,
    limit: () => chain,
    single: () => Promise.resolve(resolve(filters)),
    then: (onF: any, onR: any) => Promise.resolve(resolve(filters)).then(onF, onR),
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => {
  const supabase = {
    from: (table: string) => ({
      select: (cols: string) =>
        makeQueryChain((filters) => {
          if (table === "grn_line_items" && cols === "id") {
            // "remaining open lines" recompute in storeConfirmGRNItems — return
            // non-empty so it takes the simple "partial GRN" branch.
            return { data: [{ id: "some-other-line" }], error: null };
          }
          if (table === "grn_line_items") {
            return { data: [{ ...testLine }], error: null };
          }
          if (table === "grns") {
            return { data: { grn_type: "po_grn", grn_number: "GRN-TEST-1", linked_dc_id: null, company_id: "company-1" }, error: null };
          }
          if (table === "stock_ledger") {
            const match = stockLedgerRows.find((r) =>
              r.reference_type === filters["reference_type"] &&
              r.reference_id === filters["reference_id"] &&
              r.transaction_type === filters["transaction_type"] &&
              r.qty_in === filters["qty_in"] &&
              (filters["item_id"] === undefined || r.item_id === filters["item_id"]) &&
              r.created_at >= filters["created_at__gte"] &&
              r.notes.includes("store confirmed (partial)")
            );
            return { data: match ? [match] : [], error: null };
          }
          return { data: [], error: null };
        }),
      update: (payload: any) => ({
        eq: () => {
          if (table === "grn_line_items") Object.assign(testLine, payload);
          return Promise.resolve({ error: null });
        },
      }),
    }),
    rpc: (name: string, args: any) => {
      rpcCalls.push({ name, args });
      if (name === "rpc_credit_partial_stock") {
        stockLedgerRows.push({
          item_id: args.p_item_id,
          reference_id: args.p_grn_id,
          reference_type: "grn",
          transaction_type: "grn_receipt",
          qty_in: args.p_store_qty,
          notes: `GRN ${args.p_grn_number} store confirmed (partial)`,
          created_at: new Date().toISOString(),
        });
        return Promise.resolve({
          data: [{ out_resolved_item_id: args.p_item_id, out_item_code: "CODE1", out_is_dc_return: false, out_new_free: 999, out_new_in_process: 0 }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
  return { supabase };
});

vi.mock("@/lib/auth-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-helpers")>();
  return { ...actual, getCompanyId: vi.fn().mockResolvedValue("company-1") };
});

import { storeConfirmGRNItems } from "@/lib/grn-api";

describe("GRN partial-confirm double-post regression", () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    stockLedgerRows = [];
    testLine = {
      id: "line-1",
      grn_id: "grn-1",
      item_id: "item-1",
      description: "Test Item",
      drawing_number: "DWG-1",
      conforming_qty: 20, // well above storeQty=6: this stays a PARTIAL confirmation
      store_confirmed_qty: 0,
      damaged_qty: 0,
      store_confirmed: false,
      dc_line_item_id: null,
      stock_posted_at: null,
    };
  });

  it("does not double-post when the same partial confirmation is re-submitted seconds later", async () => {
    await storeConfirmGRNItems("grn-1", [{ id: "line-1", storeQty: 6 }], { confirmedBy: "tester", confirmedAt: "2026-09-08T10:00:00.000Z" });
    // Simulates a double-click / client retry: the exact same call again, moments later.
    await storeConfirmGRNItems("grn-1", [{ id: "line-1", storeQty: 6 }], { confirmedBy: "tester", confirmedAt: "2026-09-08T10:00:00.000Z" });

    const creditCalls = rpcCalls.filter((c) => c.name === "rpc_credit_partial_stock");
    expect(creditCalls).toHaveLength(1); // the bug: this used to be 2
  });

  it("still posts a genuinely separate partial confirmation of the same qty outside the dedup window", async () => {
    await storeConfirmGRNItems("grn-1", [{ id: "line-1", storeQty: 6 }], { confirmedBy: "tester", confirmedAt: "2026-09-08T10:00:00.000Z" });
    expect(stockLedgerRows).toHaveLength(1);

    // Age the prior posting past the dedup window, simulating a real separate
    // confirmation submitted later (not a rapid re-submit).
    stockLedgerRows[0].created_at = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    await storeConfirmGRNItems("grn-1", [{ id: "line-1", storeQty: 6 }], { confirmedBy: "tester", confirmedAt: "2026-09-08T10:05:00.000Z" });

    const creditCalls = rpcCalls.filter((c) => c.name === "rpc_credit_partial_stock");
    expect(creditCalls).toHaveLength(2); // both legitimate, must not be suppressed
  });

  it("still posts a separate partial confirmation of a DIFFERENT quantity within the window", async () => {
    await storeConfirmGRNItems("grn-1", [{ id: "line-1", storeQty: 6 }], { confirmedBy: "tester", confirmedAt: "2026-09-08T10:00:00.000Z" });
    await storeConfirmGRNItems("grn-1", [{ id: "line-1", storeQty: 4 }], { confirmedBy: "tester", confirmedAt: "2026-09-08T10:00:05.000Z" });

    const creditCalls = rpcCalls.filter((c) => c.name === "rpc_credit_partial_stock");
    expect(creditCalls).toHaveLength(2); // different qty is never the same confirmation
  });
});
