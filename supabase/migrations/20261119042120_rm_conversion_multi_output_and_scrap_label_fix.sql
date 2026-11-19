-- Applied live 2026-11-19 (version 20261119042120). RM Conversion: one input -> any number of outputs.
--
-- What it does
--   * New table rm_conversion_outputs: one row per produced item of a conversion (RLS on, company-scoped,
--     read-only to the app; rows are written only inside rpc_post_rm_conversion).
--   * Backfill: every existing conversion gets its single output line copied from the header.
--   * rpc_post_rm_conversion: accepts p_payload->'outputs' = [{item_id, qty_base, unit, qty_alt?, alt_unit?, notes?}].
--     The older single-output fields are still accepted. Each line must be a positive qty, in the item's own
--     base unit, and an item may appear on one line only. Raw-material value is shared across lines by qty.
--     The header row keeps the FIRST output line (return shape and old register unchanged).
--   * rpc_reverse_rm_conversion: reverses every output line; if any one is short in Store, nothing is reversed.
--   * Scrap fix: the scrap row used to be inserted with balance_qty NULL (NOT NULL column -> every conversion
--     with scrap errored; none was ever saved) and with no states (would have classified as a second issue
--     out of free). It is now a label on the draw: consumed -> scrap on post, scrap -> consumed on reversal.
--
-- The function edits are text patches on the live definitions with anchor checks (they raise and change
-- nothing if a definition is not what was expected), so the long input-side logic stays byte-identical.
--
-- Dry-run (rolled back) before applying: 100 KGS MSSQTUBE (2 KGS scrap) -> 10 x 230331 DB R2, 6 x 230331 DB R1,
-- 4 x 230331B V2, plus a legacy single-output post; Store and ledger agreed after every step and were restored
-- exactly by reversal.
--
-- Inverse: not a plain undo once a multi-output conversion exists (the old reverse function would return only
-- the first line). Fix forward. The old single-output screen keeps working against these functions, so the
-- frontend can be reverted on its own.

CREATE TABLE public.rm_conversion_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  rm_conversion_id uuid NOT NULL REFERENCES public.rm_conversions(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  item_id uuid NOT NULL REFERENCES public.items(id),
  unit varchar NOT NULL REFERENCES public.uom_master(code),
  qty_base numeric NOT NULL CHECK (qty_base > 0),
  alt_unit varchar REFERENCES public.uom_master(code),
  qty_alt numeric,
  unit_cost numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rm_conversion_id, line_no),
  UNIQUE (rm_conversion_id, item_id)
);
CREATE INDEX rm_conversion_outputs_item_idx ON public.rm_conversion_outputs(item_id);
ALTER TABLE public.rm_conversion_outputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_isolation ON public.rm_conversion_outputs FOR ALL USING (company_id = get_company_id());
REVOKE ALL ON public.rm_conversion_outputs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.rm_conversion_outputs FROM authenticated;
GRANT SELECT ON public.rm_conversion_outputs TO authenticated, powerbi_reader;

-- Existing conversions: one output line each, copied from the header.
INSERT INTO public.rm_conversion_outputs (company_id, rm_conversion_id, line_no, item_id, unit, qty_base, alt_unit, qty_alt, unit_cost, created_at)
SELECT rc.company_id, rc.id, 1, rc.output_item_id, rc.output_unit, rc.output_qty_base, rc.output_alt_unit, rc.output_qty_alt, rc.output_unit_cost, rc.posted_at
FROM public.rm_conversions rc;

DO $do$
DECLARE
  v_def text; p1 int; p2 int; a text;
