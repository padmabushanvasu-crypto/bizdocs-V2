-- GRN Quantity Guard
-- 1. dc_line_item_id on grn_line_items for DC receipt tracking
-- 2. DB-level trigger preventing PO over-receipt

-- Track which DC line item each GRN line maps to
ALTER TABLE public.grn_line_items
  ADD COLUMN IF NOT EXISTS dc_line_item_id uuid;

CREATE INDEX IF NOT EXISTS idx_grn_line_items_dc_line_item_id
  ON public.grn_line_items(dc_line_item_id);

-- Prevent received_quantity from exceeding ordered quantity on PO line items
CREATE OR REPLACE FUNCTION public.prevent_po_over_receipt()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.received_quantity IS NOT NULL
     AND NEW.quantity IS NOT NULL
     AND NEW.received_quantity > NEW.quantity THEN
    RAISE EXCEPTION 'Over-receipt: received (%) exceeds ordered (%) for PO line item %',
      NEW.received_quantity, NEW.quantity, NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_po_over_receipt ON public.po_line_items;
CREATE TRIGGER trg_prevent_po_over_receipt
  BEFORE INSERT OR UPDATE ON public.po_line_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_po_over_receipt();

NOTIFY pgrst, 'reload schema';
