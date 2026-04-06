-- Add product identity check columns to grn_line_items

ALTER TABLE public.grn_line_items
  ADD COLUMN IF NOT EXISTS product_match varchar DEFAULT 'yes'
    CHECK (product_match IN ('yes', 'partial', 'no')),
  ADD COLUMN IF NOT EXISTS matching_units numeric(15,3),
  ADD COLUMN IF NOT EXISTS non_matching_units numeric(15,3),
  ADD COLUMN IF NOT EXISTS mismatch_reason text,
  ADD COLUMN IF NOT EXISTS mismatch_disposition varchar;

NOTIFY pgrst, 'reload schema';
