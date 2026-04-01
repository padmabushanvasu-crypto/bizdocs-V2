-- Phase 13: Stock Intelligence Overhaul — Five Stock Buckets

-- Add stock bucket columns to items
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS stock_free numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_in_process numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_in_subassembly_wip numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_in_fg_wip numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_in_fg_ready numeric DEFAULT 0;

-- Migrate existing current_stock to stock_free
UPDATE public.items SET stock_free = COALESCE(current_stock, 0) WHERE stock_free = 0;

-- Add alert level and last check columns
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS stock_alert_level varchar DEFAULT 'healthy'
    CHECK (stock_alert_level IN ('critical','warning','watch','locked','healthy')),
  ADD COLUMN IF NOT EXISTS last_stock_check timestamptz DEFAULT now();

-- Initialize alert levels based on existing data
UPDATE public.items SET
  stock_alert_level = CASE
    WHEN min_stock > 0 AND stock_free <= min_stock THEN 'critical'
    WHEN min_stock > 0 AND (stock_free + stock_in_process) <= min_stock THEN 'warning'
    WHEN min_stock > 0 AND (stock_free + stock_in_process) <= min_stock * 1.2 THEN 'watch'
    WHEN stock_free = 0 AND (stock_in_process + stock_in_subassembly_wip + stock_in_fg_wip + stock_in_fg_ready) > 0 THEN 'locked'
    ELSE 'healthy'
  END;

NOTIFY pgrst, 'reload schema';