BEGIN
  ---------------------------------------------------------------- rpc_post_rm_conversion
  v_def := pg_get_functiondef('public.rpc_post_rm_conversion(uuid,jsonb,uuid,uuid)'::regprocedure);
  IF v_def LIKE '%v_outputs%' THEN RAISE EXCEPTION 'rpc_post_rm_conversion already patched'; END IF;

  p1 := position($s$    IF COALESCE((v_input->>'scrap_qty_base')::numeric,0) > 0 THEN$s$ in v_def);
  IF p1 = 0 THEN RAISE EXCEPTION 'post anchor S1'; END IF;
  p2 := position(E'\n  END LOOP;' in substr(v_def, p1));
  IF p2 = 0 THEN RAISE EXCEPTION 'post anchor S2'; END IF;
  p2 := p1 + p2 - 1;
  v_def := left(v_def, p1 - 1) || $blk$    IF COALESCE((v_input->>'scrap_qty_base')::numeric,0) > 0 THEN
      -- The full drawn quantity has already left Store above. This row only labels the offcut part of it
      -- as scrap (consumed -> scrap); it must not move Store stock a second time.
      INSERT INTO public.stock_ledger (company_id, item_id, item_code, item_description, transaction_date,
        transaction_type, qty_in, qty_out, balance_qty, unit_cost, total_value, reference_type, reference_id, from_state, to_state, notes)
      VALUES (p_company_id, v_item.id, v_item.item_code, v_item.description, CURRENT_DATE,
        'scrap_write_off', 0, (v_input->>'scrap_qty_base')::numeric, public.rpc_stock_position_as_of(v_item.id, 'free', now()), v_item.standard_cost,
        (v_input->>'scrap_qty_base')::numeric * COALESCE(v_item.standard_cost,0), 'rm_conversion', v_conv_id,
        'consumed', 'scrap', 'Scrap remainder from RM conversion');
    END IF;$blk$ || substr(v_def, p2);

  a := 'v_existing_alloc RECORD; v_grn_receipt_ledger_id uuid;';
  IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'post anchor A not unique'; END IF;
  v_def := replace(v_def, a, a || E'\n  v_outputs jsonb; v_out jsonb; v_out_item RECORD; v_out_line int := 0; v_out_total_qty numeric := 0; v_out_unit_cost numeric; v_line_qty numeric;');

  p1 := position($s$  v_out_qty := (p_payload->>'output_qty_base')::numeric;$s$ in v_def);
  p2 := position($s$  v_conv_id := gen_random_uuid();$s$ in v_def);
  IF p1 = 0 OR p2 <= p1 THEN RAISE EXCEPTION 'post anchor B % %', p1, p2; END IF;
  v_def := left(v_def, p1 - 1) || $blk$  -- Outputs: either the new 'outputs' array (any number of lines) or the legacy single-output fields.
  IF jsonb_typeof(p_payload->'outputs') = 'array' AND jsonb_array_length(p_payload->'outputs') > 0 THEN
    v_outputs := p_payload->'outputs';
  ELSE
    v_outputs := jsonb_build_array(jsonb_build_object(
      'item_id', p_payload->>'output_item_id',
      'qty_base', p_payload->>'output_qty_base',
      'unit', p_payload->>'output_unit',
      'qty_alt', p_payload->>'output_qty_alt',
      'alt_unit', p_payload->>'output_alt_unit'));
  END IF;

  FOR v_out IN SELECT t.val FROM jsonb_array_elements(v_outputs) WITH ORDINALITY AS t(val, ord) ORDER BY t.ord
  LOOP
    v_out_line := v_out_line + 1;
    v_line_qty := (v_out->>'qty_base')::numeric;
    IF v_line_qty IS NULL OR v_line_qty <= 0 THEN
      RAISE EXCEPTION 'Output line %: quantity must be positive, got %', v_out_line, v_out->>'qty_base';
    END IF;

    SELECT * INTO v_out_item FROM public.items WHERE id = (v_out->>'item_id')::uuid AND company_id = p_company_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Output item % not found for company %', v_out->>'item_id', p_company_id;
    END IF;
    IF (v_out->>'unit') IS DISTINCT FROM v_out_item.unit THEN
      RAISE EXCEPTION 'Output unit % does not match item % base unit % -- fix the item master or the entry, do not silently coerce',
        v_out->>'unit', v_out_item.item_code, v_out_item.unit;
    END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(v_outputs) AS e(val) WHERE e.val->>'item_id' = v_out->>'item_id') > 1 THEN
      RAISE EXCEPTION 'Output item % is listed more than once -- combine it into one line', v_out_item.item_code;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_out_item.id::text, 0));

    v_out_total_qty := v_out_total_qty + v_line_qty;
    IF v_out_line = 1 THEN
      -- the header row carries the first output line (keeps the existing register/return shape)
      v_output_item := v_out_item;
      v_out_qty := v_line_qty;
      v_out_unit := v_out->>'unit';
      v_out_qty_alt := (v_out->>'qty_alt')::numeric;
      v_out_alt_unit := v_out->>'alt_unit';
    END IF;
  END LOOP;

