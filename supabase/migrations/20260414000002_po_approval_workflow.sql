-- Migration: PO Approval Workflow
-- Adds approval metadata columns to purchase_orders.
-- Status values 'pending_approval' and 'rejected' are added as valid text values
-- (the status column has no enum constraint — it is plain TEXT).

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS approval_requested_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_requested_by  TEXT,
  ADD COLUMN IF NOT EXISTS approved_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by            TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason       TEXT,
  ADD COLUMN IF NOT EXISTS rejection_noted        BOOLEAN NOT NULL DEFAULT FALSE;

-- Reload PostgREST schema cache so new columns are immediately accessible via the API
NOTIFY pgrst, 'reload schema';
