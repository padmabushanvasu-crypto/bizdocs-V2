-- rpc_confirm_mir.sql
-- Whole-MIR material issue in ONE atomic transaction. Replaces the client-side
-- per-line loop (fresh-read issued_qty -> rpc_confirm_material_issue -> update
-- mir_line_items -> read awo_line_items -> update awo_line_items = 5 round trips
-- per line, ~47 lines/AWO) with a single call.
--
-- BEHAVIOUR CHANGE (intentional, all-or-nothing): if any line's stock move fails
-- (its delta exceeds available free stock), the ENTIRE confirm rolls back — no
-- partial issue across lines. Deliberate partial issues still work: issuing LESS
-- than requested is a recorded shortage_qty, it never raises (a smaller delta is
-- moved). Only an over-issue (delta > free stock) raises. Because the batch is
-- idempotent (target_issued is a CUMULATIVE target), a re-submit after topping up
-- the short line re-issues everything cleanly (already-correct lines -> delta 0).
--
-- Composes the hardened rpc_confirm_material_issue for the actual stock move +
-- assembly_issue ledger row (does NOT duplicate that logic). Reads current
-- issued_qty inside the txn (FOR UPDATE) so the delta computation is atomic —
-- closes the TOCTOU window the old JS fresh-read+separate-call left open.
--
-- Down / inverse (run only to roll back):
--   DROP FUNCTION IF EXISTS public.rpc_confirm_mir(uuid, uuid, jsonb, uuid);

