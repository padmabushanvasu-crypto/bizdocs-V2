-- stock_editor_names: move the Opening Stock audit "edited by" name list from
-- localStorage to company_settings so it's shared company-wide (not per-browser).
-- Matches the existing *_recipients convention (jsonb array).
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS stock_editor_names jsonb DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
