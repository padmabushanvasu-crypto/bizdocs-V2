-- Add registered address fields to company_settings
-- Existing address_line1/2/city/state/pin_code fields = physical/factory address
-- New registered_* fields = registered office address (for legal/GST correspondence)

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS registered_address_line1 varchar,
  ADD COLUMN IF NOT EXISTS registered_address_line2 varchar,
  ADD COLUMN IF NOT EXISTS registered_address_line3 varchar,
  ADD COLUMN IF NOT EXISTS registered_city varchar,
  ADD COLUMN IF NOT EXISTS registered_state varchar,
  ADD COLUMN IF NOT EXISTS registered_state_code varchar,
  ADD COLUMN IF NOT EXISTS registered_pin_code varchar;

-- Add new document settings columns for print customisation
ALTER TABLE public.document_settings
  ADD COLUMN IF NOT EXISTS show_hsn boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_rate_amount boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_nature_of_process boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_vehicle_details boolean DEFAULT true;

NOTIFY pgrst, 'reload schema';
