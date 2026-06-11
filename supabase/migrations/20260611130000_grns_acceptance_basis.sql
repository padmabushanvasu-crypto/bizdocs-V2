-- Migration: per-GRN acceptance basis on grns
-- Author:  Vasu
-- Date:    2026-06-11
-- Apply:   Supabase SQL Editor only (never `supabase db push`). One transaction.
--
-- Adds grns.acceptance_basis — which ordered/received measure drives ORDER
-- reconciliation (pending/match) for the GRN: the primary qty ('original') or
-- the second measure ('alt'). Schema only; no app behaviour change yet (wiring
-- comes next). Stock posting is unaffected.
--
-- Notes:
--   • NOT NULL + constant DEFAULT 'original' → Postgres records the default in
--     catalog metadata only; the 607 existing rows are NOT rewritten and read
--     back as 'original'.
--   • ADD CONSTRAINT has no IF NOT EXISTS, so the CHECK is guarded by a pg_constraint
--     existence test to keep the migration idempotent.
--
-- Delete policy: N/A (adds one column + one CHECK; no row changes).

BEGIN;

-- 1. Column — metadata-only add; existing rows backfill to 'original'.
ALTER TABLE public.grns
  ADD COLUMN IF NOT EXISTS acceptance_basis text NOT NULL DEFAULT 'original';

-- 2. CHECK constraint — guarded so re-running is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.grns'::regclass
      AND conname  = 'grns_acceptance_basis_chk'
  ) THEN
    ALTER TABLE public.grns
      ADD CONSTRAINT grns_acceptance_basis_chk
      CHECK (acceptance_basis IN ('original','alt'));
  END IF;
END $$;

-- =============================================================================
-- Verification — fails (and rolls back) if expectations not met
-- =============================================================================
DO $$
DECLARE
  v_count integer;
  v_def   text;
BEGIN
  -- Column exists: text, NOT NULL, default 'original'.
  SELECT count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'grns'
    AND column_name  = 'acceptance_basis'
    AND data_type    = 'text'
    AND is_nullable  = 'NO'
    AND column_default LIKE '%original%';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Verification failed: acceptance_basis column missing or wrong (text/NOT NULL/default original)';
  END IF;

  -- CHECK constraint exists with both allowed values.
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.grns'::regclass
    AND conname  = 'grns_acceptance_basis_chk'
    AND contype  = 'c';
  IF v_def IS NULL
     OR v_def NOT ILIKE '%original%'
     OR v_def NOT ILIKE '%alt%' THEN
    RAISE EXCEPTION 'Verification failed: grns_acceptance_basis_chk missing or wrong: %', v_def;
  END IF;
END $$;

COMMIT;
