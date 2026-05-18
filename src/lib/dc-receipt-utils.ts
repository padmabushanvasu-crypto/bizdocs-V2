// ============================================================
// DC receipt utilities
// ============================================================
// Helpers for working with partial / full receipts against a
// Delivery Challan line item.
//
// remaining_qty := ordered_qty − Σ(received_qty across prior GRNs)
//
// The "ordered" and "previously received" fields appear under a
// few different keys across the codebase (DC line vs GRN line
// shape). The functions below accept either shape and pick the
// first present field, so callers don't have to massage data.
//
// Used by:
//   - src/pages/GRNForm.tsx       — jig confirmation gating
//   - (future) Storekeeper Queue   — close-out vs partial display
//   - (future) stock-ledger writes — final-batch hook

export interface DcReceiptLineLike {
  /** Quantity sent on the DC line. Prefer `ordered_qty`; fall back to `po_quantity`. */
  ordered_qty?: number | null;
  po_quantity?: number | null;
  /** Sum of receipts on prior GRNs for this DC line. Prefer `previously_received_qty`; fall back to `previously_received`. */
  previously_received_qty?: number | null;
  previously_received?: number | null;
}

/**
 * Outstanding qty on a DC line: ordered minus everything received
 * so far. Floors at 0 (a malformed line where prior > ordered
 * shouldn't drag remaining into negative territory).
 */
export function computeDcLineRemainingQty(line: DcReceiptLineLike): number {
  const ordered = Number(line.ordered_qty ?? line.po_quantity ?? 0);
  const prev = Number(line.previously_received_qty ?? line.previously_received ?? 0);
  return Math.max(0, ordered - prev);
}

/**
 * True when the current batch being recorded would close out the
 * remaining qty on the line — i.e. this receipt empties the pending
 * column. Returns false when nothing net is being received
 * (currentBatchQty − rejectedThisBatchQty <= 0), so callers can use
 * the result directly to gate "final batch only" controls without
 * their own guard.
 *
 * `rejectedThisBatchQty` (default 0) subtracts visually-rejected units
 * recorded at Stage 1. When a vendor sends a batch with heavy
 * rejections, they still owe replacements — the order is not final by
 * net math, so jig confirmation should NOT fire. Reject is treated as
 * "not yet received" for closing-out purposes, even though the units
 * physically arrived (Pending stays gross — that's a different concern).
 *
 * Uses >= rather than === to handle admin-override scenarios where the
 * operator records more than the official remaining (e.g. surplus
 * delivered). Still treated as final.
 */
export function isFinalBatch(
  line: DcReceiptLineLike,
  currentBatchQty: number,
  rejectedThisBatchQty: number = 0,
): boolean {
  const net = currentBatchQty - rejectedThisBatchQty;
  if (!(net > 0)) return false;
  const remaining = computeDcLineRemainingQty(line);
  // A line with remaining === 0 shouldn't normally appear in the GRN
  // form (it's filtered out), but if it does, any positive net receipt
  // is by definition final.
  if (remaining === 0) return true;
  return net >= remaining;
}
