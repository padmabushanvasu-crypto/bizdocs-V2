-- Migration: add_asset_to_item_type_check
-- Author:  Vasu
-- Date:    2026-09-07
-- Apply:   Supabase SQL Editor only (never `supabase db push`).
--
-- STATUS: ALREADY APPLIED to the live DB. This file brings the repo in sync —
-- the constraint was updated live-only and was never committed. The DO block
-- is idempotent (drop-then-add), so re-running is harmless but unnecessary.
--
-- Adds 'asset' as a valid items.item_type value, alongside the existing
-- raw_material / component / sub_assembly / bought_out / finished_good /
-- product / consumable / service set. Assets never carry stock — every
-- stock valuation, reorder-alert, and opening-stock query must exclude
-- item_type = 'asset' explicitly (see items_item_type_check below and the
-- companion stock_alerts view migration).

ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_item_type_check;
ALTER TABLE public.items ADD CONSTRAINT items_item_type_check
  CHECK (item_type IN (
    'raw_material','component','sub_assembly','bought_out',
    'finished_good','product','consumable','service','asset'
  ));
