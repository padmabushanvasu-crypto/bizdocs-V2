-- Migration: stock_alerts_view_exclude_asset
-- Author:  Vasu
-- Date:    2026-09-07
-- Apply:   Supabase SQL Editor only (never `supabase db push`).
--
-- STATUS: NOT YET APPLIED — run manually, then verify (see bottom of file).
--
-- Per STOCK_REGISTER_STANDARDS.md §1.6, effective-stock/alerting has one
-- owner: this view. Assets (item_type = 'asset') never carry stock — they
-- must be excluded here the same way 'service' already is, so a min_stock
-- set on an asset row (data-entry mistake or otherwise) can never surface
-- as a reorder alert. Matches the exclusion added in application code
-- (StockAlertsBoard.tsx, Dashboard.tsx, reorder-api.ts) for the same reason.
--
-- Before running: confirmed 0 rows currently match item_type = 'asset' with
-- min_stock > 0 and shortage, so this is a no-op against current data —
-- purely a forward guard.

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
  AND item_type <> 'asset'
  AND status = 'active'
  AND COALESCE(stock_free, 0) < min_stock;

-- Verify:
-- select pg_get_viewdef('public.stock_alerts'::regclass, true);
