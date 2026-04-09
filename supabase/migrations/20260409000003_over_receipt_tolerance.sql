-- Over-receipt tolerance and finance approval feature

-- 1. Add 'finance' role to profiles CHECK constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'admin', 'purchase_team', 'inward_team',
    'qc_team', 'storekeeper', 'assembly_team', 'finance'
  ));

-- 2. Add over-receipt tolerance % to company_settings
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS over_receipt_tolerance_percent NUMERIC DEFAULT 0;

-- 3. Add 'pending_finance_approval' to grns.grn_stage
ALTER TABLE public.grns DROP CONSTRAINT IF EXISTS grns_grn_stage_check;
ALTER TABLE public.grns ADD CONSTRAINT grns_grn_stage_check
  CHECK (grn_stage IN (
    'draft', 'quantitative_pending', 'quantitative_done',
    'quality_pending', 'quality_done', 'awaiting_store',
    'pending_finance_approval', 'closed'
  ));

-- 4. Add target_role to notifications
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS target_role TEXT DEFAULT NULL;

-- 5. Add over_receipt columns to grn_line_items
ALTER TABLE public.grn_line_items
  ADD COLUMN IF NOT EXISTS over_receipt_qty NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS over_receipt_decision TEXT DEFAULT NULL
    CHECK (over_receipt_decision IN ('accept_and_pay', 'accept_stock_only', NULL));

NOTIFY pgrst, 'reload schema';
