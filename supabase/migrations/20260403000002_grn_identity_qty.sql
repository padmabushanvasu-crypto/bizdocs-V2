-- Add identity_matched_qty and identity_not_matched_qty to grn_line_items

ALTER TABLE public.grn_line_items
  ADD COLUMN IF NOT EXISTS identity_matched_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS identity_not_matched_qty numeric DEFAULT 0;

NOTIFY pgrst, 'reload schema';
