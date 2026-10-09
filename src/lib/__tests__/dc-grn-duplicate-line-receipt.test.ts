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
// dcLineReceiptKey / getDcLineReceipt). Since 9 Oct 2026 there is no
// item_id+drawing_number fallback: only rows FK-linked to this DC count,
// matching v_dc_line_return_position (see test 2, DC-26-27/323).

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

  it("1b. orphan GRN rows (dc_line_item_id null) are NOT attributed by item_id+drawing_number", async () => {
    // Rule since 9 Oct 2026: receipts count only when FK-linked to a line of
    // this DC — same as v_dc_line_return_position, so GRN form == DC page.
    fixture = {
      grns: [{ id: "grn-489", status: "partially_received" }],
      dcLines: [{ id: "dcli-only" }],
      grnLineItems: [
        { dc_line_item_id: null, item_id: "item-2", drawing_number: "230230", received_qty: 40.45, received_now: null, receiving_now: null, accepted_qty: 40.45, accepted_quantity: null, received_now_2: null, accepted_qty_2: null },
      ],
    };

    const summary = await fetchDCReceiptSummary("dc-407");
    const entry = getDcLineReceipt(summary, "dcli-only", "item-2", "230230");

    expect(entry).toBeUndefined();
    expect(summary[dcReceiptKey("item-2", "230230")!]).toBeUndefined();
  });

  it("2. DC-26-27/323: rejected-and-returned legacy GRN does not hide the pending qty", async () => {
    // GRN-294 received 58/50/50 back, QC rejected all (return_to_vendor), and
    // its lines lost their dc_line_item_id when the DC was edited. GRN-1854
    // then received 48 of line 1 (linked). DC page shows 11/50/50 pending;
    // the GRN form used to count GRN-294 via the item fallback and say
    // "All items fully received".
    fixture = {
      grns: [{ id: "grn-294" }, { id: "grn-1854" }].map((g) => ({ ...g, status: "partially_received" })),
      dcLines: [{ id: "l1" }, { id: "l2" }, { id: "l3" }],
      grnLineItems: [
        { dc_line_item_id: null, item_id: "i1", drawing_number: "230333 B", received_qty: 58, received_now: 0, receiving_now: 58, accepted_qty: 0, accepted_quantity: 58, received_now_2: null, accepted_qty_2: null },
        { dc_line_item_id: null, item_id: "i2", drawing_number: "230333BX1", received_qty: 50, received_now: 0, receiving_now: 50, accepted_qty: 0, accepted_quantity: 50, received_now_2: null, accepted_qty_2: null },
        { dc_line_item_id: null, item_id: "i3", drawing_number: "230365", received_qty: 50, received_now: 0, receiving_now: 50, accepted_qty: 0, accepted_quantity: 50, received_now_2: null, accepted_qty_2: null },
        { dc_line_item_id: "l1", item_id: "i1", drawing_number: "230333 B", received_qty: 48, received_now: 0, receiving_now: 48, accepted_qty: 48, accepted_quantity: 48, received_now_2: null, accepted_qty_2: null },
      ],
    };

    const summary = await fetchDCReceiptSummary("dc-323");
    const sent: Record<string, number> = { l1: 59, l2: 50, l3: 50 };
    const pending = (id: string, item: string, dwg: string) =>
      sent[id] - (getDcLineReceipt(summary, id, item, dwg)?.received ?? 0);

    expect(pending("l1", "i1", "230333 B")).toBe(11);
    expect(pending("l2", "i2", "230333BX1")).toBe(50);
    expect(pending("l3", "i3", "230365")).toBe(50);
  });
});