$blk$ || substr(v_def, p2);

  p1 := position(E'  UPDATE public.items SET\n    stock_free = COALESCE(stock_free,0) + v_out_qty,' in v_def);
  p2 := position($s$  IF (p_payload->>'awo_id') IS NOT NULL THEN$s$ in v_def);
  IF p1 = 0 OR p2 <= p1 THEN RAISE EXCEPTION 'post anchor C % %', p1, p2; END IF;
  v_def := left(v_def, p1 - 1) || $blk$  -- Raw-material value is shared across all output lines by quantity.
  v_out_unit_cost := CASE WHEN v_out_total_qty > 0 THEN v_total_rm_value / v_out_total_qty ELSE 0 END;
  v_out_line := 0;
  FOR v_out IN SELECT t.val FROM jsonb_array_elements(v_outputs) WITH ORDINALITY AS t(val, ord) ORDER BY t.ord
  LOOP
    v_out_line := v_out_line + 1;
    v_line_qty := (v_out->>'qty_base')::numeric;
    SELECT * INTO v_out_item FROM public.items WHERE id = (v_out->>'item_id')::uuid AND company_id = p_company_id FOR UPDATE;

    UPDATE public.items SET
      stock_free = COALESCE(stock_free,0) + v_line_qty,
      current_stock = COALESCE(current_stock,0) + v_line_qty,
      last_stock_check = now()
    WHERE id = v_out_item.id;

    INSERT INTO public.stock_ledger (company_id, item_id, item_code, item_description, transaction_date,
      transaction_type, qty_in, qty_out, balance_qty, unit_cost, total_value, reference_type, reference_id, to_state, notes)
    VALUES (p_company_id, v_out_item.id, v_out_item.item_code, v_out_item.description, CURRENT_DATE,
      'assembly_output', v_line_qty, 0, COALESCE(v_out_item.stock_free,0) + v_line_qty,
      v_out_unit_cost, v_line_qty * v_out_unit_cost, 'rm_conversion', v_conv_id, 'free',
      'RM conversion output -- ' || COALESCE(v_out->>'notes', p_payload->>'notes', ''));

    INSERT INTO public.rm_conversion_outputs (company_id, rm_conversion_id, line_no, item_id, unit, qty_base, alt_unit, qty_alt, unit_cost, notes)
    VALUES (p_company_id, v_conv_id, v_out_line, v_out_item.id, v_out->>'unit', v_line_qty,
      v_out->>'alt_unit', (v_out->>'qty_alt')::numeric, v_out_unit_cost, v_out->>'notes');
  END LOOP;

  UPDATE public.rm_conversions SET output_unit_cost = v_out_unit_cost WHERE id = v_conv_id;

