-- ============================================================
-- Job Cards: race-free auto-numbering
-- ============================================================
-- Same pattern as 20260513000020 for GRN/PO/DC/Consumable Issue.
-- The job_cards module had been using the broken client-side
-- getNextDocNumber helper in src/lib/job-works-api.ts:178 (which
-- reads MAX(jc_number)+1 without a lock and without a UNIQUE
-- backstop), so it was vulnerable to the same TOCTOU race.
--
-- This migration installs a BEFORE INSERT trigger that routes
-- through the existing locked helpers from 20260513000020:
--   - generate_doc_number()   — pg_advisory_xact_lock-backed
--   - _doc_slash_prefix()     — reads company_settings.jw_prefix +
--                                fy_year, falls back to current date
--
-- Diagnostics confirmed clean: 88 active rows, 0 deleted, 0 active
-- duplicates as of 2026-05-14 — the UNIQUE index in step C will
-- apply without conflict.
--
-- Format note: job_cards uses jw_prefix (NOT jc_prefix) from
-- company_settings. The default is 'JW'. Current production value
-- with fy_year='2627' yields numbers like 'JW-26-27/088'.

-- ────────────────────────────────────────────────────────────
-- 1. Trigger function
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assign_jc_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $func$
DECLARE
  v_prefix text;
BEGIN
  IF NEW.jc_number IS NULL OR NEW.jc_number = '' THEN
    v_prefix := public._doc_slash_prefix(NEW.company_id, 'jw_prefix', 'JW');
    NEW.jc_number := public.generate_doc_number(
      NEW.company_id, 'job_cards', 'jc_number', v_prefix, '/', 3
    );
  END IF;
  RETURN NEW;
END;
$func$;

-- ────────────────────────────────────────────────────────────
-- 2. Trigger
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_job_cards_assign_number ON public.job_cards;
CREATE TRIGGER trg_job_cards_assign_number
  BEFORE INSERT ON public.job_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_jc_number();

-- ────────────────────────────────────────────────────────────
-- 3. Partial unique index (active rows only)
-- ────────────────────────────────────────────────────────────
-- Matches the GRN pattern: soft-deleted rows are allowed to share
-- numbers with their replacements (historical drift), but active
-- rows must be unique per company.

ALTER TABLE public.job_cards
  DROP CONSTRAINT IF EXISTS job_cards_company_jc_number_key;
DROP INDEX IF EXISTS public.job_cards_company_jc_number_active_key;
CREATE UNIQUE INDEX IF NOT EXISTS job_cards_company_jc_number_active_key
  ON public.job_cards (company_id, jc_number)
  WHERE status IS DISTINCT FROM 'deleted';

NOTIFY pgrst, 'reload schema';
