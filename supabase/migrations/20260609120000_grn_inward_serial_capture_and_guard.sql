-- Migration: GRN inward serial — capture live objects + uniqueness guard
-- Author:  Vasu
-- Date:    2026-06-09
-- Apply:   Supabase SQL Editor only (never `supabase db push`). One transaction.
--
-- Scope: GRN half only. The DC-return half is paused. This migration is
--        STRUCTURE + GUARD only and does NOT change app behaviour:
--        assign_inward_sl_no() stays in place and dormant-but-running until a
--        later wiring commit switches inward_sl_no to manual entry.
--
-- What this does:
--   1. Re-verifies (read-only) that grns has 0 duplicate
--      (company_id, inward_fy, inward_sl_no) triples among non-null serials.
--      If any exist, the RAISE aborts the transaction (full rollback).
--   2. Captures live-only objects into version control, EXACTLY as they exist
--      live (verified via Management API on 2026-06-09):
--        - grns.inward_sl_no (integer) + grns.inward_fy (smallint)
--          via ADD COLUMN IF NOT EXISTS — documents them; no change.
--        - fy_start_year(date) and assign_inward_sl_no(uuid) via CREATE OR
--          REPLACE using the exact live definitions. assign_inward_sl_no is
--          left in place (dormant) — NOT dropped.
--   3. Adds a BEFORE INSERT OR UPDATE trigger on grns that derives
--      inward_fy = fy_start_year(grn_date) whenever inward_sl_no IS NOT NULL,
--      so the FY is always derived server-side and the client never sets it.
--      grns.grn_date is NOT NULL (verified), so this matches what the RPC
--      already computes — no conflict while the RPC still runs.
--   4. Adds a PARTIAL UNIQUE index on (company_id, inward_fy, inward_sl_no)
--      WHERE inward_sl_no IS NOT NULL, so the 35 null-serial GRNs don't collide.
--      company_id stays nullable — out of scope here.
--
-- Delete policy: N/A (no row deletion; adds index + trigger + documents columns).
-- Note: the unique index is built non-CONCURRENTLY (required inside a txn);
--       grns is small (607 rows) so the brief SHARE lock is negligible.

BEGIN;

-- =============================================================================
-- 1. Pre-flight guard — re-verify zero duplicate serial triples (read-only)
-- =============================================================================
DO $$
DECLARE v_dups integer;
BEGIN
  SELECT count(*) INTO v_dups
  FROM (
    SELECT company_id, inward_fy, inward_sl_no
    FROM grns
    WHERE inward_sl_no IS NOT NULL
    GROUP BY company_id, inward_fy, inward_sl_no
    HAVING count(*) > 1
  ) d;

  IF v_dups > 0 THEN
    RAISE EXCEPTION
      'ABORT: % duplicate (company_id, inward_fy, inward_sl_no) triple(s) exist among non-null serials. Unique index would fail. Resolve duplicates before re-running.', v_dups;
  END IF;
END $$;

-- =============================================================================
-- 2. Capture live-only objects (documentation; no behavioural change)
-- =============================================================================

-- 2a. Columns — already exist live; IF NOT EXISTS makes this a no-op that
--     simply records them in version control.
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS inward_sl_no integer;
ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS inward_fy   smallint;

-- 2b. fy_start_year(date) — exact live definition (Indian FY start year, Apr-Mar).
CREATE OR REPLACE FUNCTION public.fy_start_year(d date)
 RETURNS smallint
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT (EXTRACT(YEAR FROM d) - CASE WHEN EXTRACT(MONTH FROM d) < 4 THEN 1 ELSE 0 END)::smallint
$function$;

-- 2c. assign_inward_sl_no(uuid) — exact live definition. Left DORMANT (still
--     called by grn-api.ts ~853/~963 until the wiring commit). Do NOT drop.
CREATE OR REPLACE FUNCTION public.assign_inward_sl_no(p_grn_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE v_company uuid; v_date date; v_fy smallint; v_existing integer; v_next integer;
BEGIN
  SELECT company_id, grn_date, inward_sl_no
    INTO v_company, v_date, v_existing
  FROM grns WHERE id = p_grn_id;

  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  v_fy := fy_start_year(COALESCE(v_date, CURRENT_DATE));
  PERFORM pg_advisory_xact_lock(hashtext(v_company::text || ':' || v_fy::text));

  SELECT COALESCE(MAX(inward_sl_no), 0) + 1 INTO v_next
  FROM grns WHERE company_id = v_company AND inward_fy = v_fy;

  UPDATE grns SET inward_sl_no = v_next, inward_fy = v_fy WHERE id = p_grn_id;
  RETURN v_next;
END;
$function$;

-- =============================================================================
-- 3. BEFORE INSERT OR UPDATE trigger — derive inward_fy from grn_date
-- =============================================================================
-- Only acts when inward_sl_no IS NOT NULL; leaves rows without a serial alone.
-- Uses fy_start_year(COALESCE(grn_date, CURRENT_DATE)) — byte-for-byte the same
-- FY the RPC computes, so the two never disagree even if grn_date were ever null.
-- On UPDATE, skips the rewrite when neither inward_sl_no nor grn_date changed.
CREATE OR REPLACE FUNCTION public.grns_set_inward_fy()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Branch on TG_OP before touching OLD (OLD is not present on INSERT).
  IF TG_OP = 'UPDATE' THEN
    -- Skip the rewrite when neither the serial nor the date changed.
    IF NEW.inward_sl_no IS NOT DISTINCT FROM OLD.inward_sl_no
       AND NEW.grn_date IS NOT DISTINCT FROM OLD.grn_date THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.inward_sl_no IS NOT NULL THEN
    NEW.inward_fy := public.fy_start_year(COALESCE(NEW.grn_date, CURRENT_DATE));
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_grns_set_inward_fy ON public.grns;
CREATE TRIGGER trg_grns_set_inward_fy
  BEFORE INSERT OR UPDATE ON public.grns
  FOR EACH ROW
  EXECUTE FUNCTION public.grns_set_inward_fy();

-- =============================================================================
-- 4. Partial unique guard on the inward serial register (per company + FY)
-- =============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS ux_grns_inward_serial
  ON public.grns (company_id, inward_fy, inward_sl_no)
  WHERE inward_sl_no IS NOT NULL;

-- =============================================================================
-- 5. Verification — fails (and rolls back) if expectations not met
-- =============================================================================
DO $$
DECLARE v_count integer;
BEGIN
  -- trigger present
  SELECT count(*) INTO v_count
  FROM pg_trigger
  WHERE tgrelid = 'public.grns'::regclass
    AND tgname = 'trg_grns_set_inward_fy'
    AND NOT tgisinternal;
  IF v_count != 1 THEN RAISE EXCEPTION 'Verification failed: trg_grns_set_inward_fy not found'; END IF;

  -- unique index present
  IF to_regclass('public.ux_grns_inward_serial') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: ux_grns_inward_serial not found';
  END IF;

  -- functions present
  IF to_regprocedure('public.fy_start_year(date)') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: fy_start_year(date) not found';
  END IF;
  IF to_regprocedure('public.assign_inward_sl_no(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: assign_inward_sl_no(uuid) not found';
  END IF;

  -- columns present with expected types
  SELECT count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='grns'
    AND ((column_name='inward_sl_no' AND data_type='integer')
      OR (column_name='inward_fy'   AND data_type='smallint'));
  IF v_count != 2 THEN RAISE EXCEPTION 'Verification failed: inward_sl_no/inward_fy columns/types unexpected'; END IF;
END $$;

COMMIT;
