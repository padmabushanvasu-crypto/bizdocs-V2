-- Applied live 2026-11-19 (version 20261119043208). RM Conversion hardening (post + reverse).
--
-- What it does
--   * stock_free moves only through ledger rows. The direct `UPDATE items SET stock_free ...` writes are gone:
--     the ledger-ownership triggers were already overriding them, and each one logged a row to
--     stock_bucket_sync_log. Stock results are identical; the log noise is gone (0 rows in the dry run).
--   * Rejects, with a clear message: a non-zero Return Qty (the returned part was never put back into stock),
--     negative scrap, and a conversion with no input lines.
--   * Item locks are taken up front in one fixed order (inputs and outputs together, post and reverse), so two
--     conversions posted at the same moment cannot deadlock each other.
--   * A logged-in caller can only post/reverse for their own company (auth.uid() -> get_company_id()).
--     Server-side callers with no login (migrations, rpc_delete_awo's internal call) are unaffected.
--   * EXECUTE removed from PUBLIC/anon on both functions; authenticated and service_role keep it.
--
-- Text patches on the live definitions with anchor checks, applied on top of 20261119042120.
--
-- Dry-run (rolled back) before applying — all passed: legacy and multi-output post, scrap, reversal restoring
-- Store/ledger/current_stock exactly, double reversal blocked, idempotent replay (same key = one conversion),
-- same item as input and output, every rejection above, reversal refused with nothing half-reversed once a
-- produced part had been used. After applying: post + reverse as a logged-in user of the company succeeds,
-- a login from outside the company is refused, an anonymous call is refused, and the app can read but not
-- write rm_conversion_outputs.
--
-- Inverse: GRANT EXECUTE ... TO anon re-opens anonymous execution (do not). The guards and lock order have no
-- reason to be undone; fix forward.

DO $do$
DECLARE
  v_def text; p1 int; a text;
BEGIN
  v_def := pg_get_functiondef('public.rpc_post_rm_conversion(uuid,jsonb,uuid,uuid)'::regprocedure);
  IF v_def LIKE '%v_lock_key%' THEN RAISE EXCEPTION 'post already hardened'; END IF;

  a := E'BEGIN\n  IF p_idempotency_key IS NOT NULL THEN';
  IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'P1 anchor'; END IF;
  v_def := replace(v_def, a, $blk$BEGIN
  -- A logged-in caller may only post for their own company. Server-side callers (no login) are trusted.
  IF auth.uid() IS NOT NULL AND p_company_id IS DISTINCT FROM public.get_company_id() THEN
    RAISE EXCEPTION 'Not allowed: this login does not belong to the company being posted to' USING ERRCODE = '42501';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN$blk$);

  a := 'v_out_unit_cost numeric; v_line_qty numeric;';
  IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'P-declare anchor'; END IF;
  v_def := replace(v_def, a, a || ' v_lock_key text;');

  a := $s$  FOR v_out IN SELECT t.val FROM jsonb_array_elements(v_outputs) WITH ORDINALITY AS t(val, ord) ORDER BY t.ord$s$;
  IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 2 THEN RAISE EXCEPTION 'P2 anchor'; END IF;
  p1 := position(a in v_def);
  v_def := left(v_def, p1 - 1) || $blk$  IF p_payload->'inputs' IS NULL OR jsonb_typeof(p_payload->'inputs') <> 'array' OR jsonb_array_length(p_payload->'inputs') = 0 THEN
    RAISE EXCEPTION 'At least one input line is required -- a conversion cannot produce parts from nothing';
  END IF;

  -- Take every item lock up front in one fixed order (inputs and outputs together), so two
  -- conversions posted at the same moment can never deadlock each other.
  FOR v_lock_key IN
    SELECT DISTINCT (x.id)::uuid::text
    FROM (SELECT e.val->>'item_id' AS id FROM jsonb_array_elements(v_outputs) AS e(val)
          UNION ALL
          SELECT e.val->>'item_id' FROM jsonb_array_elements(p_payload->'inputs') AS e(val)) x
    WHERE x.id IS NOT NULL
    ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));
  END LOOP;

