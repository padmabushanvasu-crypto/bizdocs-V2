import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression test for the live "All items fully received... a new GRN cannot
// be raised" false block on PO-26-27/462, item 230372-01 (292 ordered, one
// GRN line received 291, disposition='rejected', accepted_qty=0).
//
// Root cause: grn_line_items carries TWO parallel "accepted" columns —
// accepted_qty (current) and accepted_quantity (legacy). The live DB trigger
// stack that owns po_line_items.received_quantity
// (grn_line_items_sync_po_received -> recompute_po_line_received_quantity,
// STOCK_LIFECYCLE_GOVERNANCE.md §4) reads the LEGACY accepted_quantity
// column, not accepted_qty. Stage 1 seeds accepted_quantity to the
// provisional received amount before QC has run (GRNForm.tsx's Stage-1
// submit sets accepted_quantity: i.s1_received_now; updateGrnLineStage1 does
// the same for a Stage-1 edit). saveQualityStage — the sole QC/disposition
// writer (STOCK_LIFECYCLE_GOVERNANCE.md §4) — used to update accepted_qty
// only and never touched the legacy accepted_quantity column, so a QC
// decision that reduces or fully rejects a line left po_line_items
// .received_quantity permanently overstated by the un-accepted amount. When
// that stale figure reaches the ordered quantity, the "fully received" gate
// (GRNForm.tsx handlePOSelect: pending = quantity - received_quantity) wrongly
// filters the line out, blocking a legitimate new GRN for a genuine
// replacement shipment.
//
// The fix makes saveQualityStage write accepted_quantity alongside
// accepted_qty (same convention already used by the older updateGrnLineStage2
// writer), so the trigger-computed received_quantity tracks the real QC
// outcome instead of the pre-QC placeholder.

const grnLineUpdateCalls: Array<{ payload: any }> = [];
let testLine: any;

function makeSelectChain(resolve: () => { data: any; error: any }) {
  const chain: any = {};
  for (const m of ["eq", "neq", "in", "not", "order", "limit"]) chain[m] = () => chain;
  chain.single = () => Promise.resolve(resolve());
  chain.maybeSingle = () => Promise.resolve(resolve());
  chain.then = (onF: any, onR: any) => Promise.resolve(resolve()).then(onF, onR);
  return chain;
}

function makeUpdateChain(table: string, payload: any) {
  const chain: any = {};
  const apply = () => {
    if (table === "grn_line_items") {
      grnLineUpdateCalls.push({ payload });
      Object.assign(testLine, payload);
    }
    return { error: null };
  };
  chain.eq = () => {
    apply();
    return chain;
  };
  chain.then = (onF: any, onR: any) => Promise.resolve({ error: null }).then(onF, onR);
  return chain;
}

function makeDeleteChain() {
  const chain: any = {};
  chain.eq = () => chain;
  chain.then = (onF: any, onR: any) => Promise.resolve({ error: null }).then(onF, onR);
  return chain;
}

const GRN_HEADER = {
  grn_type: "po_grn",
  grn_number: "GRN-26-27/1884",
  vendor_name: "Test Vendor",
  linked_dc_id: null,
  company_id: "company-1",
  grn_stage: "quality_pending",
  overall_quality_verdict: null,
};

vi.mock("@/integrations/supabase/client", () => {
  const supabase = {
    from: (table: string) => ({
      select: (_cols: string) =>
        makeSelectChain(() => {
          if (table === "grns") return { data: { ...GRN_HEADER }, error: null };
          if (table === "grn_line_items") return { data: [{ ...testLine }], error: null };
          return { data: [], error: null };
        }),
      update: (payload: any) => makeUpdateChain(table, payload),
      delete: () => makeDeleteChain(),
      insert: () => Promise.resolve({ error: null }),
    }),
    rpc: () => Promise.resolve({ data: null, error: null }),
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
  };
  return { supabase };
});

vi.mock("@/lib/auth-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-helpers")>();
  return { ...actual, getCompanyId: vi.fn().mockResolvedValue("company-1") };
});

