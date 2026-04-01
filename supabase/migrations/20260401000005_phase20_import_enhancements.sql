-- Phase 20: Data Import Enhancements — add is_critical to items

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS is_critical boolean DEFAULT false;
