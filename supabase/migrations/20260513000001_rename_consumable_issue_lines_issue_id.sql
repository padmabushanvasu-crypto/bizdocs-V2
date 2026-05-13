-- Reconcile migration history with production.
-- The column public.consumable_issue_lines.issue_id was renamed to
-- consumable_issue_id out-of-band on production. This migration applies the
-- same rename to any environment where the old column still exists, so a
-- fresh `supabase db reset` matches production. The matching index is also
-- renamed to keep names aligned with the column.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'consumable_issue_lines'
      AND column_name  = 'issue_id'
  ) THEN
    ALTER TABLE public.consumable_issue_lines
      RENAME COLUMN issue_id TO consumable_issue_id;
  END IF;
END $$;

ALTER INDEX IF EXISTS public.idx_consumable_issue_lines_issue
  RENAME TO idx_consumable_issue_lines_consumable_issue;
