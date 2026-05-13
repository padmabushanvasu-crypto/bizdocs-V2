-- ============================================================
-- Doc-numbering: race-free triggers + uniqueness backstop
-- ============================================================
-- Audit (see prior session findings) confirmed that GRN / PO / DC
-- numbers were generated client-side as `MAX(num) + 1` with no
-- lock and no DB-level UNIQUE constraint, producing duplicate
-- numbers under concurrent form submissions. Consumable Issue
-- already used a BEFORE INSERT trigger but did a naked MAX read.
--
-- This migration:
--   1. Adds a shared SQL function generate_doc_number() that
--      acquires a per-(company, prefix) transaction-scoped
--      advisory lock before reading MAX, eliminating the
--      read/insert race.
--   2. Installs BEFORE INSERT triggers on grns, purchase_orders,
--      delivery_challans that fire when the doc-number column
--      is NULL or empty — frontend now passes '' and lets the
--      trigger fill it.
--   3. Replaces the existing generate_consumable_issue_number
--      function with one that uses the shared lock helper.
--   4. Adds UNIQUE (company_id, <doc_number>) constraints on all
--      four tables as a last-line-of-defence.
--
-- ⚠  REQUIRES PRE-MIGRATION CLEANUP of ACTIVE duplicates. The
-- partial unique indexes in step 4 exclude soft-deleted (and, for
-- POs, cancelled) rows, so historical duplicates among those rows
-- are preserved intact. Only duplicates among rows that are still
-- in the active set must be resolved before this migration runs.
-- (Known active duplicates as of 2026-05-13: 62 GRN rows, 8+ PO,
-- 1 DC — being renumbered manually.)

-- ────────────────────────────────────────────────────────────
-- 1. Shared helper
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_doc_number(
  p_company_id  uuid,
  p_table       text,
  p_column      text,
  p_full_prefix text,   -- e.g. 'GRN-26-27' or 'CIS-2627'
  p_separator   text,   -- '/' for GRN/PO/DC, '-' for CIS
  p_pad_width   integer DEFAULT 3
) RETURNS text
LANGUAGE plpgsql
AS $func$
DECLARE
  v_lock_key   bigint;
  v_max        integer;
  v_prefix_len integer;
  v_pattern    text;
  v_query      text;
