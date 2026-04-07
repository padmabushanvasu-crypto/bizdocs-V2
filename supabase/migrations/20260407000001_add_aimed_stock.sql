-- Add aimed_stock to items table
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS aimed_stock numeric DEFAULT 0;

-- Add aimed_qty to reorder_rules table
ALTER TABLE public.reorder_rules
  ADD COLUMN IF NOT EXISTS aimed_qty numeric DEFAULT 0;

-- Update existing reorder rules: set aimed_qty = reorder_qty as a reasonable default for existing data
UPDATE public.reorder_rules
  SET aimed_qty = reorder_qty
  WHERE aimed_qty = 0 AND reorder_qty > 0;

NOTIFY pgrst, 'reload schema';
