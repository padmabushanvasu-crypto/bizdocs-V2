ALTER TABLE po_line_items
  ADD COLUMN IF NOT EXISTS item_id UUID REFERENCES items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_po_line_items_item_id ON po_line_items(item_id);
