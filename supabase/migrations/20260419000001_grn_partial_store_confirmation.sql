-- Migration: partial store confirmation fields for GRN
-- Feature 4A: per-line store confirmation qty + damage tracking
-- and GRN-level partial confirmation flag

-- grn_line_items: per-line confirmation quantities
ALTER TABLE grn_line_items
  ADD COLUMN IF NOT EXISTS store_confirmed_qty    integer       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS damaged_qty            integer       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS damaged_reason         text,
  ADD COLUMN IF NOT EXISTS store_confirmation_notes text;

-- grns: track whether store confirmation was partial
ALTER TABLE grns
  ADD COLUMN IF NOT EXISTS partial_store_confirmed boolean DEFAULT false;

COMMENT ON COLUMN grn_line_items.store_confirmed_qty IS 'Quantity physically confirmed by storekeeper (may be less than conforming_qty)';
COMMENT ON COLUMN grn_line_items.damaged_qty IS 'Units found damaged / short during store receipt';
COMMENT ON COLUMN grn_line_items.damaged_reason IS 'Reason for damage or short receipt';
COMMENT ON COLUMN grn_line_items.store_confirmation_notes IS 'Per-line notes from storekeeper during receipt';
COMMENT ON COLUMN grns.partial_store_confirmed IS 'True when storekeeper confirmed partial quantities; GRN stays awaiting_store until fully confirmed';
