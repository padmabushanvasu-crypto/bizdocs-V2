-- Add DC-origin fields to grn_line_items
-- Required for copying nature_of_process and unit_rate from dc_line_items on DC-GRN creation

ALTER TABLE public.grn_line_items
  ADD COLUMN IF NOT EXISTS nature_of_process text,
  ADD COLUMN IF NOT EXISTS unit_rate         numeric(14,4);

NOTIFY pgrst, 'reload schema';
