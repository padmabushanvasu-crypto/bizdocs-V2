-- Add vendor_reference and vendor_email to purchase_orders

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS vendor_reference text,
  ADD COLUMN IF NOT EXISTS vendor_email text;

NOTIFY pgrst, 'reload schema';
