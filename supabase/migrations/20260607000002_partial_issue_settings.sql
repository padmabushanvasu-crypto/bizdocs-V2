-- Partial-issue reminder settings: a daily email when materials are partially
-- issued and remain outstanding for over a week. Matches the existing email-
-- settings convention on company_settings (boolean enable + jsonb recipients).
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS partial_issue_enabled    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS partial_issue_recipients jsonb   DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
