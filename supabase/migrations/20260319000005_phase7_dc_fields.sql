-- FIX 2: Add L.O. No and Approx Value to delivery_challans
-- Add nature_of_process, qty_kgs, qty_sft to dc_line_items

ALTER TABLE public.delivery_challans
  ADD COLUMN IF NOT EXISTS lo_number varchar,
  ADD COLUMN IF NOT EXISTS approx_value numeric DEFAULT 0;

ALTER TABLE public.dc_line_items
  ADD COLUMN IF NOT EXISTS nature_of_process varchar,
  ADD COLUMN IF NOT EXISTS qty_kgs numeric,
  ADD COLUMN IF NOT EXISTS qty_sft numeric;

COMMENT ON COLUMN public.delivery_challans.lo_number IS 'L.O. No — Works Order / Job Order reference number';
COMMENT ON COLUMN public.delivery_challans.approx_value IS 'Approximate value of goods — required for GST e-way bill compliance';
COMMENT ON COLUMN public.dc_line_items.nature_of_process IS 'Nature of job work process e.g. Nickel Plating, CNC Machining & Return, Welding & Return';
COMMENT ON COLUMN public.dc_line_items.qty_kgs IS 'Quantity in KGS — optional weight measurement alongside piece count';
COMMENT ON COLUMN public.dc_line_items.qty_sft IS 'Quantity in SFT — for sheet/plate materials';