// Ledger/notification side effects are exercised by other tests; stubbed here
// so this test can focus purely on the accepted_quantity legacy-sync payload.
vi.mock("@/lib/assembly-orders-api", () => ({
  addStockLedgerEntry: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notifications-api", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

import { saveQualityStage } from "@/lib/grn-api";

// Mirrors recompute_po_line_received_quantity (live DB function, not in
// migrations — STOCK_LIFECYCLE_GOVERNANCE.md notes it must be re-verified
// live) so the test can assert what po_line_items.received_quantity would
// become, without a real Postgres trigger to run against.
function simulateRecomputePoReceivedQuantity(lines: Array<Record<string, any>>): number {
  return lines.reduce((sum, l) => {
    const base = l.store_confirmed === true ? Number(l.store_confirmed_qty ?? 0) : Number(l.accepted_quantity ?? 0);
    const damaged = Number(l.damaged_qty ?? 0);
    return sum + Math.max(0, base - damaged);
  }, 0);
}

describe("saveQualityStage keeps legacy accepted_quantity in sync with accepted_qty", () => {
  beforeEach(() => {
    grnLineUpdateCalls.length = 0;
  });

  it("fully rejecting a line (292 ordered, 291 received) does not leave the PO looking fully received", async () => {
    const orderedQty = 292;
    testLine = {
      id: "line-1884",
      grn_id: "grn-1884",
      po_line_item_id: "po-line-462-1",
      item_id: "item-230372-01",
      description: "230372-01",
      drawing_number: "DWG-230372-01",
      disposition: null,
      rejected_qty: 0,
      // Stage-1 placeholder before QC ran (GRNForm.tsx: accepted_quantity:
      // i.s1_received_now, or a "Fill remaining"-style full-quantity entry
      // later corrected down to the 291 actually received) — the value the
      // legacy column is stuck at until QC (correctly) overwrites it.
      accepted_qty: orderedQty,
      accepted_quantity: orderedQty,
      is_final_grn: false,
      store_confirmed: false,
      store_confirmed_qty: 0,
      damaged_qty: 0,
      stock_posted_at: null,
    };

    await saveQualityStage(
      "grn-1884",
      [
        {
          id: "line-1884",
          qty_inspected: 291,
          inspection_method: "visual_only",
          conforming_qty: 0,
          non_conforming_qty: 291,
          non_conformance_type: "other",
          deviation_description: "Whole batch damaged in transit",
          disposition: "return_to_vendor",
        },
      ],
      "QC Inspector",
    );

    const qcUpdate = grnLineUpdateCalls.find((c) => c.payload.disposition === "return_to_vendor");
    expect(qcUpdate).toBeTruthy();
    expect(qcUpdate!.payload.accepted_qty).toBe(0);
    // The regression: this key must be present and correct — pre-fix it was
    // simply never written, leaving the legacy column stuck at 292.
    expect(qcUpdate!.payload.accepted_quantity).toBe(0);

    const simulatedReceivedQuantity = simulateRecomputePoReceivedQuantity([testLine]);
    const pending = orderedQty - simulatedReceivedQuantity;

    // Pre-fix this was 0 (292 - 292), tripping GRNForm.tsx's
    // `pending > 0` filter and showing "All items fully received... a new
    // GRN cannot be raised" even though the entire batch was rejected.
    expect(pending).toBe(292);
    expect(pending).toBeGreaterThan(0);
  });

  it("handles a partial rejection (113 received, 82 accepted, 31 rejected) on the same line", async () => {
    const orderedQty = 113;
    testLine = {
      id: "line-2005",
      grn_id: "grn-2005",
      po_line_item_id: "po-line-2005-1",
      item_id: "item-x",
      description: "Partial-reject test item",
      drawing_number: "DWG-X",
      disposition: null,
      rejected_qty: 0,
      // Stage-1 placeholder = full received amount, before QC splits it into
      // 82 accepted / 31 rejected — matches the live divergence found on
      // po_line_item 2df20d4a (GRN-26-27/2005): accepted_qty=82 vs legacy
      // accepted_quantity stuck at 113.
      accepted_qty: orderedQty,
      accepted_quantity: orderedQty,
      is_final_grn: false,
      store_confirmed: false,
      store_confirmed_qty: 0,
      damaged_qty: 0,
      // Already stock-posted so the ledger-post pass (unrelated to this
      // regression) is a no-op and doesn't need its own RPC mocks.
      stock_posted_at: "2026-08-01T00:00:00.000Z",
    };

    await saveQualityStage(
      "grn-2005",
      [
        {
          id: "line-2005",
          qty_inspected: 113,
          inspection_method: "visual_only",
          conforming_qty: 82,
          non_conforming_qty: 31,
          non_conformance_type: "dimensional",
          deviation_description: "31 units out of tolerance",
          disposition: "scrap",
        },
      ],
      "QC Inspector",
    );

    const qcUpdate = grnLineUpdateCalls.find((c) => c.payload.disposition === "scrap");
    expect(qcUpdate).toBeTruthy();
    expect(qcUpdate!.payload.accepted_qty).toBe(82);
    expect(qcUpdate!.payload.accepted_quantity).toBe(82);

    const simulatedReceivedQuantity = simulateRecomputePoReceivedQuantity([testLine]);
    const pending = orderedQty - simulatedReceivedQuantity;

    // Pre-fix this was 0 (113 - 113): the 31 scrapped units vanished from
    // "pending" instead of being receivable again.
    expect(simulatedReceivedQuantity).toBe(82);
    expect(pending).toBe(31);
  });
});
