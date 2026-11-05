-- Applied live 05-Nov-2026 via apply_migration 'credit_partial_stock_like_for_like_receipt'.
-- Adds a like_for_like branch to rpc_credit_partial_stock (anchor-replace on the live body).
-- Data corrections the same day (execute_sql, notes 'AUDIT-2026-11-05'): 230381 MS A/B/C and 230381 J
-- In Process restored to 10 each by free->in_process mirror correction.

-- Branch inserted before: PERFORM 1 FROM items i WHERE i.id = v_item_id FOR UPDATE;
  -- LIKE-FOR-LIKE RECEIPT (05 Nov 2026): DC sent item X, job worker returned item Y under a 1:1
  -- 'like_for_like' mapping (e.g. 230238 A V2 -> 230238AVACUUM17POS). The units sit in X's In Process,
  -- so relieve X (consumed into Y) and receive Y into free, one for one. Previously this path looked
  -- for Y in In Process and failed ("Insufficient in_process stock").
  IF v_is_dc_return AND v_dc_item IS NOT NULL AND v_line_item IS NOT NULL AND v_dc_item <> v_line_item
     AND EXISTS (SELECT 1 FROM item_conversions c WHERE c.from_item_id = v_dc_item AND c.to_item_id = v_line_item
                 AND c.conversion_mode = 'like_for_like') THEN
    IF v_item_id IS DISTINCT FROM v_line_item THEN
      RAISE EXCEPTION 'Like-for-like receipt: store confirm sent item % but GRN % line is item % — refusing to credit the wrong item', v_item_id, p_grn_number, v_line_item
        USING ERRCODE = 'check_violation';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_dc_item::text, 0));
    SELECT item_code, description INTO v_dc_code, v_dc_desc FROM items WHERE id = v_dc_item;
    IF rpc_stock_position_as_of(v_dc_item, 'in_process', now()) < p_store_qty - 0.0005 THEN
      RAISE EXCEPTION 'Insufficient In Process stock for sent item % — % available, % being returned as % (GRN %)', v_dc_code,
        rpc_stock_position_as_of(v_dc_item, 'in_process', now()), p_store_qty, v_item_code, p_grn_number
        USING ERRCODE = 'check_violation';
    END IF;
    PERFORM rpc_post_stock_ledger_row(v_dc_item, v_dc_code, v_dc_desc, v_today, 'assembly_consumption', 0, p_store_qty, 0, 0,
      'dc_line_conversion', v_dli_id, p_grn_number,
      format('Returned as like-for-like %s — sent %s relieved from In Process (GRN %s)', v_item_code, v_dc_code, p_grn_number),
      'in_process', 'consumed');
    PERFORM rpc_post_stock_ledger_row(v_item_id, v_item_code, v_item_desc, v_today, 'dc_return', p_store_qty, 0, 0, 0,
      'grn', p_grn_id, p_grn_number,
      format('DC return — storekeeper confirmed (partial) — like-for-like from DC item %s', v_dc_code),
      'incoming', 'free');
    SELECT stock_free, stock_in_process INTO v_new_free, v_new_in_process FROM items WHERE id = v_item_id;
    out_resolved_item_id := v_item_id; out_item_code := v_item_code; out_is_dc_return := v_is_dc_return;
    out_new_free := v_new_free; out_new_in_process := v_new_in_process;
    RETURN NEXT;
    RETURN;
  END IF;

