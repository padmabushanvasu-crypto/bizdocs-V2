-- Fix 6: Final GRN tracking per line item
-- Fix 2: DC over-receipt DB trigger

-- ── Per-line Final GRN flag on grn_line_items ──────────────────────────────────
ALTER TABLE public.grn_line_items
  ADD COLUMN IF NOT EXISTS is_final_grn           boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS final_grn_auto_detected boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS final_grn_reason        text;

-- ── Prevent DC over-receipt at DB level ───────────────────────────────────────
-- When a grn_line_item is linked to a dc_line_item, ensure cumulative
-- received_qty never exceeds the dc_line_item's qty_nos.
CREATE OR REPLACE FUNCTION public.prevent_dc_over_receipt()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_ordered   numeric;
  v_received  numeric;
BEGIN
  IF NEW.dc_line_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(qty_nos, quantity, 0) INTO v_ordered
  FROM dc_line_items
  WHERE id = NEW.dc_line_item_id;

  SELECT COALESCE(SUM(received_qty), 0) INTO v_received
  FROM grn_line_items
  WHERE dc_line_item_id = NEW.dc_line_item_id
    AND id IS DISTINCT FROM NEW.id
    AND grn_id IN (
      SELECT id FROM grns WHERE status NOT IN ('deleted', 'cancelled')
    );

  IF (v_received + COALESCE(NEW.received_qty, 0)) > v_ordered THEN
    RAISE EXCEPTION 'DC over-receipt: cumulative received (%) would exceed ordered (%) for dc_line_item %',
      v_received + COALESCE(NEW.received_qty, 0), v_ordered, NEW.dc_line_item_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_dc_over_receipt ON public.grn_line_items;
CREATE TRIGGER trg_prevent_dc_over_receipt
  BEFORE INSERT OR UPDATE ON public.grn_line_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_dc_over_receipt();

NOTIFY pgrst, 'reload schema';
