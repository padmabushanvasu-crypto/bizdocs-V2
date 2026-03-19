-- FIX 7: Add planned_date and work_order_ref to assembly_orders

ALTER TABLE public.assembly_orders
  ADD COLUMN IF NOT EXISTS planned_date date,
  ADD COLUMN IF NOT EXISTS work_order_ref varchar;

COMMENT ON COLUMN public.assembly_orders.planned_date IS 'Planned date for assembly to be completed';
COMMENT ON COLUMN public.assembly_orders.work_order_ref IS 'Customer order or internal work order reference';
