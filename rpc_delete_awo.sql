-- rpc_delete_awo — guarded soft-delete of an assembly work order.
--
-- STATUS: APPLIED to the live Supabase DB and verified present on 2026-07-29.
-- MIGRATION RECORD of the live definition — NOT a pending change; do not re-run
-- expecting a diff.
--
-- Records TWO hardening changes, both applied + verified live 2026-07-29:
--   1. MIR cascade — on delete, still-open MIRs (pending / partially_issued) for
--      the AWO are set to 'cancelled' inside the delete transaction, mirroring the
--      cancel path (production-api.ts:646-655). Without it a soft-deleted AWO left
--      its MIRs open, so a later confirmMaterialIssue could move stock into WIP and
--      resurrect the deleted work order.
--   2. Fail-loud reversal guard — the 'complete' branch no longer clamps output
--      reversal with GREATEST(0, ...). It pre-checks available stock and RAISEs on
--      underflow, then subtracts unclamped — so stock/ledger drift surfaces loudly
--      instead of being silently floored to zero and corrupting the balance.
--
-- Verbatim from pg_get_functiondef, with ONE deviation: a trailing semicolon was
-- added after $function$ so the file is directly runnable (pg_get_functiondef
-- emits none).

CREATE OR REPLACE FUNCTION public.rpc_delete_awo(p_company_id uuid, p_awo_id uuid, p_wip_disposition text DEFAULT NULL::text, p_reverse_output boolean DEFAULT false, p_deleted_by uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(deleted boolean, disposition text)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_awo RECORD;
  v_line RECORD;
  v_outstanding numeric;
  v_any_outstanding boolean := false;
  v_output_item RECORD;
  v_output_ledger RECORD;
  v_moved_on boolean;
  v_available numeric;
  v_disposition text := 'no_stock_impact';
BEGIN
  SELECT * INTO v_awo FROM assembly_work_orders WHERE id = p_awo_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AWO % not found', p_awo_id; END IF;
  IF v_awo.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'AWO % already deleted', v_awo.awo_number; END IF;

  IF v_awo.status IN ('draft','pending_materials') THEN
    -- confirm truly nothing issued
    SELECT bool_or(issued_qty > 0) INTO v_any_outstanding FROM awo_line_items WHERE awo_id = p_awo_id;
    IF v_any_outstanding THEN
      RAISE EXCEPTION 'AWO % has issued lines despite status % -- data inconsistency, resolve manually', v_awo.awo_number, v_awo.status;
    END IF;
    v_disposition := 'no_stock_impact';

  ELSIF v_awo.status IN ('in_progress','awaiting_store') THEN
    FOR v_line IN SELECT * FROM awo_line_items WHERE awo_id = p_awo_id FOR UPDATE LOOP
      v_outstanding := v_line.issued_qty - COALESCE(v_line.returned_qty,0) - COALESCE(v_line.scrapped_qty,0) - COALESCE(v_line.consumed_qty,0);
      IF v_outstanding > 0 THEN
        v_any_outstanding := true;
        IF p_wip_disposition IS NULL THEN
          RAISE EXCEPTION 'AWO % has % outstanding units of % in WIP -- specify p_wip_disposition (return/scrap)', v_awo.awo_number, v_outstanding, v_line.item_code;
        END IF;
        PERFORM rpc_return_or_scrap_wip(p_company_id, v_line.id, v_outstanding, p_wip_disposition, 'Auto-resolved on AWO delete: ' || COALESCE(p_notes,''));
      END IF;
    END LOOP;
    v_disposition := CASE WHEN v_any_outstanding THEN 'wip_' || p_wip_disposition ELSE 'no_stock_impact' END;

  ELSIF v_awo.status = 'complete' THEN
    SELECT * INTO v_output_item FROM items WHERE id = v_awo.item_id FOR UPDATE;
    SELECT * INTO v_output_ledger FROM stock_ledger
      WHERE reference_id = p_awo_id AND transaction_type = 'assembly_output'
      ORDER BY created_at DESC LIMIT 1;

    -- "moved on" = any qty_out on this item after the output posted
    SELECT EXISTS(
      SELECT 1 FROM stock_ledger
      WHERE item_id = v_output_item.id AND qty_out > 0
        AND created_at > v_output_ledger.created_at
    ) INTO v_moved_on;

    IF v_moved_on THEN
      RAISE EXCEPTION 'Cannot delete AWO %: produced stock for % has already moved (dispatched/consumed) -- reverse those transactions first', v_awo.awo_number, v_output_item.item_code;
    END IF;

    IF NOT p_reverse_output THEN
      RAISE EXCEPTION 'AWO % produced % units of % still untouched in stock -- confirm p_reverse_output to reverse before deleting', v_awo.awo_number, v_awo.quantity_to_build, v_output_item.item_code;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(v_output_item.id::text, 0));

    -- Fail loud rather than clamping to zero: a reversal that would drive the
    -- bucket negative means stock/ledger drift, and silently flooring it hides
    -- the discrepancy and corrupts the balance. Abort and force manual review.
    IF v_output_item.item_type IN ('finished_good','product') THEN
      v_available := COALESCE(v_output_item.stock_in_fg_ready,0);
      IF v_available < v_awo.quantity_to_build THEN
        RAISE EXCEPTION 'Cannot reverse AWO %: fg_ready stock for % is % but reversal requires % -- stock/ledger drift, resolve manually before deleting',
          v_awo.awo_number, v_output_item.item_code, v_available, v_awo.quantity_to_build;
      END IF;
      UPDATE items SET stock_in_fg_ready = COALESCE(stock_in_fg_ready,0) - v_awo.quantity_to_build, last_stock_check = now() WHERE id = v_output_item.id;
    ELSE
      v_available := COALESCE(v_output_item.stock_free,0);
      IF v_available < v_awo.quantity_to_build THEN
        RAISE EXCEPTION 'Cannot reverse AWO %: free stock for % is % but reversal requires % -- stock/ledger drift, resolve manually before deleting',
          v_awo.awo_number, v_output_item.item_code, v_available, v_awo.quantity_to_build;
      END IF;
      UPDATE items SET stock_free = stock_free - v_awo.quantity_to_build,
                        current_stock = stock_free - v_awo.quantity_to_build, last_stock_check = now() WHERE id = v_output_item.id;
    END IF;

    INSERT INTO stock_ledger (company_id, item_id, item_code, item_description, transaction_date,
      transaction_type, qty_in, qty_out, balance_qty, unit_cost, total_value, reference_type, reference_id, notes)
    SELECT company_id, id, item_code, description, CURRENT_DATE, 'manual_adjustment', 0, v_awo.quantity_to_build,
           stock_free, standard_cost, v_awo.quantity_to_build*standard_cost, 'awo_delete_reversal', p_awo_id,
           'Reversed output on AWO delete: ' || v_awo.awo_number || ' -- ' || COALESCE(p_notes,'')
    FROM items WHERE id = v_output_item.id;

    v_disposition := 'reversed_output';
  END IF;
  -- status = 'cancelled': falls through with default 'no_stock_impact', already resolved by cancel flow

  -- Cascade: cancel any still-open MIRs for this AWO, in the same transaction as
  -- the delete. Left open, a pending / partially_issued MIR could later be
  -- confirmed and both move stock into WIP and resurrect the deleted AWO.
  UPDATE public.material_issue_requests
     SET status = 'cancelled'
   WHERE awo_id     = p_awo_id
     AND company_id = p_company_id
     AND status IN ('pending', 'partially_issued');

  UPDATE assembly_work_orders
  SET deleted_at = now(), deleted_by = p_deleted_by, delete_disposition = v_disposition, delete_notes = p_notes
  WHERE id = p_awo_id;

  RETURN QUERY SELECT true, v_disposition;
END;
$function$;
