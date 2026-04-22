-- Add country field to parties table
ALTER TABLE parties
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'India';

-- Add foreign currency fields to purchase_orders
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS currency_symbol TEXT DEFAULT '₹',
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(10,4) DEFAULT 1;

-- Add foreign currency fields to delivery_challans
ALTER TABLE delivery_challans
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS currency_symbol TEXT DEFAULT '₹',
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(10,4) DEFAULT 1;
