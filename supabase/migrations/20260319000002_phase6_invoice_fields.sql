-- Phase 6: Add dispatch & transport fields to invoices
-- Supports GST e-way bill, reverse charge, and transport details

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS reverse_charge BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS supply_type TEXT CHECK (supply_type IN ('B2B', 'B2C', 'B2CL', 'SEZWP', 'SEZWOP', 'export')) DEFAULT 'B2B',
  ADD COLUMN IF NOT EXISTS eway_bill_number TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_number TEXT,
  ADD COLUMN IF NOT EXISTS transporter_name TEXT,
  ADD COLUMN IF NOT EXISTS lr_number TEXT,
  ADD COLUMN IF NOT EXISTS lr_date DATE,
  ADD COLUMN IF NOT EXISTS serial_number_ref TEXT,
  ADD COLUMN IF NOT EXISTS dispatch_through TEXT,
  ADD COLUMN IF NOT EXISTS destination TEXT;

COMMENT ON COLUMN invoices.reverse_charge IS 'Whether reverse charge mechanism applies (GST)';
COMMENT ON COLUMN invoices.supply_type IS 'GST supply type for e-filing: B2B, B2C, B2CL, SEZWP, SEZWOP, export';
COMMENT ON COLUMN invoices.eway_bill_number IS 'E-Way Bill number for goods movement';
COMMENT ON COLUMN invoices.vehicle_number IS 'Transport vehicle registration number';
COMMENT ON COLUMN invoices.transporter_name IS 'Name of the transporter/logistics company';
COMMENT ON COLUMN invoices.lr_number IS 'Lorry Receipt / Consignment Note number';
COMMENT ON COLUMN invoices.lr_date IS 'Date of Lorry Receipt';
COMMENT ON COLUMN invoices.serial_number_ref IS 'Serial number reference for serialized goods';
COMMENT ON COLUMN invoices.dispatch_through IS 'Mode/route of dispatch';
COMMENT ON COLUMN invoices.destination IS 'Destination of goods';
