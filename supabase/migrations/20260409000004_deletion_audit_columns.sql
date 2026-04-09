-- Part 1-3: Add deletion_reason to GRN, DC, PO tables
-- Part 4: Ensure store_confirmed exists on grns (idempotency guard)

ALTER TABLE public.grns
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT DEFAULT NULL;

ALTER TABLE public.grns
  ADD COLUMN IF NOT EXISTS store_confirmed BOOLEAN DEFAULT false;

ALTER TABLE public.delivery_challans
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT DEFAULT NULL;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT DEFAULT NULL;

NOTIFY pgrst, 'reload schema';
