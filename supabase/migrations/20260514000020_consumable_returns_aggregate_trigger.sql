-- ============================================================
-- Consumable returns: aggregate trigger (DB source of truth)
-- ============================================================
-- consumable_issue_lines.qty_returned is a denormalized aggregate
-- of consumable_returns rows (where deleted_at IS NULL). Until now
-- the recompute happened in the app layer (recomputeLineQtyReturned
-- in src/lib/consumables-api.ts), called from recordConsumableReturn /
-- deleteConsumableReturn / editConsumableIssue. That works when every
-- mutation goes through those functions but provides no guarantee
-- against drift if anything else writes to consumable_returns.
--
-- This migration installs AFTER INSERT / UPDATE / DELETE triggers on
-- consumable_returns that recompute the parent line's aggregate. The
-- DB is now the source of truth. The app-layer recompute in
-- consumables-api.ts stays in place — it's a redundant fast-path,
-- effectively a belt-and-braces guarantee, and it usefully forces a
-- read-after-write so the next query sees the fresh value without
-- waiting for PostgREST's view cache.
--
-- Backfill at the bottom resyncs every consumable_issue_line in the
-- database. Idempotent; safe to re-run.

-- ────────────────────────────────────────────────────────────
-- 1. Helper: recompute one line's aggregate
-- ────────────────────────────────────────────────────────────
-- Note: consumable_issue_lines has no updated_at column (only
-- created_at), so we don't touch it. Adding the column is a
-- separate (deferred) decision.

CREATE OR REPLACE FUNCTION public.recompute_consumable_line_qty_returned(
  p_line_id uuid
) RETURNS void
LANGUAGE plpgsql
AS $func$
DECLARE
  v_total numeric;
BEGIN
  SELECT COALESCE(SUM(qty_returned), 0)
    INTO v_total
    FROM public.consumable_returns
    WHERE consumable_issue_line_id = p_line_id
      AND deleted_at IS NULL;

  UPDATE public.consumable_issue_lines
    SET qty_returned = v_total
    WHERE id = p_line_id;
END;
$func$;

-- ────────────────────────────────────────────────────────────
-- 2. Trigger function: dispatch on TG_OP
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_consumable_returns_aggregate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $func$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.recompute_consumable_line_qty_returned(NEW.consumable_issue_line_id);
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- If the row was reparented to a different line, both the old and
    -- new parents need their aggregates recomputed. Rare in practice.
    IF NEW.consumable_issue_line_id IS DISTINCT FROM OLD.consumable_issue_line_id THEN
      PERFORM public.recompute_consumable_line_qty_returned(OLD.consumable_issue_line_id);
    END IF;
    PERFORM public.recompute_consumable_line_qty_returned(NEW.consumable_issue_line_id);
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_consumable_line_qty_returned(OLD.consumable_issue_line_id);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$func$;

-- ────────────────────────────────────────────────────────────
-- 3. Triggers — AFTER so the change is visible to the recompute
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_consumable_returns_aggregate_insert ON public.consumable_returns;
CREATE TRIGGER trg_consumable_returns_aggregate_insert
  AFTER INSERT ON public.consumable_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_consumable_returns_aggregate();

DROP TRIGGER IF EXISTS trg_consumable_returns_aggregate_update ON public.consumable_returns;
CREATE TRIGGER trg_consumable_returns_aggregate_update
  AFTER UPDATE ON public.consumable_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_consumable_returns_aggregate();

DROP TRIGGER IF EXISTS trg_consumable_returns_aggregate_delete ON public.consumable_returns;
CREATE TRIGGER trg_consumable_returns_aggregate_delete
  AFTER DELETE ON public.consumable_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_consumable_returns_aggregate();

-- ────────────────────────────────────────────────────────────
-- 4. One-time backfill — resync every line in every company
-- ────────────────────────────────────────────────────────────
-- Idempotent. Runs at migration apply time only. No-op for rows
-- that already match.

DO $$
DECLARE
  v_line_id uuid;
BEGIN
  FOR v_line_id IN
    SELECT id FROM public.consumable_issue_lines
  LOOP
    PERFORM public.recompute_consumable_line_qty_returned(v_line_id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
