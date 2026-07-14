-- rpc_record_grn.sql
-- Single-stage GRN save in ONE atomic transaction. Replaces the un-transactioned
-- client sequence (createGRN insert -> per-line received_quantity update -> PO
-- status recalc as separate auto-committed round-trips), which let an over-receipt
-- guard throw on any line abort the save AFTER the GRN insert and prior lines'
-- received_quantity had already committed — leaving purchase_orders.status stuck
-- at 'partially_received' because recalc never ran (the PO-status drift bug).
--
-- Everything below runs in the function's implicit transaction: any RAISE rolls
-- back the GRN header, all line items, and every po_line_items update — no partial
-- commit. The PO status recompute is the last step and therefore ALWAYS runs on a
-- successful save (it cannot be skipped by a throw, since a throw rolls it all back).
--
-- PO status rule: per-line (a PO is 'fully_received' only when EVERY line's
-- received_quantity >= its ordered quantity), matching the reviewed decision.
--
-- SCOPE: this does NOT post stock. The legacy single-stage stock/ledger credit
-- (items.current_stock + INCOMING->FREE ledger row) stays in JS after this RPC
-- returns — best-effort/non-fatal, unchanged — a deliberately separate concern.
--
-- grn_number is assigned by trg_grns_assign_number on INSERT (pass '' to let the
-- trigger fill it; a non-empty value is preserved for manual/import overrides).
-- SECURITY DEFINER bypasses RLS, so every statement is explicitly company-scoped
-- on p_company_id (mirrors rpc_confirm_mir). po_line_items are locked FOR UPDATE
-- to close the concurrent-GRN race the old JS left open.
--
-- Down / inverse (run only to roll back):
--   DROP FUNCTION IF EXISTS public.rpc_record_grn(uuid, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.rpc_record_grn(
  p_company_id uuid,
  p_grn        jsonb,
  p_lines      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_grn        public.grns;
  v_grn_id     uuid;
  v_po_id      uuid;
  v_line       jsonb;
  v_po_line_id uuid;
  v_accepted   numeric;
  v_ordered    numeric;
  v_received   numeric;
  v_max        numeric;
  v_desc       text;
  v_all_recv   boolean;
  v_any_recv   boolean;
  v_status     text;
BEGIN
  -- 1. GRN header. grn_number '' -> trg_grns_assign_number fills it.
  INSERT INTO public.grns (
    company_id, grn_number, grn_date, grn_type, po_id, po_number,
    linked_dc_id, linked_dc_number, vendor_id, vendor_name,
    vendor_invoice_number, vendor_invoice_date, transporter_name,
    vehicle_number, lr_reference, driver_name, driver_contact,
    received_by, notes, total_received, total_accepted, total_rejected,
    status, recorded_at, qc_remarks, qc_prepared_by, qc_inspected_by,
    qc_approved_by, inward_sl_no, acceptance_basis
  ) VALUES (
    p_company_id,
    COALESCE(NULLIF(trim(p_grn->>'grn_number'), ''), ''),
    (p_grn->>'grn_date')::date,
    COALESCE(p_grn->>'grn_type', 'po_grn'),
    NULLIF(p_grn->>'po_id', '')::uuid,
    NULLIF(p_grn->>'po_number', ''),
    NULLIF(p_grn->>'linked_dc_id', '')::uuid,
    NULLIF(p_grn->>'linked_dc_number', ''),
    NULLIF(p_grn->>'vendor_id', '')::uuid,
    NULLIF(p_grn->>'vendor_name', ''),
    NULLIF(p_grn->>'vendor_invoice_number', ''),
    NULLIF(p_grn->>'vendor_invoice_date', '')::date,
    NULLIF(p_grn->>'transporter_name', ''),
    NULLIF(p_grn->>'vehicle_number', ''),
    NULLIF(p_grn->>'lr_reference', ''),
    NULLIF(p_grn->>'driver_name', ''),
    NULLIF(p_grn->>'driver_contact', ''),
    NULLIF(p_grn->>'received_by', ''),
    NULLIF(p_grn->>'notes', ''),
    (p_grn->>'total_received')::numeric,
    (p_grn->>'total_accepted')::numeric,
    (p_grn->>'total_rejected')::numeric,
    p_grn->>'status',
    NULLIF(p_grn->>'recorded_at', '')::timestamptz,
    NULLIF(p_grn->>'qc_remarks', ''),
    NULLIF(p_grn->>'qc_prepared_by', ''),
    NULLIF(p_grn->>'qc_inspected_by', ''),
    NULLIF(p_grn->>'qc_approved_by', ''),
    NULLIF(p_grn->>'inward_sl_no', '')::integer,
    COALESCE(p_grn->>'acceptance_basis', 'original')
  )
  RETURNING * INTO v_grn;

  v_grn_id := v_grn.id;
  v_po_id  := v_grn.po_id;

  -- 2. Line items + per-line over-receipt guard + received_quantity update.
  IF p_lines IS NOT NULL AND jsonb_array_length(p_lines) > 0 THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      INSERT INTO public.grn_line_items (
        company_id, grn_id, po_line_item_id, dc_line_item_id, item_id,
        serial_number, description, drawing_number, unit, po_quantity,
        previously_received, previously_received_qty, ordered_qty,
        ordered_qty_2, unit_2, received_now_2, pending_quantity,
        receiving_now, accepted_quantity, rejected_quantity,
        rejection_reason, remarks, rejection_action, replacement_cycle,
        is_replacement, jig_confirmed, stage1_rejected_qty
      ) VALUES (
        p_company_id, v_grn_id,
        NULLIF(v_line->>'po_line_item_id', '')::uuid,
        NULLIF(v_line->>'dc_line_item_id', '')::uuid,
        NULLIF(v_line->>'item_id', '')::uuid,
        (v_line->>'serial_number')::integer,
        v_line->>'description',
        NULLIF(v_line->>'drawing_number', ''),
        v_line->>'unit',
        (v_line->>'po_quantity')::numeric,
        (v_line->>'previously_received')::numeric,
        COALESCE((v_line->>'previously_received')::numeric, 0),
        COALESCE((v_line->>'po_quantity')::numeric, 0),
        NULLIF(v_line->>'ordered_qty_2', '')::numeric,
        NULLIF(v_line->>'unit_2', ''),
        NULLIF(v_line->>'received_now_2', '')::numeric,
        (v_line->>'pending_quantity')::numeric,
        (v_line->>'receiving_now')::numeric,
        (v_line->>'accepted_quantity')::numeric,
        COALESCE((v_line->>'rejected_quantity')::numeric, 0),
        NULLIF(v_line->>'rejection_reason', ''),
        NULLIF(v_line->>'remarks', ''),
        NULLIF(v_line->>'rejection_action', ''),
        COALESCE((v_line->>'replacement_cycle')::integer, 1),
        COALESCE((v_line->>'is_replacement')::boolean, false),
        COALESCE((v_line->>'jig_confirmed')::boolean, false),
        NULLIF(v_line->>'stage1_rejected_qty', '')::numeric
      );

      v_po_line_id := NULLIF(v_line->>'po_line_item_id', '')::uuid;
      v_accepted   := COALESCE((v_line->>'accepted_quantity')::numeric, 0);
      IF v_po_line_id IS NOT NULL AND v_accepted > 0 THEN
        SELECT quantity, COALESCE(received_quantity, 0)
          INTO v_ordered, v_received
        FROM public.po_line_items
        WHERE id = v_po_line_id AND company_id = p_company_id
        FOR UPDATE;
        IF FOUND THEN
          v_max := v_ordered - v_received;
          IF v_accepted > v_max THEN
            v_desc := COALESCE(v_line->>'description', 'item');
            RAISE EXCEPTION
              'Over-receipt for "%": trying to receive % but only % pending (ordered %, already received %). Reduce the quantity or split into a separate GRN.',
              v_desc, v_accepted, v_max, v_ordered, v_received;
          END IF;
          UPDATE public.po_line_items
             SET received_quantity = v_received + v_accepted,
                 pending_quantity  = GREATEST(0, v_ordered - (v_received + v_accepted))
           WHERE id = v_po_line_id AND company_id = p_company_id;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 3. Recompute parent PO status — PER-LINE rule (every line received >= ordered).
  IF v_po_id IS NOT NULL THEN
    SELECT bool_and(COALESCE(received_quantity, 0) >= COALESCE(quantity, 0)),
           bool_or (COALESCE(received_quantity, 0) > 0)
      INTO v_all_recv, v_any_recv
    FROM public.po_line_items
    WHERE po_id = v_po_id AND company_id = p_company_id;

    IF v_all_recv IS NOT NULL THEN   -- NULL only if the PO has no lines; then skip
      v_status := CASE
        WHEN v_all_recv THEN 'fully_received'
        WHEN v_any_recv THEN 'partially_received'
        ELSE 'issued'
      END;
      UPDATE public.purchase_orders
         SET status = v_status
       WHERE id = v_po_id AND company_id = p_company_id;
    END IF;
  END IF;

  RETURN to_jsonb(v_grn);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.rpc_record_grn(uuid, jsonb, jsonb) TO authenticated;

-- Verify:
--   SELECT pg_get_functiondef('public.rpc_record_grn(uuid,jsonb,jsonb)'::regprocedure);