$blk$ || substr(v_def, p1);

  a := $s$    v_consume_qty := v_qty_base - COALESCE((v_input->>'scrap_qty_base')::numeric,0) - COALESCE((v_input->>'return_qty_base')::numeric,0);$s$;
  IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'P3 anchor'; END IF;
  v_def := replace(v_def, a, $blk$    IF COALESCE((v_input->>'return_qty_base')::numeric,0) <> 0 THEN
      RAISE EXCEPTION 'Item %: Return Qty is not supported -- enter only the quantity actually used in "Qty used"', v_item.item_code;
    END IF;
    IF COALESCE((v_input->>'scrap_qty_base')::numeric,0) < 0 THEN
      RAISE EXCEPTION 'Item %: scrap quantity cannot be negative', v_item.item_code;
    END IF;

$blk$ || a);

  a := 'UPDATE public.items SET stock_free = v_new_balance, current_stock = v_new_balance, last_stock_check = now() WHERE id = v_item.id;';
  IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 2 THEN RAISE EXCEPTION 'P4 anchor'; END IF;
  v_def := replace(v_def, a, '-- stock_free is ledger-owned: the ledger row below moves it (trg_stock_ledger_sync_free).');

  a := E'    UPDATE public.items SET\n      stock_free = COALESCE(stock_free,0) + v_line_qty,\n      current_stock = COALESCE(current_stock,0) + v_line_qty,\n      last_stock_check = now()\n    WHERE id = v_out_item.id;\n';
  IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'P5 anchor'; END IF;
  v_def := replace(v_def, a, E'    -- stock_free is ledger-owned: the ledger row below moves it (trg_stock_ledger_sync_free).\n');
  EXECUTE v_def;

  v_def := pg_get_functiondef('public.rpc_reverse_rm_conversion(uuid,uuid,text,uuid)'::regprocedure);
  IF v_def LIKE '%fixed order%' THEN RAISE EXCEPTION 'reverse already hardened'; END IF;

  a := E'BEGIN\n  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN';
  IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'R1 anchor'; END IF;
  v_def := replace(v_def, a, $blk$BEGIN
  -- A logged-in caller may only reverse for their own company. Server-side callers (no login) are trusted.
  IF auth.uid() IS NOT NULL AND p_company_id IS DISTINCT FROM public.get_company_id() THEN
    RAISE EXCEPTION 'Not allowed: this login does not belong to the company of this conversion' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN$blk$);

  a := $s$  -- Every output line comes back out of Store; if any one of them is short, nothing is reversed.$s$;
  IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'R2 anchor'; END IF;
  v_def := replace(v_def, a, $blk$  -- Take every item lock up front in one fixed order (same order the post uses).
  FOR v_out IN
    SELECT DISTINCT x.id::text AS k
    FROM (SELECT o.item_id AS id FROM public.rm_conversion_outputs o WHERE o.rm_conversion_id = p_rm_conversion_id
          UNION ALL
          SELECT i.item_id FROM public.rm_conversion_inputs i WHERE i.rm_conversion_id = p_rm_conversion_id) x
    ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(v_out.k, 0));
  END LOOP;

$blk$ || a);

  a := E'    UPDATE public.items SET\n      stock_free = stock_free - v_out.qty_base,\n      current_stock = current_stock - v_out.qty_base,\n      last_stock_check = now()\n    WHERE id = v_output_item.id;\n';
  IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'R3 anchor'; END IF;
  v_def := replace(v_def, a, E'    -- stock_free is ledger-owned: the ledger row below moves it (trg_stock_ledger_sync_free).\n');

  a := E'      UPDATE public.items SET stock_free = COALESCE(stock_free,0) + v_input.qty_base,\n        current_stock = COALESCE(current_stock,0) + v_input.qty_base, last_stock_check = now()\n      WHERE id = v_item.id;\n';
  IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'R4 anchor'; END IF;
  v_def := replace(v_def, a, E'      -- stock_free is ledger-owned: the ledger row below moves it (trg_stock_ledger_sync_free).\n');
  EXECUTE v_def;
END;
$do$;

REVOKE EXECUTE ON FUNCTION public.rpc_post_rm_conversion(uuid,jsonb,uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_reverse_rm_conversion(uuid,uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_post_rm_conversion(uuid,jsonb,uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_reverse_rm_conversion(uuid,uuid,text,uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
