-- GRN store-confirmation double-post fix — DB-side guard.
--
-- NOT YET APPLIED LIVE. Per CLAUDE.md §4 ("Vasu runs ALL SQL manually in the
-- Supabase SQL Editor"), this file is prepared for manual review + apply, not
-- auto-run. Paste-ready, single concern: adds a stock_posted_at guard to
-- rpc_credit_partial_stock, no other logic changed.
--
-- Context: live-DB audit found 619 confirmed duplicate stock_ledger postings
-- (8 Jun–7 Sep 2026) for single-stage GRN lines — one row from the receipt-time
-- "legacy single-stage credit" in recordGRNAndUpdatePO (src/lib/grn-api.ts,
-- notes "... received (single-stage)"), one from Store Confirm's
-- rpc_credit_partial_stock (notes "... store confirmed (partial)"). The
-- receipt-time leg never actually credited stock_free (only the unrelated
-- legacy `current_stock` column) and never set stock_posted_at, so it was a
-- pure ledger-audit bug, not a stock_free double-count — see
-- STOCK_LIFECYCLE_GOVERNANCE.md §2 Stage B. The app-side fix (this same
-- change set) removes that receipt-time ledger write and adds a
-- stock_posted_at check-before-credit in storeConfirmGRNItems.
--
-- This migration adds the matching DB-side backstop: rpc_credit_partial_stock
-- itself now refuses (RAISE EXCEPTION, fail loud per CLAUDE.md §3.6) to post
-- against a grn_line_item whose stock_posted_at is already set, so any other
-- or future caller that skips the app-side check cannot silently re-post.
-- This does not change the row-locking, item-resolution, or ledger-writing
-- logic below — it is purely additive at the top of the function body.
--
-- Verify before commit (paste-ready, run separately):
--   select p.proname, pg_get_functiondef(p.oid)
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'rpc_credit_partial_stock';
-- Expect the guard block (stock_posted_at check) present in the body.

CREATE OR REPLACE FUNCTION public.rpc_credit_partial_stock(
  p_grn_id uuid,
  p_line_id uuid,
  p_item_id uuid,
  p_store_qty numeric,
  p_grn_type text,
  p_grn_number text,
  p_drawing_number text,
  p_company_id uuid,
  p_linked_dc_id uuid DEFAULT NULL::uuid
)
 RETURNS TABLE(out_resolved_item_id uuid, out_item_code text, out_is_dc_return boolean, out_new_free numeric, out_new_in_process numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item_id uuid; v_item_code text; v_item_desc text; v_is_dc_return boolean;
  v_today date := CURRENT_DATE; v_new_free numeric; v_new_in_process numeric; v_match_count int;
  v_prior_posted_at timestamptz;
BEGIN
  IF p_store_qty IS NULL OR p_store_qty <= 0 THEN RETURN; END IF; -- matches "if (!(storeQty > 0)) return;"

  -- GRN-DOUBLE-POST FIX guard. stock_posted_at is grn_line_items' single
  -- source of truth for "this line's stock has already been credited."
  -- Callers (storeConfirmGRNItems) must check-and-skip before invoking this
  -- RPC; this is the fail-loud DB-side backstop for any caller that doesn't.
  -- Row-locked so a concurrent duplicate call can't race past the check.
  SELECT stock_posted_at INTO v_prior_posted_at FROM grn_line_items WHERE id = p_line_id FOR UPDATE;
  IF v_prior_posted_at IS NOT NULL THEN
    RAISE EXCEPTION 'rpc_credit_partial_stock: grn_line_item % already stock-posted at % — refusing to post stock again (grn %). Callers must check grn_line_items.stock_posted_at before invoking this RPC.', p_line_id, v_prior_posted_at, p_grn_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_item_id := p_item_id;
  IF v_item_id IS NULL AND p_drawing_number IS NOT NULL THEN
    SELECT count(*) INTO v_match_count FROM items WHERE company_id = p_company_id AND drawing_revision = p_drawing_number;
    IF v_match_count > 1 THEN
      RAISE EXCEPTION 'creditPartialStock: drawing ''%'' matches multiple items — ambiguous, cannot post credit. Resolve the duplicate first.', p_drawing_number;
    ELSIF v_match_count = 1 THEN
      SELECT id, item_code, description INTO v_item_id, v_item_code, v_item_desc FROM items WHERE company_id=p_company_id AND drawing_revision=p_drawing_number;
    END IF;
  END IF;

  IF v_item_id IS NULL THEN
    RAISE EXCEPTION 'creditPartialStock: cannot resolve item_id for grn=% line=%. This indicates a Store Confirm bypass — storeConfirmGRNItems should have blocked this. Investigate the calling path.', p_grn_id, p_line_id;
  END IF;

  IF v_item_code IS NULL THEN
    SELECT item_code, description INTO v_item_code, v_item_desc FROM items WHERE id = v_item_id;
  END IF;

  v_is_dc_return := (p_grn_type = 'dc_grn') OR (p_linked_dc_id IS NOT NULL);

  PERFORM 1 FROM items i WHERE i.id = v_item_id FOR UPDATE;

  IF v_is_dc_return THEN
    SELECT stock_free, stock_in_process INTO v_new_free, v_new_in_process FROM items WHERE id = v_item_id;
    v_new_in_process := v_new_in_process - p_store_qty;
    v_new_free := v_new_free + p_store_qty;
    IF v_new_in_process < 0 THEN
      RAISE EXCEPTION 'Insufficient in_process stock for item % — % available, % being returned (GRN %)', v_item_code,
        (SELECT stock_in_process FROM items WHERE id=v_item_id), p_store_qty, p_grn_number
        USING ERRCODE = 'check_violation';
    END IF;
    UPDATE items SET stock_free = v_new_free, stock_in_process = v_new_in_process, last_stock_check = now() WHERE id = v_item_id;

    INSERT INTO stock_ledger (company_id, item_id, item_code, item_description, transaction_date, transaction_type,
      qty_in, qty_out, balance_qty, unit_cost, total_value, reference_type, reference_id, reference_number, notes,
      from_state, to_state, created_by)
    VALUES (p_company_id, v_item_id, v_item_code, v_item_desc, v_today, 'dc_return',
      p_store_qty, 0, public._stock_ledger_last_balance(v_item_id) + p_store_qty, 0, 0,
      'grn', p_grn_id, p_grn_number, 'DC return — storekeeper confirmed (partial)',
      'in_process', 'free', auth.uid());
  ELSE
    SELECT stock_free INTO v_new_free FROM items WHERE id = v_item_id;
    v_new_free := v_new_free + p_store_qty;
    UPDATE items SET stock_free = v_new_free, last_stock_check = now() WHERE id = v_item_id;
    SELECT stock_in_process INTO v_new_in_process FROM items WHERE id = v_item_id;

    INSERT INTO stock_ledger (company_id, item_id, item_code, item_description, transaction_date, transaction_type,
      qty_in, qty_out, balance_qty, unit_cost, total_value, reference_type, reference_id, reference_number, notes,
      from_state, to_state, created_by)
    VALUES (p_company_id, v_item_id, v_item_code, v_item_desc, v_today, 'grn_receipt',
      p_store_qty, 0, public._stock_ledger_last_balance(v_item_id) + p_store_qty, 0, 0,
      'grn', p_grn_id, p_grn_number, trim('GRN ' || COALESCE(p_grn_number,'') || ' store confirmed (partial)'),
      'incoming', 'free', auth.uid());
  END IF;

  out_resolved_item_id := v_item_id; out_item_code := v_item_code; out_is_dc_return := v_is_dc_return;
  out_new_free := v_new_free; out_new_in_process := v_new_in_process;
  RETURN NEXT;
END;
$function$;
