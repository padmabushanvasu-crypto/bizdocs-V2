-- Phase 21: Add driver_contact to delivery_challans

ALTER TABLE public.delivery_challans
  ADD COLUMN IF NOT EXISTS driver_contact varchar;

NOTIFY pgrst, 'reload schema';