CREATE OR REPLACE FUNCTION public.rpc_confirm_mir(
  p_company_id uuid,
  p_mir_id     uuid,
  p_lines      jsonb,
  p_issued_by  uuid DEFAULT NULL
)
RETURNS TABLE (
  mir_line_id  uuid,
  issued_qty   numeric,
  shortage_qty numeric,
  delta        numeric,
  mir_status   text,
  awo_status   text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
#variable_conflict use_column
DECLARE
  v_awo_id         uuid;
  v_awo_number     text;
  v_awo_status     text;
  v_mir_status     text;
  v_issued_by_name text;
  v_has_shortage   boolean := false;
  v_line           jsonb;
  v_mir_line_id    uuid;
  v_target         numeric;
  v_notes          text;
  v_current        numeric;
  v_requested      numeric;
  v_item_id        uuid;
  v_awo_line_id    uuid;
  v_delta          numeric;
  v_new_issued     numeric;
  v_new_shortage   numeric;
  -- per-line results, emitted after the aggregate status is known
  r_mir_line_id uuid[]    := '{}';
  r_issued      numeric[] := '{}';
  r_shortage    numeric[] := '{}';
  r_delta       numeric[] := '{}';
  i             int;
BEGIN
  -- Resolve + lock the MIR header (company-scoped) and its AWO.
  SELECT m.awo_id INTO v_awo_id
  FROM public.material_issue_requests m
  WHERE m.id = p_mir_id AND m.company_id = p_company_id
  FOR UPDATE;
  IF v_awo_id IS NULL THEN
    RAISE EXCEPTION 'MIR % not found for company %', p_mir_id, p_company_id;
  END IF;

  SELECT a.awo_number, a.status
    INTO v_awo_number, v_awo_status
  FROM public.assembly_work_orders a
  WHERE a.id = v_awo_id AND a.company_id = p_company_id
  FOR UPDATE;

  -- Status guard (same rule the client enforced pre-loop): only a WO awaiting or
  -- using materials may receive an issue.
  IF v_awo_status NOT IN ('pending_materials', 'in_progress') THEN
    RAISE EXCEPTION
      'Cannot issue materials: work order is ''%''. Only pending_materials or in_progress work orders can receive an issue.',
      v_awo_status;
  END IF;

  -- Resolve the issuer's display name (keeps material_issue_requests.issued_by
  -- populated for the UI, alongside issued_by_user_id).
  IF p_issued_by IS NOT NULL THEN
    SELECT full_name INTO v_issued_by_name FROM public.profiles WHERE id = p_issued_by;
  END IF;

  -- Loop the batch. Each line: derive delta atomically, move stock via the
  -- hardened primitive, then persist the mir_line + awo_line accruals.
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_mir_line_id := (v_line->>'mir_line_id')::uuid;
    v_target      := COALESCE((v_line->>'target_issued')::numeric, 0);
    v_notes       := v_line->>'shortage_notes';

    -- Lock the MIR line, read authoritative current issued_qty + context.
    SELECT ml.issued_qty, ml.requested_qty, ml.item_id, ml.awo_line_item_id
      INTO v_current, v_requested, v_item_id, v_awo_line_id
    FROM public.mir_line_items ml
    WHERE ml.id = v_mir_line_id AND ml.mir_id = p_mir_id AND ml.company_id = p_company_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'MIR line % does not belong to MIR %', v_mir_line_id, p_mir_id;
    END IF;

    v_current := COALESCE(v_current, 0);
    v_delta   := GREATEST(0, v_target - v_current);

    -- Stock move via the hardened primitive (free -> WIP + assembly_issue ledger,
    -- WIP bucket derived by awo_type inside it). RAISES on insufficient stock ->
    -- the whole transaction rolls back (all-or-nothing).
    IF v_delta > 0 AND v_item_id IS NOT NULL THEN
      PERFORM * FROM public.rpc_confirm_material_issue(
        p_company_id => p_company_id,
        p_item_id    => v_item_id,
        p_qty        => v_delta,
        p_awo_id     => v_awo_id,
        p_notes      => 'Material issued for AWO #' || COALESCE(v_awo_number, '')
      );
    END IF;

    v_new_issued   := v_current + v_delta;
    v_new_shortage := GREATEST(0, COALESCE(v_requested, 0) - v_new_issued);
    IF v_new_shortage > 0 THEN
      v_has_shortage := true;
    END IF;

    -- Persist the MIR line (cumulative issued + shortage + notes).
    UPDATE public.mir_line_items
       SET issued_qty     = v_new_issued,
           shortage_qty   = v_new_shortage,
           shortage_notes = v_notes
     WHERE id = v_mir_line_id AND company_id = p_company_id;

    -- Accrue the linked AWO line by the actual delta (atomic read-modify-write).
    IF v_awo_line_id IS NOT NULL AND v_delta > 0 THEN
      UPDATE public.awo_line_items
         SET issued_qty = COALESCE(issued_qty, 0) + v_delta
       WHERE id = v_awo_line_id AND company_id = p_company_id;
    END IF;

    r_mir_line_id := array_append(r_mir_line_id, v_mir_line_id);
    r_issued      := array_append(r_issued, v_new_issued);
    r_shortage    := array_append(r_shortage, v_new_shortage);
    r_delta       := array_append(r_delta, v_delta);
  END LOOP;

  -- Once, after the loop: MIR overall status + AWO status transition, atomic with
  -- every line move (same outcome the client wrote post-loop).
  v_mir_status := CASE WHEN v_has_shortage THEN 'partially_issued' ELSE 'issued' END;

  UPDATE public.material_issue_requests
     SET status            = v_mir_status,
         issue_date        = CURRENT_DATE,
         issued_by         = COALESCE(v_issued_by_name, issued_by),
         issued_by_user_id = p_issued_by
   WHERE id = p_mir_id AND company_id = p_company_id;

  UPDATE public.assembly_work_orders
     SET status     = 'in_progress',
         updated_at = now()
   WHERE id = v_awo_id AND company_id = p_company_id;

  -- Emit per-line results + the aggregate status (identical on every row).
  FOR i IN 1 .. COALESCE(array_length(r_mir_line_id, 1), 0)
  LOOP
    mir_line_id  := r_mir_line_id[i];
    issued_qty   := r_issued[i];
    shortage_qty := r_shortage[i];
    delta        := r_delta[i];
    mir_status   := v_mir_status;
    awo_status   := 'in_progress';
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$func$;

-- Match the grant the other rpc_* functions carry (adjust the role if your other
-- RPCs use a different one — confirm against an existing rpc definition).
GRANT EXECUTE ON FUNCTION public.rpc_confirm_mir(uuid, uuid, jsonb, uuid) TO authenticated;

-- Verify:
--   SELECT pg_get_functiondef('public.rpc_confirm_mir(uuid,uuid,jsonb,uuid)'::regprocedure);
