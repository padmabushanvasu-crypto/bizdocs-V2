-- Widen party columns that can overflow with real-world data.
-- gstin: 15 chars is correct for Indian GSTIN but some imports include
--        spaces or hyphens — bumping to 20 gives safe headroom.
-- state_code: Indian state codes are 2 chars but we store the 2-digit
--             GSTIN prefix; widen to 10 for international compatibility.
-- address_line1/2/3: 255 can be too short for long addresses from Tally
--                    exports — switch to TEXT (unlimited).
-- name: 255 chars can be hit by long legal entity names — switch to TEXT.

ALTER TABLE public.parties
  ALTER COLUMN gstin         TYPE VARCHAR(20),
  ALTER COLUMN state_code    TYPE VARCHAR(10),
  ALTER COLUMN address_line1 TYPE TEXT,
  ALTER COLUMN address_line2 TYPE TEXT,
  ALTER COLUMN address_line3 TYPE TEXT,
  ALTER COLUMN name          TYPE TEXT;

NOTIFY pgrst, 'reload schema';
