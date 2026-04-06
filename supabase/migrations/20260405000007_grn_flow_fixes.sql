-- GRN Flow Fixes: per-line store confirmation fields on grn_line_items

ALTER TABLE public.grn_line_items
  ADD COLUMN IF NOT EXISTS store_confirmed     boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS store_confirmed_by  text,
  ADD COLUMN IF NOT EXISTS store_confirmed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS store_location      text;

NOTIFY pgrst, 'reload schema';
