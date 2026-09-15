import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression test for the live stock-reversal skip on GRN-26-27/2145
// (deleted 15 Sep 2026, fixed manually in DB): softDeleteGRN's
// stock-reversal logic computed the credited quantity as
//   const qty = line.accepted_qty ?? line.accepted_quantity ?? 0;
// `??` only falls through on null/undefined, not on 0. A GRN line still at
// Stage 1 (pre-QC) has accepted_qty = 0 (correct, real field) while the
// legacy accepted_quantity holds the actual amount credited to stock via the
// Stage-1 "legacy single-stage credit" path in recordGRNAndUpdatePO. Since
// 0 ?? anything = 0, the reversal silently computed "nothing to reverse" and
// skipped it — even though a real grn_receipt stock_ledger row existed and
// real stock had been posted. Confirmed live: accepted_qty was 0,
// accepted_quantity was 292, a real 292 grn_receipt ledger entry existed.
//
// The fix reads the authoritative posted amount directly from stock_ledger
// (transaction_type in ['grn_receipt','dc_return'], reference_id = this
// GRN's id, item_id = this line's item_id) instead of inferring it from
// either grn_line_items column, sidestepping the whole dual-schema-mismatch
// class of bug.
//
// This test exercises the real, exported softDeleteGRN against a fake
// Postgrest client for a Stage-1-only GRN line (accepted_qty unset,
// accepted_quantity > 0, a real grn_receipt ledger entry present) and
// asserts the credited quantity IS reversed: a compensating ledger row and
// a stock_free bucket decrement, both for the full 292.

const rpcCalls: Array<{ name: string; args: any }> = [];

const testLine = {
  item_id: "item-1",
  drawing_number: "DWG-1",
  description: "Test Item",
};

const testItemRow = {
  id: "item-1",
  item_code: "CODE1",
  description: "Test Item",
  stock_free: 500,
};

// Mutable per-test — the whole point of this suite is what softDeleteGRN
// does for different stock_ledger contents against the SAME grn_line_items
// row, so this is read live (closure) by the mock, not snapshotted.
let ledgerCreditRows: Array<{ item_id: string; qty_in: number; qty_out: number }>;

function makeSelectChain(resolve: () => { data: any; error: any }) {
  const chain: any = {};
  for (const m of ["eq", "neq", "in", "gt", "gte", "ilike", "order", "limit"]) chain[m] = () => chain;
  chain.single = () => Promise.resolve(resolve());
  chain.maybeSingle = () => Promise.resolve(resolve());
  chain.then = (onF: any, onR: any) => Promise.resolve(resolve()).then(onF, onR);
  return chain;
}

function makeUpdateChain(_table: string) {
  const chain: any = {};
  chain.eq = () => Promise.resolve({ error: null });
  return chain;
}

vi.mock("@/integrations/supabase/client", () => {
  const supabase = {
    from: (table: string) => ({
      select: (cols: string) =>
        makeSelectChain(() => {
          if (table === "grn_line_items" && cols === "item_id, drawing_number, description") {
            // softDeleteGRN's reversal-candidate line read — Stage-1-only,
            // no accepted_qty/accepted_quantity in this select at all now.
            return { data: [testLine], error: null };
          }
          if (table === "stock_ledger") {
            // The authoritative source: whatever grn_receipt/dc_return rows
            // this GRN actually posted, per test.
            return { data: ledgerCreditRows, error: null };
          }
          if (table === "items") {
            return { data: [testItemRow], error: null };
          }
          if (table === "grns" && cols === "po_id, grn_type") {
            // po_id absent — skip the PO-rewind branch, out of scope here.
            return { data: { po_id: null, grn_type: "po_grn" }, error: null };
          }
          return { data: [], error: null };
        }),
      update: (_payload: any) => makeUpdateChain(table),
    }),
    rpc: (name: string, args: any) => {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: null, error: null });
    },
  };
  return { supabase };
});

vi.mock("@/lib/auth-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-helpers")>();
  return { ...actual, getCompanyId: vi.fn().mockResolvedValue("company-1") };
});

import { softDeleteGRN } from "@/lib/grn-api";

describe("GRN soft-delete stock reversal (Stage-1-only GRN)", () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    // Default fixture: the real live scenario — a single 292-unit
    // grn_receipt credit row, matching GRN-26-27/2145.
    ledgerCreditRows = [{ item_id: "item-1", qty_in: 292, qty_out: 0 }];
  });

  it("reverses the ledger-credited amount, not the (unset) accepted_qty column", async () => {
    await softDeleteGRN("grn-1", {
      deletion_reason: "test",
      stockAction: "return_to_vendor",
    });

    const ledgerPost = rpcCalls.find((c) => c.name === "rpc_post_stock_ledger_row");
    expect(ledgerPost).toBeTruthy(); // the bug: this used to never be called
    expect(ledgerPost!.args.p_item_id).toBe("item-1");
    expect(ledgerPost!.args.p_qty_out).toBe(292);
    expect(ledgerPost!.args.p_qty_in).toBe(0);

    const bucketUpdate = rpcCalls.find((c) => c.name === "rpc_update_stock_bucket");
    expect(bucketUpdate).toBeTruthy();
    expect(bucketUpdate!.args.p_item_id).toBe("item-1");
    expect(bucketUpdate!.args.p_bucket).toBe("free");
    expect(bucketUpdate!.args.p_delta).toBe(-292); // full reversal, not skipped
  });

  it("sums multiple grn_receipt increments for the same item (partial store-confirms)", async () => {
    // The credit for one item can be spread across more than one ledger row
    // (e.g. two partial store-confirms) — the reversal must be the true
    // total actually credited, not just the first row found.
    ledgerCreditRows = [
      { item_id: "item-1", qty_in: 100, qty_out: 0 },
      { item_id: "item-1", qty_in: 192, qty_out: 0 },
    ];

    await softDeleteGRN("grn-1", { deletion_reason: "test", stockAction: "return_to_vendor" });

    const bucketUpdate = rpcCalls.find((c) => c.name === "rpc_update_stock_bucket");
    expect(bucketUpdate!.args.p_delta).toBe(-292);
  });

  it("skips the item when no grn_receipt/dc_return ledger row exists (nothing was ever credited)", async () => {
    // e.g. a fully-rejected line — no stock was ever credited for it, so
    // there must be nothing to reverse and no write at all.
    ledgerCreditRows = [];

    await softDeleteGRN("grn-1", { deletion_reason: "test", stockAction: "return_to_vendor" });

    expect(rpcCalls.find((c) => c.name === "rpc_post_stock_ledger_row")).toBeUndefined();
    expect(rpcCalls.find((c) => c.name === "rpc_update_stock_bucket")).toBeUndefined();
  });
});