$blk$ || substr(v_def, p2);

  a := E'  RETURN QUERY SELECT v_conv_id, v_output_item.item_code,\n    v_out_qty, CASE WHEN v_out_qty > 0 THEN v_total_rm_value / v_out_qty ELSE 0 END;';
  IF position(a in v_def) = 0 THEN RAISE EXCEPTION 'post anchor D'; END IF;
  v_def := replace(v_def, a, '  RETURN QUERY SELECT v_conv_id, v_output_item.item_code, v_out_qty, v_out_unit_cost;');
  EXECUTE v_def;

  ---------------------------------------------------------------- rpc_reverse_rm_conversion
  v_def := pg_get_functiondef('public.rpc_reverse_rm_conversion(uuid,uuid,text,uuid)'::regprocedure);
  IF v_def LIKE '%rm_conversion_outputs%' THEN RAISE EXCEPTION 'rpc_reverse_rm_conversion already patched'; END IF;

  p1 := position($s$    IF v_input.scrap_qty_base > 0 THEN$s$ in v_def);
  IF p1 = 0 THEN RAISE EXCEPTION 'reverse anchor S1'; END IF;
  p2 := position(E'\n  END LOOP;' in substr(v_def, p1));
  IF p2 = 0 THEN RAISE EXCEPTION 'reverse anchor S2'; END IF;
  p2 := p1 + p2 - 1;
  v_def := left(v_def, p1 - 1) || $blk$    IF v_input.scrap_qty_base > 0 THEN
      -- Undo the scrap label only (scrap -> consumed); the full drawn quantity is returned to Store above.
      INSERT INTO public.stock_ledger (company_id, item_id, item_code, item_description, transaction_date,
        transaction_type, qty_in, qty_out, balance_qty, unit_cost, total_value, reference_type, reference_id, from_state, to_state, notes)
      VALUES (p_company_id, v_item.id, v_item.item_code, v_item.description, CURRENT_DATE,
        'manual_adjustment', v_input.scrap_qty_base, 0, public.rpc_stock_position_as_of(v_item.id, 'free', now()), v_item.standard_cost,
        v_input.scrap_qty_base * COALESCE(v_item.standard_cost,0), 'rm_conversion_reversal', p_rm_conversion_id,
        'scrap', 'consumed', 'Scrap label removed on reversal: ' || p_reason);
    END IF;$blk$ || substr(v_def, p2);

  a := '  v_output_item RECORD;';
  IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'reverse anchor A not unique'; END IF;
  v_def := replace(v_def, a, a || E'\n  v_out RECORD;');

  p1 := position($s$  SELECT * INTO v_output_item FROM public.items WHERE id = v_conv.output_item_id FOR UPDATE;$s$ in v_def);
  p2 := position($s$  FOR v_input IN SELECT * FROM public.rm_conversion_inputs WHERE rm_conversion_id = p_rm_conversion_id FOR UPDATE$s$ in v_def);
  IF p1 = 0 OR p2 <= p1 THEN RAISE EXCEPTION 'reverse anchor B % %', p1, p2; END IF;
  v_def := left(v_def, p1 - 1) || $blk$  IF NOT EXISTS (SELECT 1 FROM public.rm_conversion_outputs o WHERE o.rm_conversion_id = p_rm_conversion_id) THEN
    RAISE EXCEPTION 'Conversion % has no output lines recorded -- cannot reverse', p_rm_conversion_id;
  END IF;

  -- Every output line comes back out of Store; if any one of them is short, nothing is reversed.
  FOR v_out IN SELECT o.* FROM public.rm_conversion_outputs o WHERE o.rm_conversion_id = p_rm_conversion_id ORDER BY o.line_no
  LOOP
    SELECT * INTO v_output_item FROM public.items WHERE id = v_out.item_id FOR UPDATE;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_output_item.id::text, 0));

    IF COALESCE(v_output_item.stock_free,0) < v_out.qty_base - 0.0005 THEN
      RAISE EXCEPTION 'Cannot reverse: item % has only % free (need %) -- % units have already been issued/dispatched, reverse those first',
        v_output_item.item_code, v_output_item.stock_free, v_out.qty_base,
        v_out.qty_base - v_output_item.stock_free;
    END IF;

    UPDATE public.items SET
      stock_free = stock_free - v_out.qty_base,
      current_stock = current_stock - v_out.qty_base,
      last_stock_check = now()
    WHERE id = v_output_item.id;

    INSERT INTO public.stock_ledger (company_id, item_id, item_code, item_description, transaction_date,
      transaction_type, qty_in, qty_out, balance_qty, unit_cost, total_value, reference_type, reference_id, from_state, notes)
    VALUES (p_company_id, v_output_item.id, v_output_item.item_code, v_output_item.description, CURRENT_DATE,
      'assembly_return', 0, v_out.qty_base, v_output_item.stock_free - v_out.qty_base,
      v_out.unit_cost, v_out.qty_base * COALESCE(v_out.unit_cost,0),
      'rm_conversion_reversal', p_rm_conversion_id, 'free', 'Reversal: ' || p_reason);
  END LOOP;

$blk$ || substr(v_def, p2);
  EXECUTE v_def;
END;
$do$;
