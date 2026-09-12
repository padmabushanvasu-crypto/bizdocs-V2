import { describe, it, expect, vi } from "vitest";

// Regression tests for the DC-GRN "previously-received merging across
// duplicate item lines" bug (commit 1d07e51).
//
// Root cause (verified live for DC-26-27/738, company
// 45c14753-4e54-4327-bf77-dd9fb72899dc): dcReceiptKey(item_id,
// drawing_number) collapsed two dc_line_items rows sharing the same item and
// drawing number (494 qty + 52 qty) into one receipt bucket, so the DC
// falsely showed "All items fully received" while the 52-qty line still had
// 52 pending. The fix keys primarily on dc_line_item_id (via
// dcLineReceiptKey / getDcLineReceipt), falling back to the old
// item_id+drawing_number key only when dc_line_item_id is null or foreign to
// the DC (DC edit delete+reinsert, STOCK_LIFECYCLE_GOVERNANCE.md §3.1).

import {
  fetchDCReceiptSummary,
  getDcLineReceipt,
  dcLineReceiptKey,
  dcReceiptKey,
} from "@/lib/grn-api";

// ── Fake Postgrest chain ─────────────────────────────────────────────────────
// fetchDCReceiptSummary makes exactly three independent table queries
// (grns, dc_line_items, grn_line_items); each is awaited directly with no
// .single(), so the chain just needs to be thenable after any combination of
// .select/.eq/.neq/.not/.in.

let fixture: {
  grns: Array<{ id: string; status: string }>;
  dcLines: Array<{ id: string }>;
  grnLineItems: Array<Record<string, any>>;
};

function makeChain(resolve: () => { data: any; error: any }) {
  const chain: any = {};
  for (const m of ["select", "eq", "neq", "not", "in", "order", "limit"]) {
    chain[m] = () => chain;
  }
  chain.then = (onF: any, onR: any) => Promise.resolve(resolve()).then(onF, onR);
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) =>
      makeChain(() => {
        if (table === "grns") {
          // fetchDCReceiptSummary already filters out deleted/cancelled via
          // .not(...) server-side; the fixture only ever lists live GRNs, so
          // returning it unfiltered here matches what the real query would.
          return { data: fixture.grns, error: null };
        }
        if (table === "dc_line_items") {
          return { data: fixture.dcLines, error: null };
        }
        if (table === "grn_line_items") {
          return { data: fixture.grnLineItems, error: null };
        }
        return { data: [], error: null };
      }),
  },
}));

describe("DC-GRN duplicate-line receipt aggregation", () => {
  it("1a. DC-26-27/738 scenario: two lines sharing item_id+drawing_number get separate receipt totals, not merged", async () => {
    // Two dc_line_items rows for the same item + drawing, per the live bug:
    // line 1 wants 494, line 2 wants 52.
    fixture = {
      grns: [{ id: "grn-1336", status: "partially_received" }, { id: "grn-1337", status: "partially_received" }],
      dcLines: [{ id: "dcli-line1" }, { id: "dcli-line2" }],
      grnLineItems: [
        // Line 1 (494 qty) receipts, across two GRNs — totals 442, i.e. 52 short.
        { dc_line_item_id: "dcli-line1", item_id: "item-1", drawing_number: "230108 B R6", received_qty: 190, received_now: null, receiving_now: null, accepted_qty: 190, accepted_quantity: null, received_now_2: null, accepted_qty_2: null },
        { dc_line_item_id: "dcli-line1", item_id: "item-1", drawing_number: "230108 B R6", received_qty: 252, received_now: null, receiving_now: null, accepted_qty: 252, accepted_quantity: null, received_now_2: null, accepted_qty_2: null },
        // Line 2 (52 qty) — fully received on its own.
        { dc_line_item_id: "dcli-line2", item_id: "item-1", drawing_number: "230108 B R6", received_qty: 52, received_now: null, receiving_now: null, accepted_qty: 52, accepted_quantity: null, received_now_2: null, accepted_qty_2: null },
      ],
    };

    const summary = await fetchDCReceiptSummary("dc-738");

    const line1 = getDcLineReceipt(summary, "dcli-line1", "item-1", "230108 B R6");
    const line2 = getDcLineReceipt(summary, "dcli-line2", "item-1", "230108 B R6");

    // The bug: under the old item_id+drawing_number-only key, both lookups
    // would return the SAME merged total (190+252+52 = 494), making line 1
    // (494 required) look fully received and line 2 look over-received.
    expect(line1?.received).toBe(442); // 494 required — 52 genuinely pending
    expect(line2?.received).toBe(52); // fully received, on its own 52 qty
    expect(line1?.received).not.toBe(line2?.received);
  });

  it("1b. fallback path: dc_line_item_id null on every GRN row still resolves via the item_id+drawing_number key", async () => {
    fixture = {
      grns: [{ id: "grn-489", status: "partially_received" }],
      dcLines: [{ id: "dcli-only" }],
      grnLineItems: [
        // Older GRN, predating dc_line_item_id being populated on GRN lines.
        { dc_line_item_id: null, item_id: "item-2", drawing_number: "230230", received_qty: 40.45, received_now: null, receiving_now: null, accepted_qty: 40.45, accepted_quantity: null, received_now_2: null, accepted_qty_2: null },
      ],
    };

    const summary = await fetchDCReceiptSummary("dc-407");
    const entry = getDcLineReceipt(summary, "dcli-only", "item-2", "230230");

    expect(entry?.received).toBe(40.45);
    // Confirms it actually went through the pair-key bucket, not an id bucket.
    expect(summary[dcLineReceiptKey("dcli-only")]).toBeUndefined();
    expect(summary[dcReceiptKey("item-2", "230230")!]?.received).toBe(40.45);
  });
});
