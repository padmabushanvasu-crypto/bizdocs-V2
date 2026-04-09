-- Add missing columns to company_settings that CompanySettings form tries to save
-- address_line3: physical/factory address line 3 (Landmark / Industrial Area)
-- cin: Corporate Identity Number
-- authorized_signatory: Name printed below signature on documents

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS address_line3 TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS cin TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS authorized_signatory TEXT DEFAULT '';

NOTIFY pgrst, 'reload schema';
