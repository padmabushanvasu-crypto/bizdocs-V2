-- Migration: stock_alerts view (reorder / low-stock alerts)
-- Author:  Vasu
-- Date:    2026-08-04
-- Apply:   Supabase SQL Editor only (never `supabase db push`).
--
-- STATUS: ALREADY APPLIED to the live DB. This file brings the repo in sync —
-- the view existed live-only and was never committed. CREATE OR REPLACE is
-- idempotent, so re-running is harmless but unnecessary.
--
-- NOTES:
--   * The view exposes company_id but does NOT self-isolate by tenant — every
--     caller must filter on company_id (see StockAlertsBoard.tsx / reorder-api.ts).
--   * Shortage basis is stock_free vs min_stock (NOT current_stock or a bucket
--     sum); effective_stock = stock_free, shortage = min_stock - stock_free.

CREATE OR REPLACE VIEW stock_alerts AS
SELECT id, company_id, item_code, description, item_type, unit, hsn_sac_code, drawing_number,
       min_stock, aimed_stock, stock_free, stock_in_process, stock_in_subassembly_wip,
       stock_in_fg_wip, stock_in_fg_ready,
       COALESCE(stock_free, 0) AS effective_stock,
       min_stock - COALESCE(stock_free, 0) AS shortage,
       CASE WHEN COALESCE(stock_free, 0) = 0 THEN 'zero' ELSE 'low' END AS alert_type
FROM items i
WHERE min_stock > 0
  AND item_type <> 'service'
  AND status = 'active'
  AND COALESCE(stock_free, 0) < min_stock;
