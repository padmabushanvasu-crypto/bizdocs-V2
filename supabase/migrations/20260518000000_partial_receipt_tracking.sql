-- ============================================================================
-- Partial-receipt visibility on every GRN/DC return surface.
-- ============================================================================
-- New columns to support split-batch receipts:
--   * grn_line_items.stage1_rejected_qty — Inward Team visual rejections at
--     Stage 1, kept independent of Stage 2's rejected_qty (which is derived
--     from QC measurements + disposition).
--   * dc_line_items.returned_qty_rejected_{nos,kg,sft} — damaged-on-return
--     quantities recorded by the DC return flow, mirrored on the same
--     unit-typed split as returned_qty_{nos,kg,sft}.
--
-- All new columns are NUMERIC NULL (no default). Historical rows stay NULL;
-- application code writes 0 or a real value when recorded. Matches the
-- "absence of input = unknown, not zero" semantics the new UI exposes.
-- ============================================================================

ALTER TABLE grn_line_items
  ADD COLUMN IF NOT EXISTS stage1_rejected_qty NUMERIC NULL;

ALTER TABLE dc_line_items
  ADD COLUMN IF NOT EXISTS returned_qty_rejected_nos NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS returned_qty_rejected_kg  NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS returned_qty_rejected_sft NUMERIC NULL;
