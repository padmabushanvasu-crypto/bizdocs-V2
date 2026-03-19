-- Phase 6: Expand item types to support BOM hierarchy
-- Adds: component, sub_assembly, bought_out item types

ALTER TABLE items
  DROP CONSTRAINT IF EXISTS items_item_type_check;

ALTER TABLE items
  ADD CONSTRAINT items_item_type_check CHECK (
    item_type IN (
      'product',
      'service',
      'consumable',
      'component',
      'sub_assembly',
      'bought_out'
    )
  );

COMMENT ON COLUMN items.item_type IS 'product=finished good, service=service, consumable=indirect material, component=raw/WIP component, sub_assembly=intermediate assembly, bought_out=externally sourced part';
