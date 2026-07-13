-- awo_consumed_qty.sql
-- Phase A remediation: adds per-line consumed quantity to awo_line_items so the
-- "available in WIP" cap for returns/scraps can subtract what
-- acceptAssemblyWorkOrder already consumed. Without it, issued − returned −
-- scrapped over-counts WIP after acceptance and lets a completed AWO be
-- over-returned (double-crediting stock_free).
--
-- Nullable, NO default on purpose: existing (historical) rows stay NULL. The
-- app reads `Number(consumed_qty ?? 0)`, i.e. treats NULL as 0. That is safe:
-- any AWO already 'complete' before this ships is blocked from return/scrap by
-- the status guard shipped in the same commit, so the NULL→0 fallback can never
-- reopen the over-return hole for those rows. New consumption (at accept) writes
-- the real value.
--
-- Additive / non-destructive. Inverse (down) SQL, run only to roll back:
--   ALTER TABLE awo_line_items DROP COLUMN IF EXISTS consumed_qty;

ALTER TABLE awo_line_items
  ADD COLUMN IF NOT EXISTS consumed_qty numeric(15,3);

-- Verify:
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'awo_line_items' AND column_name = 'consumed_qty';
