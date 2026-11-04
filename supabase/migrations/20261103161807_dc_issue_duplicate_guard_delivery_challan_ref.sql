-- Applied live 2026-11-03 (version 20261103161807) by Claude audit session.
-- Old guard only checked reference_type='dc_line_item' (never used by the live issue path).
-- Adds a net-based block on full "DC issued:" posts keyed to the challan.
-- Inverse: restore the previous body (dc_line_item check only).
CREATE OR REPLACE FUNCTION public.trg_block_duplicate_dc_issue()
 RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE v_net numeric;
BEGIN
  IF NEW.transaction_type = 'dc_issue' AND NEW.reference_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.stock_ledger WHERE company_id = NEW.company_id AND item_id = NEW.item_id
               AND reference_id = NEW.reference_id AND reference_type = 'dc_line_item' AND transaction_type = 'dc_issue') THEN
      RAISE EXCEPTION 'Duplicate DC issue blocked: this DC line has already relieved stock for item %. Edit the line quantity instead of re-issuing.', NEW.item_code USING ERRCODE = 'unique_violation';
    END IF;
    IF NEW.reference_type = 'delivery_challan' AND COALESCE(NEW.notes,'') LIKE 'DC issued:%' THEN
      SELECT COALESCE(SUM(qty_out),0) - COALESCE(SUM(qty_in),0) INTO v_net FROM public.stock_ledger
      WHERE company_id = NEW.company_id AND item_id = NEW.item_id AND reference_type = 'delivery_challan'
        AND reference_id = NEW.reference_id AND transaction_type IN ('dc_issue','dc_return');
      IF v_net > 0 THEN
        RAISE EXCEPTION 'Duplicate DC issue blocked: % already has % of item % issued. A re-issue must net against what is already out, not post the full quantity again.',
          NEW.reference_number, v_net, NEW.item_code USING ERRCODE = 'unique_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $fn$;
