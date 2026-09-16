import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression test, updated 2026-09-15: recordGRNAndUpdatePO's legacy
// "received (single-stage)" receipt-time credit was removed (is_final_grn
// leak fix — it credited stock_free for every line before QC/is_final_grn
// was ever decided, structurally bypassing the governed flow). The original
// double-post bug this file guarded (619 confirmed instances, 8 Jun-7 Sep
// 2026: the legacy leg and Store Confirm both crediting the same line) can no
// longer occur, since only one code path credits stock now. This test now
// asserts: recordGRNAndUpdatePO never touches the stock ledger or
// stock_posted_at, and storeConfirmGRNItems remains the sole, correctly
// single-firing credit path for a freshly-created line.
//
// Updated again 2026-09-16 (non-final stock routing fix): the QC-completion
// credit pass that used to fire for non-final lines is now deleted outright
// (not merely re-gated), so the "sole credit path" claim above extends to
// non-final lines too, not just is_final_grn=true ones. See
// grn-non-final-stock-routing.test.ts, grn-store-confirm-nonfinal-open.test.ts,
// and grn-store-queue-non-final.test.ts for the routing-specific coverage
// (stage transition, closure check, and store-queue visibility).

const rpcCalls: Array<{ name: string; args: any }> = [];
const grnLineUpdateCalls: Array<{ payload: any }> = [];

// Mutable fixture standing in for one grn_line_items row across both calls —
// recordGRNAndUpdatePO's stamp-write and storeConfirmGRNItems's initial read
// both go through this same object, exactly like two round-trips to one DB row.
let testLine: any;
let testItem: any;

function makeSelectChain(resolve: () => { data: any; error: any }) {
  const chain: any = {};
  for (const m of ["eq", "neq", "in", "gt", "gte", "ilike", "order", "limit"]) chain[m] = () => chain;
  chain.single = () => Promise.resolve(resolve());
  chain.then = (onF: any, onR: any) => Promise.resolve(resolve()).then(onF, onR);
  return chain;
}

function makeUpdateChain(table: string, payload: any) {
  const chain: any = {};
  chain.eq = () => {
    if (table === "grn_line_items") {
      grnLineUpdateCalls.push({ payload });
      Object.assign(testLine, payload);
    } else if (table === "items") {
      Object.assign(testItem, payload);
    }
    return Promise.resolve({ error: null });
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => {
  const supabase = {
    from: (table: string) => ({
      select: (cols: string) =>
        makeSelectChain(() => {
          if (table === "grn_line_items" && cols === "id, serial_number") {
            // recordGRNAndUpdatePO's read-back after rpc_record_grn.
            return { data: [{ id: testLine.id, serial_number: testLine.serial_number }], error: null };
          }
          if (table === "grn_line_items" && cols === "id") {
            // storeConfirmGRNItems's "remaining open lines" recompute — return
            // non-empty so it takes the simple "partial" branch, not the full
            // storeConfirmGRN close ceremony (out of scope for this test).
            return { data: [{ id: "some-other-line" }], error: null };
          }
          if (table === "grn_line_items") {
            // storeConfirmGRNItems's initial currentLines fetch.
            return { data: [{ ...testLine }], error: null };
          }
          if (table === "items") {
            return { data: [{ ...testItem }], error: null };
          }
          if (table === "grns") {
            return { data: { grn_type: "po_grn", grn_number: "GRN-TEST-1", linked_dc_id: null, company_id: "company-1" }, error: null };
          }
          return { data: [], error: null };
        }),
      update: (payload: any) => makeUpdateChain(table, payload),
    }),
    rpc: (name: string, args: any) => {
      rpcCalls.push({ name, args });
      if (name === "rpc_record_grn") {
        return Promise.resolve({ data: { id: testLine.grn_id, grn_number: "GRN-TEST-1" }, error: null });
      }
      if (name === "rpc_post_stock_ledger_row") {
        return Promise.resolve({ data: [{ out_id: "ledger-row-1", out_balance_qty: 0 }], error: null });
      }
      if (name === "rpc_credit_partial_stock") {
        return Promise.resolve({
          data: [{ out_resolved_item_id: testItem.id, out_item_code: testItem.item_code, out_is_dc_return: false, out_new_free: 110, out_new_in_process: 0 }],
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

import { recordGRNAndUpdatePO, storeConfirmGRNItems } from "@/lib/grn-api";

describe("GRN store-confirm double-post regression (single-stage GRN)", () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    grnLineUpdateCalls.length = 0;
    testItem = { id: "item-1", item_code: "CODE1", description: "Test Item", current_stock: 100 };
    testLine = {
      id: "line-1",
      grn_id: "grn-1",
      serial_number: 1,
      item_id: "item-1",
      description: "Test Item",
      drawing_number: "DWG-1",
      conforming_qty: 10,
      store_confirmed_qty: 0,
      damaged_qty: 0,
      store_confirmed: false,
      dc_line_item_id: null,
      stock_posted_at: null,
    };
  });

  it("recordGRNAndUpdatePO no longer credits stock or stamps stock_posted_at at creation", async () => {
    await recordGRNAndUpdatePO({
      grn: { grn_number: "GRN-TEST-1", grn_date: "2026-09-08" } as any,
      lineItems: [
        {
          serial_number: 1,
          item_id: "item-1",
          description: "Test Item",
          drawing_number: "DWG-1",
          unit: "NOS",
          po_quantity: 10,
          previously_received: 0,
          pending_quantity: 0,
          receiving_now: 10,
          accepted_quantity: 10,
          rejected_quantity: 0,
        } as any,
      ],
    });

    expect(rpcCalls.filter((c) => c.name === "rpc_post_stock_ledger_row")).toHaveLength(0);
    expect(rpcCalls.filter((c) => c.name === "rpc_credit_partial_stock")).toHaveLength(0);
    expect(testLine.stock_posted_at).toBeFalsy();

    // Store Confirm on the same, never-posted line — must post exactly once,
    // since nothing credited it earlier.
    await storeConfirmGRNItems(
      "grn-1",
      [{ id: "line-1", storeQty: 10 }],
      { confirmedBy: "tester", confirmedAt: "2026-09-08T10:00:00.000Z" }
    );

    const creditCalls = rpcCalls.filter((c) => c.name === "rpc_credit_partial_stock");
    expect(creditCalls).toHaveLength(1);

    // Confirmation metadata must still update normally.
    const confirmUpdate = grnLineUpdateCalls.find((c) => c.payload.store_confirmed === true);
    expect(confirmUpdate).toBeTruthy();
    expect(confirmUpdate!.payload.store_confirmed_qty).toBe(10);
  });

  it("still credits normally when the line has not been posted yet", async () => {
    // No receipt-time credit happened (stock_posted_at stays null) — Store
    // Confirm must still post exactly once. Guards against the fix being too
    // aggressive and breaking the legitimate, common path.
    await storeConfirmGRNItems(
      "grn-1",
      [{ id: "line-1", storeQty: 10 }],
      { confirmedBy: "tester", confirmedAt: "2026-09-08T10:00:00.000Z" }
    );

    const creditCalls = rpcCalls.filter((c) => c.name === "rpc_credit_partial_stock");
    expect(creditCalls).toHaveLength(1);
    expect(creditCalls[0].args.p_store_qty).toBe(10);
  });
});
