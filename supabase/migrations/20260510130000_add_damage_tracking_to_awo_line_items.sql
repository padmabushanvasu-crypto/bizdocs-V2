-- Damage tracking on awo_line_items
--
-- Unblocks src/lib/production-api.ts → reportComponentIssue(), which writes
-- to these six columns. Without this migration that function throws on first
-- call because the columns don't exist. The function (and its TypeScript
-- AwoLineItem interface) was shipped ahead of the schema; this catches up.
--
-- No data migration needed — defaults make new columns transparent to
-- existing rows. Inherits RLS from the parent table (awo_line_items) which
-- is already locked down by phase16 production module migration.

ALTER TABLE public.awo_line_items
  ADD COLUMN IF NOT EXISTS damage_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS damage_reason text,
  ADD COLUMN IF NOT EXISTS disposition text,
  ADD COLUMN IF NOT EXISTS concession_note text,
  ADD COLUMN IF NOT EXISTS concession_by uuid,
  ADD COLUMN IF NOT EXISTS concession_at timestamptz;

-- Disposition value constraint — only allow the 3 valid dispositions when set.
-- ALTER TABLE ADD CONSTRAINT has no IF NOT EXISTS form in Postgres, so wrap
-- the lookup in pg_constraint to keep the migration idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'awo_line_items_disposition_check'
  ) THEN
    ALTER TABLE public.awo_line_items
      ADD CONSTRAINT awo_line_items_disposition_check
      CHECK (disposition IS NULL OR disposition IN ('scrap', 'use_as_is', 'return_to_vendor'));
  END IF;
END $$;

-- FK on concession_by → auth.users(id). Mirrors cost_master_bindings.confirmed_by
-- precedent. ON DELETE SET NULL so a user-removal doesn't cascade and destroy
-- AWO line history; we just lose the "who approved this concession" link.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'awo_line_items_concession_by_fkey'
  ) THEN
    ALTER TABLE public.awo_line_items
      ADD CONSTRAINT awo_line_items_concession_by_fkey
      FOREIGN KEY (concession_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.awo_line_items.damage_qty IS
  'Quantity of this line item reported as damaged during assembly. Default 0.';
COMMENT ON COLUMN public.awo_line_items.damage_reason IS
  'Free-text reason provided when damage_qty > 0.';
COMMENT ON COLUMN public.awo_line_items.disposition IS
  'How damaged units are handled: scrap | use_as_is | return_to_vendor.';
COMMENT ON COLUMN public.awo_line_items.concession_note IS
  'Note recorded when disposition = use_as_is (concession granted).';
COMMENT ON COLUMN public.awo_line_items.concession_by IS
  'auth.users(id) of the user who approved the concession (when disposition = use_as_is).';
COMMENT ON COLUMN public.awo_line_items.concession_at IS
  'Timestamp when concession was approved.';
