-- Add raw_material and product to the items.item_type constraint
-- Drop old constraint (name may vary; use IF EXISTS pattern)
ALTER TABLE public.items
  DROP CONSTRAINT IF EXISTS items_item_type_check;

-- Re-add with 8 types
ALTER TABLE public.items
  ADD CONSTRAINT items_item_type_check
  CHECK (item_type IN (
    'raw_material',
    'component',
    'sub_assembly',
    'bought_out',
    'finished_good',
    'product',
    'consumable',
    'service'
  ));

NOTIFY pgrst, 'reload schema';
