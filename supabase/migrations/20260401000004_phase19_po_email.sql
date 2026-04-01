-- Phase 19: Weekly PO Email settings

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS po_email_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS po_email_recipients jsonb DEFAULT '[]';
