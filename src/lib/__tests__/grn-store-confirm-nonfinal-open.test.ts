import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression test for the storeConfirmGRNItems closure-check fix (target
// rule, Sep 2026): the "is this GRN fully confirmed" recompute used to filter
// remaining lines to is_final_grn = true, so a GRN with only non-final lines
// still open would incorrectly report itself as fully confirmed and run the
// close ceremony (grn_stage -> 'closed'). It must now require every line
// confirmed, final or not.

const grnUpdateCalls: Array<{ payload: any }> = [];
const grnLineUpdateCalls: Array<{ payload: any }> = [];
const remainingLinesCalls: Array<{ method: string; args: any[] }> = [];

let testLineA: any;

function makeSelectChain(resolve: () => { data: any; error: any }) {
  const chain: any = {};
  for (const m of ["eq", "neq", "in", "gt", "gte", "ilike", "order", "limit"]) chain[m] = () => chain;
  chain.single = () => Promise.resolve(resolve());
  chain.then = (onF: any, onR: any) => Promise.resolve(resolve()).then(onF, onR);
  return chain;
}

// Spy-only chain for the "remaining open lines" recompute (select('id') on
// grn_line_items) — records every filter call so the test can assert
// is_final_grn is never one of them, then resolves as if one other
// (non-final) line on this GRN is still unconfirmed.
function makeRemainingLinesChain() {
  const chain: any = {};
  for (const m of ["eq", "neq", "in", "gt", "gte", "ilike", "order", "limit"]) {
    chain[m] = (...args: any[]) => {
      remainingLinesCalls.push({ method: m, args });
      return chain;
    };
  }
  chain.then = (onF: any, onR: any) =>
    Promise.resolve({ data: [{ id: "line-B-open-nonfinal" }], error: null }).then(onF, onR);
  return chain;
}

function makeUpdateChain(table: string, payload: any) {
  const chain: any = {};
  chain.eq = () => {
    if (table === "grn_line_items") {
      grnLineUpdateCalls.push({ payload });
      Object.assign(testLineA, payload);
    } else if (table === "grns") {
      grnUpdateCalls.push({ payload });
    }
    return Promise.resolve({ error: null });
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => {
  const supabase = {
    from: (table: string) => ({
      select: (cols: string) => {
        if (table === "grn_line_items" && cols === "id") {
          return makeRemainingLinesChain();
        }
        return makeSelectChain(() => {
          if (table === "grn_line_items") {
            // storeConfirmGRNItems's initial currentLines fetch — only the
            // line being confirmed in this call.
            return { data: [{ ...testLineA }], error: null };
          }
          if (table === "grns") {
            return {
              data: { grn_type: "po_grn", grn_number: "GRN-NF-CLOSE", linked_dc_id: null, company_id: "company-1" },
              error: null,
            };
          }
          return { data: [], error: null };
        });
      },
      update: (payload: any) => makeUpdateChain(table, payload),
    }),
    rpc: (name: string, _args: any) => {
      if (name === "rpc_credit_partial_stock") {
        return Promise.resolve({
          data: [{ out_resolved_item_id: "item-A", out_item_code: "CODE-A", out_is_dc_return: false, out_new_free: 10, out_new_in_process: 0 }],
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

describe("storeConfirmGRNItems: closure check no longer scoped to final lines", () => {
  beforeEach(() => {
    grnUpdateCalls.length = 0;
    grnLineUpdateCalls.length = 0;
    remainingLinesCalls.length = 0;
    testLineA = {
      id: "line-A",
      grn_id: "grn-NF-CLOSE",
      item_id: "item-A",
      description: "Line A (fully confirmed this call)",
      drawing_number: "DWG-A",
      conforming_qty: 10,
      store_confirmed_qty: 0,
      damaged_qty: 0,
      store_confirmed: false,
      dc_line_item_id: null,
      stock_posted_at: null,
    };
  });

  it("does not close the GRN while a non-final line remains unconfirmed", async () => {
    const result = await storeConfirmGRNItems(
      "grn-NF-CLOSE",
      [{ id: "line-A", storeQty: 10 }],
      { confirmedBy: "tester", confirmedAt: "2026-09-16T10:00:00.000Z" }
    );

    expect(result.fullyConfirmed).toEqual(["line-A"]);

    // Regression sentinel: the "remaining lines" recompute must never filter
    // on is_final_grn — only store_confirmed.
    expect(
      remainingLinesCalls.some((c) => c.method === "eq" && c.args[0] === "is_final_grn")
    ).toBe(false);

    // Since a (non-final) line is still open, the GRN must NOT be closed...
    const closeUpdate = grnUpdateCalls.find((c) => c.payload.grn_stage === "closed");
    expect(closeUpdate).toBeUndefined();

    // ...and must instead be marked partially confirmed.
    const partialUpdate = grnUpdateCalls.find((c) => c.payload.partial_store_confirmed === true);
    expect(partialUpdate).toBeTruthy();
  });
});
