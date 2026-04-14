-- DC Approval Workflow: add approval columns to delivery_challans
-- Run in Supabase SQL Editor after deploying code changes.

ALTER TABLE public.delivery_challans
  ADD COLUMN IF NOT EXISTS approval_requested_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_requested_by  TEXT,
  ADD COLUMN IF NOT EXISTS approved_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by            TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason       TEXT,
  ADD COLUMN IF NOT EXISTS rejection_noted        BOOLEAN NOT NULL DEFAULT FALSE;

NOTIFY pgrst, 'reload schema';