BEGIN
  -- Transaction-scoped advisory lock keyed on (company, full prefix).
  -- Released automatically at COMMIT / ROLLBACK. Two concurrent
  -- INSERTs that need a number from the same series serialise here.
  v_lock_key := hashtextextended(p_company_id::text || '|' || p_full_prefix, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  v_pattern    := p_full_prefix || p_separator || '%';
  v_prefix_len := length(p_full_prefix || p_separator);

  -- Dynamic SQL: identifiers must be %I-quoted; literals in $1.
  -- The numeric suffix sits at column position (v_prefix_len + 1).
  -- Soft-deleted rows are excluded so a deleted-then-reissued slot
  -- can be reclaimed — matches prior client-side helper behaviour.
  v_query := format(
    'SELECT COALESCE(MAX(NULLIF(SUBSTRING(%I FROM %s), '''')::integer), 0) '
    'FROM %I '
    'WHERE company_id = $1 '
    '  AND %I LIKE $2 '
    '  AND status IS DISTINCT FROM ''deleted''',
    p_column, v_prefix_len + 1,
    p_table,
    p_column
  );
  EXECUTE v_query INTO v_max USING p_company_id, v_pattern;

  RETURN p_full_prefix || p_separator || LPAD((v_max + 1)::text, p_pad_width, '0');
END;
$func$;

-- ────────────────────────────────────────────────────────────
-- 2. Per-table trigger functions + triggers
-- ────────────────────────────────────────────────────────────

-- Build the slash-format prefix used by GRN/PO/DC.
-- Reads <prefix_key> and fy_year from company_settings; falls back
-- to a CURRENT_DATE-derived fiscal year if fy_year is unset.
CREATE OR REPLACE FUNCTION public._doc_slash_prefix(
  p_company_id uuid,
  p_prefix_key text,        -- 'grn_prefix' | 'po_prefix' | 'dc_prefix'
  p_default_prefix text     -- 'GRN' | 'PO' | 'DC'
) RETURNS text
LANGUAGE plpgsql
AS $func$
DECLARE
  v_fy_raw     text;
  v_fy         text;
  v_custom     text;
  v_query      text;
BEGIN
  EXECUTE format(
    'SELECT %I, fy_year FROM public.company_settings WHERE company_id = $1 LIMIT 1',
    p_prefix_key
  ) INTO v_custom, v_fy_raw USING p_company_id;

  IF v_fy_raw IS NOT NULL AND length(v_fy_raw) = 4 THEN
    v_fy := substring(v_fy_raw, 1, 2) || '-' || substring(v_fy_raw, 3, 2);
  ELSE
    v_fy := CASE
      WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4
        THEN to_char(CURRENT_DATE, 'YY') || '-' || to_char(CURRENT_DATE + interval '1 year', 'YY')
      ELSE to_char(CURRENT_DATE - interval '1 year', 'YY') || '-' || to_char(CURRENT_DATE, 'YY')
    END;
  END IF;

  -- Match prior client behaviour: when no custom prefix is set,
  -- the document number is fy-only (e.g. '26-27/001'), not
  -- prefixed with default.
  IF v_custom IS NULL OR v_custom = '' THEN
    RETURN v_fy;
  ELSE
    RETURN v_custom || '-' || v_fy;
  END IF;
END;
$func$;

-- GRN -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_grn_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $func$
DECLARE
  v_prefix text;
BEGIN
  IF NEW.grn_number IS NULL OR NEW.grn_number = '' THEN
    v_prefix := public._doc_slash_prefix(NEW.company_id, 'grn_prefix', 'GRN');
    NEW.grn_number := public.generate_doc_number(
      NEW.company_id, 'grns', 'grn_number', v_prefix, '/', 3
    );
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_grns_assign_number ON public.grns;
CREATE TRIGGER trg_grns_assign_number
  BEFORE INSERT ON public.grns
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_grn_number();

-- PO ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_po_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $func$
DECLARE
  v_prefix text;
BEGIN
  IF NEW.po_number IS NULL OR NEW.po_number = '' THEN
    v_prefix := public._doc_slash_prefix(NEW.company_id, 'po_prefix', 'PO');
    NEW.po_number := public.generate_doc_number(
      NEW.company_id, 'purchase_orders', 'po_number', v_prefix, '/', 3
    );
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_purchase_orders_assign_number ON public.purchase_orders;
CREATE TRIGGER trg_purchase_orders_assign_number
  BEFORE INSERT ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_po_number();

-- DC ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_dc_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $func$
DECLARE
  v_prefix text;
BEGIN
  IF NEW.dc_number IS NULL OR NEW.dc_number = '' THEN
    v_prefix := public._doc_slash_prefix(NEW.company_id, 'dc_prefix', 'DC');
    NEW.dc_number := public.generate_doc_number(
      NEW.company_id, 'delivery_challans', 'dc_number', v_prefix, '/', 3
    );
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_delivery_challans_assign_number ON public.delivery_challans;
CREATE TRIGGER trg_delivery_challans_assign_number
  BEFORE INSERT ON public.delivery_challans
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_dc_number();

-- Consumable Issue ---------------------------------------------
-- Replaces the existing function from 20260420000001 with one
-- that goes through the shared locked helper. Existing trigger
-- (set_consumable_issue_number) references this function by name
-- and continues to work unchanged.
CREATE OR REPLACE FUNCTION public.generate_consumable_issue_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $func$
DECLARE
  v_fy text;
BEGIN
  v_fy := CASE
    WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4
      THEN to_char(CURRENT_DATE, 'YY') || to_char(CURRENT_DATE + interval '1 year', 'YY')
    ELSE to_char(CURRENT_DATE - interval '1 year', 'YY') || to_char(CURRENT_DATE, 'YY')
  END;

  NEW.issue_number := public.generate_doc_number(
    NEW.company_id, 'consumable_issues', 'issue_number',
    'CIS-' || v_fy, '-', 3
  );
  RETURN NEW;
END;
$func$;

-- ────────────────────────────────────────────────────────────
-- 3. Partial unique indexes — last line of defence (active rows)
-- ────────────────────────────────────────────────────────────
-- Plain UNIQUE (company_id, *_number) constraints would block this
-- migration from applying — production has historical soft-deleted
-- (and, for POs, cancelled) rows that intentionally share numbers
-- with their replacements. Partial unique indexes scope uniqueness
-- to the active row set only, which is the invariant the app
-- actually needs.
--
-- DROP CONSTRAINT IF EXISTS for the plain-UNIQUE names so a re-run
-- after an earlier (now-superseded) revision of this migration is
-- idempotent.

-- grns: soft-delete is the only terminal-hidden status.
ALTER TABLE public.grns
  DROP CONSTRAINT IF EXISTS grns_company_grn_number_key;
DROP INDEX IF EXISTS public.grns_company_grn_number_active_key;
CREATE UNIQUE INDEX IF NOT EXISTS grns_company_grn_number_active_key
  ON public.grns (company_id, grn_number)
  WHERE status IS DISTINCT FROM 'deleted';

-- purchase_orders: both 'deleted' (softDeletePurchaseOrder) and
-- 'cancelled' (cancelPurchaseOrder) are terminal and may carry
-- historical duplicate numbers.
ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_company_po_number_key;
DROP INDEX IF EXISTS public.purchase_orders_company_po_number_active_key;
CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_company_po_number_active_key
  ON public.purchase_orders (company_id, po_number)
  WHERE status IS DISTINCT FROM 'deleted'
    AND status IS DISTINCT FROM 'cancelled';

-- delivery_challans: same soft-delete shape as grns. NOTE: DCs
-- can also be cancelled (cancelDeliveryChallan), but per spec only
-- 'deleted' is excluded here. If a cancelled DC ends up sharing
-- a number with an active one, this index will reject the insert
-- — surface the case before broadening the predicate.
ALTER TABLE public.delivery_challans
  DROP CONSTRAINT IF EXISTS delivery_challans_company_dc_number_key;
DROP INDEX IF EXISTS public.delivery_challans_company_dc_number_active_key;
CREATE UNIQUE INDEX IF NOT EXISTS delivery_challans_company_dc_number_active_key
  ON public.delivery_challans (company_id, dc_number)
  WHERE status IS DISTINCT FROM 'deleted';

-- consumable_issues: 'deleted' added in 20260513000010.
ALTER TABLE public.consumable_issues
  DROP CONSTRAINT IF EXISTS consumable_issues_company_issue_number_key;
DROP INDEX IF EXISTS public.consumable_issues_company_issue_number_active_key;
CREATE UNIQUE INDEX IF NOT EXISTS consumable_issues_company_issue_number_active_key
  ON public.consumable_issues (company_id, issue_number)
  WHERE status IS DISTINCT FROM 'deleted';

NOTIFY pgrst, 'reload schema';
