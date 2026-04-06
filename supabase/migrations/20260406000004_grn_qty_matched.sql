-- Add numeric qty_matched_qty column to grn_line_items
-- The existing qty_matched boolean column is kept for backward compatibility

ALTER TABLE public.grn_line_items
  ADD COLUMN IF NOT EXISTS qty_matched_qty numeric(15,3);

NOTIFY pgrst, 'reload schema';
