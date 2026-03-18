
-- Add rate, unit, item_code, hsn_sac_code, amount columns to dc_line_items for professional DC format
ALTER TABLE public.dc_line_items 
  ADD COLUMN IF NOT EXISTS item_code character varying DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hsn_sac_code character varying DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS unit character varying DEFAULT 'NOS',
  ADD COLUMN IF NOT EXISTS quantity numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remarks text DEFAULT NULL;

-- Add vehicle_number and driver_name to delivery_challans
ALTER TABLE public.delivery_challans
  ADD COLUMN IF NOT EXISTS vehicle_number character varying DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS driver_name character varying DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sub_total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_gst numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grand_total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_rate numeric DEFAULT 18,
  ADD COLUMN IF NOT EXISTS po_reference character varying DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS po_date date DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS challan_category character varying DEFAULT 'supply_on_approval',
  ADD COLUMN IF NOT EXISTS prepared_by character varying DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS checked_by character varying DEFAULT NULL;
