-- ============================================================
-- Consumable Returns — event-sourced returns table
-- ============================================================
-- Background:
-- Until now, a "return" on a consumable issue was at-create-time
-- only: the create form set line.qty_returned and (for scrap
-- disposition) wrote a scrap_register row. There was no way to
-- record additional returns over time, no audit trail of who
-- returned what when, and stock_free was never credited for the
-- "returned to stock" case.
--
-- This migration introduces a proper event table. Each row is a
-- single return event; line.qty_returned becomes a denormalized
-- aggregate maintained by the API layer.
--
-- A backfill at the bottom synthesizes one event per existing
-- line that has qty_returned > 0, so the aggregate stays correct
-- when the app starts reading from this table.
--
-- Migration dependencies:
--   - 20260420000001_consumable_issues.sql (table + lines)
--   - 20260513000001_rename_consumable_issue_lines_issue_id.sql
--     (renames issue_id → consumable_issue_id, not referenced here)
--   - INDEPENDENT of 20260513000010_consumable_issue_delete_and_serial.sql.
--     This migration does NOT reference any of the columns added there
--     (deletion_reason, deleted_at, deleted_by, stock_action) and does
--     NOT use the 'deleted' status value. Verified by greppable inspection.
--     If 000010 was applied manually via the SQL Editor (out-of-band),
--     this migration is still safe to run as a normal migration.

CREATE TABLE IF NOT EXISTS public.consumable_returns (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  consumable_issue_line_id uuid        NOT NULL REFERENCES public.consumable_issue_lines(id) ON DELETE CASCADE,
  qty_returned             numeric     NOT NULL CHECK (qty_returned > 0),
  disposition              text        NOT NULL
    CHECK (disposition IN ('returned_to_stock', 'scrap', 'lost')),
  returned_at              timestamptz NOT NULL DEFAULT now(),
  returned_by_user_id      uuid        REFERENCES auth.users(id),
  returned_by_name         text,
  notes                    text,
  -- Soft delete for audit trail (user preference). When non-null,
  -- the row is excluded from the aggregate and stock has been
  -- reversed by deleteConsumableReturn.
  deleted_at               timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_consumable_returns_line
  ON public.consumable_returns (consumable_issue_line_id, returned_at DESC);
CREATE INDEX IF NOT EXISTS idx_consumable_returns_company
  ON public.consumable_returns (company_id, returned_at DESC);

-- RLS — same shape as consumable_issue_lines
ALTER TABLE public.consumable_returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_isolation" ON public.consumable_returns;
CREATE POLICY "company_isolation" ON public.consumable_returns
  FOR ALL USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

-- ────────────────────────────────────────────────────────────
-- Backfill — one event row per historical line.qty_returned > 0
-- ────────────────────────────────────────────────────────────
-- Stock is NOT mutated. Backfill reconstructs history; current
-- stock buckets already reflect whatever happened in the past.
-- disposition mapping mirrors create-flow semantics:
--   line.disposition='scrap' → 'scrap'
--   else                     → 'returned_to_stock'
--
-- Guarded by NOT EXISTS so a re-run does not duplicate.

INSERT INTO public.consumable_returns
  (company_id, consumable_issue_line_id, qty_returned,
   disposition, returned_at, returned_by_name, notes)
SELECT
  l.company_id,
  l.id,
  l.qty_returned,
  CASE WHEN l.disposition = 'scrap'
    THEN 'scrap'
    ELSE 'returned_to_stock'
  END,
  COALESCE(l.created_at, now()),
  NULL,
  'Backfilled from pre-aggregate qty_returned'
FROM public.consumable_issue_lines l
WHERE l.qty_returned > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.consumable_returns r
    WHERE r.consumable_issue_line_id = l.id
  );

NOTIFY pgrst, 'reload schema';
