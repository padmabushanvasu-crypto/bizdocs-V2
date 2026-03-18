-- Phase 1: Add standard_cost, min_stock_override, parent_item_id to items table

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS standard_cost numeric(15, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_stock_override numeric(15, 4) NULL,
  ADD COLUMN IF NOT EXISTS parent_item_id uuid NULL REFERENCES items(id) ON DELETE SET NULL;

-- stock_status view: resolves effective min stock (override takes precedence over min_stock)
CREATE OR REPLACE VIEW stock_status AS
SELECT
  id,
  item_code,
  description,
  unit,
  item_type,
  current_stock,
  min_stock,
  min_stock_override,
  standard_cost,
  parent_item_id,
  COALESCE(min_stock_override, min_stock) AS effective_min_stock,
  CASE
    WHEN current_stock <= 0 THEN 'red'
    WHEN current_stock < COALESCE(min_stock_override, min_stock) THEN 'amber'
    ELSE 'green'
  END AS stock_status,
  company_id
FROM items
WHERE status = 'active';
