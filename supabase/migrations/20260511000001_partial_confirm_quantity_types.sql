-- Partial store confirmation — type alignment
--
-- Background: grn_line_items.conforming_qty is numeric(15,3), supporting
-- fractional quantities for items measured in kg / m / gm. But the partial
-- confirmation columns added in 20260419000001 — store_confirmed_qty and
-- damaged_qty — were declared as integer, which silently truncates fractions
-- on UPDATE. Today this is dormant (the API sets a boolean, not these columns)
-- but the partial-confirm rewrite will read and write these as accumulating
-- numerics. Aligning types prevents silent data loss on fractional items.
--
-- ALTER COLUMN ... TYPE numeric(15,3) auto-casts integer values losslessly
-- (1 -> 1.000). No data risk. Idempotent via the conditional pg_attribute check.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.grn_line_items'::regclass
      AND attname = 'store_confirmed_qty'
      AND atttypid = 'integer'::regtype
  ) THEN
    ALTER TABLE public.grn_line_items
      ALTER COLUMN store_confirmed_qty TYPE numeric(15,3) USING store_confirmed_qty::numeric(15,3);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.grn_line_items'::regclass
      AND attname = 'damaged_qty'
      AND atttypid = 'integer'::regtype
  ) THEN
    ALTER TABLE public.grn_line_items
      ALTER COLUMN damaged_qty TYPE numeric(15,3) USING damaged_qty::numeric(15,3);
  END IF;
END $$;

COMMENT ON COLUMN public.grn_line_items.store_confirmed_qty IS
  'Accumulating qty confirmed received by store. Increments across multiple partial confirmations. Line is fully confirmed when store_confirmed_qty + damaged_qty >= conforming_qty.';
COMMENT ON COLUMN public.grn_line_items.damaged_qty IS
  'Qty marked damaged during store receipt. Counts as fulfilled (does not return to pending).';
