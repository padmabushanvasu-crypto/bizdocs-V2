-- ============================================================
-- Consumable Issue: soft-delete with stock reversal
-- ============================================================
-- Mirrors the GRN / DC softDelete pattern. Adds deletion audit
-- columns, extends the consumable_issues.status CHECK to allow
-- 'deleted', and registers a new 'consumable_return' transaction
-- type on stock_ledger for reversal entries.
--
-- Part 1D (auto-serial trigger) is omitted: the existing trigger
-- generate_consumable_issue_number from 20260420000001 already
-- produces CIS-YYYY-NNN (fiscal year) and fires when issue_number
-- is NULL or empty, which is the current code path.

-- 1. Deletion audit columns on consumable_issues
ALTER TABLE public.consumable_issues
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by      UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS stock_action    TEXT;

ALTER TABLE public.consumable_issues
  DROP CONSTRAINT IF EXISTS consumable_issues_stock_action_check;
ALTER TABLE public.consumable_issues
  ADD CONSTRAINT consumable_issues_stock_action_check
  CHECK (
    stock_action IS NULL
    OR stock_action IN ('recall_unused', 'already_consumed', 'partial_return')
  );

-- 2. Extend status CHECK to allow 'deleted'
ALTER TABLE public.consumable_issues
  DROP CONSTRAINT IF EXISTS consumable_issues_status_check;
ALTER TABLE public.consumable_issues
  ADD CONSTRAINT consumable_issues_status_check
  CHECK (status IN ('draft', 'issued', 'deleted'));

-- 3. Register 'consumable_return' on stock_ledger.transaction_type
ALTER TABLE public.stock_ledger
  DROP CONSTRAINT IF EXISTS stock_ledger_transaction_type_check;
ALTER TABLE public.stock_ledger
  ADD CONSTRAINT stock_ledger_transaction_type_check
  CHECK (transaction_type IN (
    'grn_receipt',
    'job_card_issue',
    'job_card_return',
    'assembly_consumption',
    'assembly_output',
    'assembly_issue',
    'assembly_return',
    'scrap_write_off',
    'consumable_issue',
    'consumable_return',
    'invoice_dispatch',
    'dc_issue',
    'dc_return',
    'opening_stock',
    'manual_adjustment',
    'rejection_writeoff'
  ));

NOTIFY pgrst, 'reload schema';
