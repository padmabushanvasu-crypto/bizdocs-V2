import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression test for the store-receipt-queue fix (target rule, Sep 2026):
// fetchGrnStoreReceiptQueue used to filter grn_line_items.is_final_grn = true
// directly, so a non-final line reaching grn_stage='awaiting_store' would
// still be invisible to the storekeeper. It must now scope by the header's
// grn_stage instead, with no is_final_grn filter at all.

const lineItemsCalls: Array<{ method: string; args: any[] }> = [];

function makeGrnsChain() {
  const chain: any = {};
  for (const m of ["eq", "not", "gte", "lte", "or"]) chain[m] = () => chain;
  chain.then = (onF: any, onR: any) =>
    Promise.resolve({
      data: [
        {
          id: "grn-nf-1",
          grn_number: "GRN-NF-1",
          grn_date: "2026-09-10",
          vendor_name: "Test Vendor",
          po_number: "PO-NF-1",
          grn_type: "po_grn",
          acceptance_basis: "original",
        },
      ],
      error: null,
    }).then(onF, onR);
  return chain;
}

function makeLineItemsChain() {
  const chain: any = {};
  for (const m of ["eq", "in", "not", "gte", "lte", "order", "limit"]) {
    chain[m] = (...args: any[]) => {
      lineItemsCalls.push({ method: m, args });
      return chain;
    };
  }
  chain.then = (onF: any, onR: any) =>
    Promise.resolve({
      // Deliberately no is_final_grn field at all — a non-final line, exactly
      // the case that used to be filtered out.
      data: [
        {
          id: "line-nf-1",
          grn_id: "grn-nf-1",
          item_id: "item-1",
          description: "Non-final item",
          drawing_number: null,
          unit: "NOS",
          conforming_qty: 5,
          store_confirmed_qty: 0,
          damaged_qty: 0,
          store_confirmed: false,
          store_confirmed_at: null,
          store_confirmed_by: null,
          damaged_reason: null,
          store_confirmation_notes: null,
          store_location: null,
          ordered_qty_2: null,
          received_now_2: null,
          accepted_qty_2: null,
          unit_2: null,
        },
      ],
      error: null,
    }).then(onF, onR);
  return chain;
}

vi.mock("@/integrations/supabase/client", () => {
  const supabase = {
    from: (table: string) => {
      if (table === "grns") return { select: (_cols: string) => makeGrnsChain() };
      if (table === "grn_line_items") return { select: (_cols: string) => makeLineItemsChain() };
      return { select: () => ({ eq: () => ({ then: (onF: any) => Promise.resolve({ data: [], error: null }).then(onF) }) }) };
    },
  };
  return { supabase };
});

vi.mock("@/lib/auth-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-helpers")>();
  return { ...actual, getCompanyId: vi.fn().mockResolvedValue("company-1") };
});

import { fetchGrnStoreReceiptQueue } from "@/lib/grn-api";

describe("fetchGrnStoreReceiptQueue surfaces non-final awaiting_store lines", () => {
  beforeEach(() => {
    lineItemsCalls.length = 0;
  });

  it("returns a non-final line's card without filtering on is_final_grn", async () => {
    const cards = await fetchGrnStoreReceiptQueue({});

    expect(cards).toHaveLength(1);
    expect(cards[0].grn_id).toBe("grn-nf-1");
    expect(cards[0].line_items.map((l) => l.id)).toEqual(["line-nf-1"]);
    expect(cards[0].card_status).toBe("pending");

    // Regression sentinel: the line-item query must never filter on
    // is_final_grn — that's exactly the filter this fix removes.
    expect(
      lineItemsCalls.some((c) => c.method === "eq" && c.args[0] === "is_final_grn")
    ).toBe(false);

    // It must instead scope by the header's grn_stage, including
    // 'awaiting_store' (and 'closed', for the confirmed/history view).
    const stageFilterCall = lineItemsCalls.find((c) => c.args[0] === "grns.grn_stage");
    expect(stageFilterCall).toBeTruthy();
    expect(stageFilterCall!.args[1]).toContain("awaiting_store");
  });
});
