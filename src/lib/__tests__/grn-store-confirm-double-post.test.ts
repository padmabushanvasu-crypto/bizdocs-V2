import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression test for the live GRN store-confirmation double-post bug
// (619 confirmed instances, 8 Jun-7 Sep 2026): a single-stage GRN line got
// credited to stock_ledger once at receipt time (recordGRNAndUpdatePO's
// legacy "received (single-stage)" leg) and again at Store Confirm
// ("store confirmed (partial)"), both incoming->free, same qty — because
// grn_line_items.stock_posted_at was never set by the receipt-time path,
// so Store Confirm had no way to know the line was already credited.
//
// This test exercises the real, exported functions end-to-end against a
// fake Postgrest client: recordGRNAndUpdatePO (creation, single-stage
// credit) followed by storeConfirmGRNItems (store confirm) for the SAME
// line, and asserts rpc_credit_partial_stock is called at most once.

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

  it("does not re-credit stock at Store Confirm for a line already credited at receipt", async () => {
    // 1. GRN creation — fires the legacy single-stage credit and (with the fix)
    //    stamps stock_posted_at on the line.
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

    expect(rpcCalls.filter((c) => c.name === "rpc_post_stock_ledger_row")).toHaveLength(1);
    expect(testLine.stock_posted_at).toBeTruthy(); // the fix: this must now be set

    // 2. Store Confirm on the same line — must NOT post a second credit.
    await storeConfirmGRNItems(
      "grn-1",
      [{ id: "line-1", storeQty: 10 }],
      { confirmedBy: "tester", confirmedAt: "2026-09-08T10:00:00.000Z" }
    );

    const creditCalls = rpcCalls.filter((c) => c.name === "rpc_credit_partial_stock");
    expect(creditCalls).toHaveLength(0); // the bug: this used to be 1, double-posting

    // Confirmation metadata must still update normally — Store Confirm isn't a no-op overall.
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
