-- Migration: drop redundant inward-serial unique index on grns
-- Author:  Vasu
-- Date:    2026-06-11
-- Apply:   Supabase SQL Editor only (never `supabase db push`). One transaction.
--
-- Context: two byte-identical partial unique indexes existed on public.grns,
-- both (company_id, inward_fy, inward_sl_no) WHERE inward_sl_no IS NOT NULL:
--   • uq_grns_inward_sl     — pre-existing, LIVE-ONLY (in no migration). Redundant.
--   • ux_grns_inward_serial — version-controlled (migration 20260609120000),
--                              the one the app's 23505 handlers match on.
--
-- This drops the redundant live-only uq_grns_inward_sl and keeps
-- ux_grns_inward_serial. The uniqueness rule is unchanged (the surviving index
-- enforces the identical predicate), so this is structure-only — no data or app
-- behaviour change.
--
-- Delete policy: N/A (drops one duplicate index; the equivalent guard remains).

BEGIN;

-- Idempotent: no-op if already dropped.
DROP INDEX IF EXISTS public.uq_grns_inward_sl;

-- =============================================================================
-- Verification — fails (and rolls back) if expectations not met
-- =============================================================================
DO $$
DECLARE
  v_inward_unique_count integer;
  v_def text;
BEGIN
  -- Exactly one inward-serial UNIQUE index must remain.
  SELECT count(*) INTO v_inward_unique_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'grns'
    AND indexdef ILIKE '%UNIQUE%'
    AND indexdef ILIKE '%inward_sl_no%';
  IF v_inward_unique_count <> 1 THEN
    RAISE EXCEPTION
      'Verification failed: expected exactly 1 inward-serial unique index, found %',
      v_inward_unique_count;
  END IF;

  -- The survivor must be ux_grns_inward_serial (never drop this one).
  IF to_regclass('public.ux_grns_inward_serial') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: ux_grns_inward_serial is missing — must NOT be dropped';
  END IF;

  -- The redundant index must be gone.
  IF to_regclass('public.uq_grns_inward_sl') IS NOT NULL THEN
    RAISE EXCEPTION 'Verification failed: uq_grns_inward_sl still present — drop did not take effect';
  END IF;

  -- Survivor must keep the exact shape:
  --   UNIQUE (company_id, inward_fy, inward_sl_no) WHERE inward_sl_no IS NOT NULL
  SELECT indexdef INTO v_def
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'grns' AND indexname = 'ux_grns_inward_serial';
  IF v_def IS NULL
     OR v_def NOT ILIKE '%UNIQUE%'
     OR v_def NOT ILIKE '%(company_id, inward_fy, inward_sl_no)%'
     OR v_def NOT ILIKE '%inward_sl_no IS NOT NULL%' THEN
    RAISE EXCEPTION 'Verification failed: ux_grns_inward_serial definition unexpected: %', v_def;
  END IF;
END $$;

COMMIT;
