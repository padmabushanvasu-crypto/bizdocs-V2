-- Email schedule columns for the weekly PO and DC summary Edge Functions.
-- po_email_enabled / po_email_recipients already exist (Phase 19); this adds
-- the day-of-week + send-time controls and the full DC counterpart.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS po_email_day        text   DEFAULT 'Monday',
  ADD COLUMN IF NOT EXISTS po_email_time       text   DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS dc_email_enabled    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS dc_email_recipients jsonb  DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS dc_email_day        text   DEFAULT 'Monday',
  ADD COLUMN IF NOT EXISTS dc_email_time       text   DEFAULT '08:00';

NOTIFY pgrst, 'reload schema';
