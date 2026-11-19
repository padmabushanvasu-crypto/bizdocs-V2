-- 19 Nov 2026 — DC re-issue also nets items that are no longer on the DC.
--
-- Editing an issued DC always re-saves it as pending_approval (issued_at NULL),
-- so trg_dc_line_stock_sync is inert during the edit and the stock follows the
-- document when it is re-approved, through rpc_issue_dc_plain_lines. That RPC
-- only looked at items still on the DC's plain lines: an item swapped out, or a
-- line removed, during the edit was never returned and stayed At Vendor. The
-- frontend's legacy "DC quantity edited after issuance" manual_adjustment used
-- to cover that case by accident (and double-posted every other case); it is
-- removed in the same change-set, so the RPC must own the whole reconciliation.
--
-- Applied live via MCP as a patch on the function as it stood (the body is
-- long and changes often, so it is patched in place rather than restated).
-- The patch raises if the function tail is not exactly what it expects.
do $$
declare d text; d2 text;
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'rpc_issue_dc_plain_lines';

  if position('19 Nov 2026: items this DC has already moved stock' in d) > 0 then
    return; -- already applied
  end if;

  d2 := regexp_replace(d, E'\\n  END LOOP;\\nEND;\\s*\\$function\\$\\s*$',
E'\n  END LOOP;\n\n  -- 19 Nov 2026: items this DC has already moved stock for that are no longer on any plain line (item swapped, or line removed,\n  -- while the DC was being edited) are netted here too. Without this only items still on the DC were reconciled at re-issue, so a\n  -- swapped-out item stayed At Vendor forever. Mirrors v_dc_ledger_drift: an item now carried by a stage-tracked line is left alone.\n  FOR v_agg IN\n    SELECT sl.item_id, COALESCE(SUM(sl.qty_out),0) - COALESCE(SUM(sl.qty_in),0) AS posted\n    FROM stock_ledger sl\n    WHERE sl.reference_type = ''delivery_challan'' AND sl.reference_id = p_dc_id AND sl.transaction_type IN (''dc_issue'',''dc_return'')\n      AND sl.item_id NOT IN (SELECT a.item_id FROM _dc_issue_agg a)\n    GROUP BY sl.item_id\n    HAVING COALESCE(SUM(sl.qty_out),0) - COALESCE(SUM(sl.qty_in),0) <> 0\n  LOOP\n    IF EXISTS (SELECT 1 FROM dc_line_items x WHERE x.dc_id = p_dc_id AND x.item_id = v_agg.item_id AND public._dc_line_is_stage_tracked(x.id, x.job_card_id)) THEN CONTINUE; END IF;\n    PERFORM public._dc_sync_plain_item(p_dc_id, v_agg.item_id);\n    SELECT i.item_code, i.stock_free, i.stock_in_process INTO out_item_code, out_new_free, out_new_in_process FROM items i WHERE i.id = v_agg.item_id;\n    out_item_id := v_agg.item_id; out_qty := 0; out_already_issued := false;\n    RETURN NEXT;\n  END LOOP;\nEND; $function$\n');

  if d2 = d or position('19 Nov 2026: items this DC has already moved stock' in d2) = 0 then
    raise exception 'rpc_issue_dc_plain_lines: patch did not apply — function tail has changed';
  end if;
  execute d2;
end $$;
