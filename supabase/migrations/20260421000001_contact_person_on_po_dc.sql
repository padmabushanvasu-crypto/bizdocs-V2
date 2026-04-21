-- Add vendor contact person to purchase orders
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS vendor_contact_person TEXT;

-- Add party contact person to delivery challans
ALTER TABLE delivery_challans ADD COLUMN IF NOT EXISTS party_contact_person TEXT;
