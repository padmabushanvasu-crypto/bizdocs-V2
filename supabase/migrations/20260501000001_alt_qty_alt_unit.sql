-- Alt. Qty / Alt. Unit fields across PO, DC, GRN line items.
-- Optional secondary quantity + unit captured alongside the primary quantity
-- (e.g. ordering rod stock by NOS but tracking weight in KGS).

ALTER TABLE public.po_line_items
  ADD COLUMN IF NOT EXISTS quantity_2 numeric,
  ADD COLUMN IF NOT EXISTS unit_2     varchar;

ALTER TABLE public.dc_line_items
  ADD COLUMN IF NOT EXISTS quantity_2     numeric,
  ADD COLUMN IF NOT EXISTS unit_2         varchar,
  ADD COLUMN IF NOT EXISTS returned_qty_2 numeric;

ALTER TABLE public.grn_line_items
  ADD COLUMN IF NOT EXISTS ordered_qty_2  numeric,
  ADD COLUMN IF NOT EXISTS unit_2         varchar,
  ADD COLUMN IF NOT EXISTS received_now_2 numeric,
  ADD COLUMN IF NOT EXISTS accepted_qty_2 numeric;

NOTIFY pgrst, 'reload schema';
