CREATE OR REPLACE FUNCTION public.rpc_create_awo(
  p_company_id        uuid,
  p_awo_type          text,
  p_item_id           uuid,
  p_quantity_to_build numeric,
  p_bom_variant_id    uuid DEFAULT NULL,
  p_planned_date      date DEFAULT NULL,
  p_work_order_ref    text DEFAULT NULL,
  p_notes             text DEFAULT NULL,
  p_serial_number     text DEFAULT NULL,
  p_raised_by_user_id uuid DEFAULT NULL,
  p_dedup_window_secs int  DEFAULT 10
)
RETURNS TABLE (awo_id uuid, was_existing boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_item_code text;
  v_item_desc text;
  v_raised_by text;
  v_existing  uuid;
  v_awo_id    uuid;
BEGIN
  IF p_awo_type NOT IN ('sub_assembly', 'finished_good') THEN
    RAISE EXCEPTION 'Invalid awo_type: %', p_awo_type;
  END IF;
  IF COALESCE(p_quantity_to_build, 0) < 1 THEN
    RAISE EXCEPTION 'quantity_to_build must be >= 1 (got %)',
      p_quantity_to_build;
  END IF;

  SELECT i.item_code, i.description
    INTO v_item_code, v_item_desc
  FROM public.items i
  WHERE i.id = p_item_id AND i.company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item % not found for company %',
      p_item_id, p_company_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_company_id::text || '|' || p_item_id::text || '|' || p_awo_type
    || '|' || COALESCE(p_bom_variant_id::text, '')
    || '|' || p_quantity_to_build::text, 0));

  SELECT a.id
    INTO v_existing
  FROM public.assembly_work_orders a
  WHERE a.company_id = p_company_id
    AND a.item_id = p_item_id
    AND a.awo_type = p_awo_type
    AND a.quantity_to_build = p_quantity_to_build
    AND a.bom_variant_id IS NOT DISTINCT FROM p_bom_variant_id
    AND a.status IN ('draft', 'pending_materials')
    AND a.created_at > now() - make_interval(secs => p_dedup_window_secs)
  ORDER BY a.created_at DESC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    awo_id := v_existing;
    was_existing := true;
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_raised_by_user_id IS NOT NULL THEN
    SELECT full_name
      INTO v_raised_by
    FROM public.profiles
    WHERE id = p_raised_by_user_id;
  END IF;

  INSERT INTO public.assembly_work_orders (
    company_id, awo_number, awo_type, awo_date, item_id, item_code,
    item_description, quantity_to_build, bom_variant_id, planned_date,
    work_order_ref, notes, serial_number, raised_by, raised_by_user_id, status)
  VALUES (
    p_company_id, '', p_awo_type, CURRENT_DATE, p_item_id, v_item_code,
    v_item_desc, p_quantity_to_build, p_bom_variant_id, p_planned_date,
    p_work_order_ref, p_notes, p_serial_number, v_raised_by,
    p_raised_by_user_id, 'draft')
  RETURNING id INTO v_awo_id;

  INSERT INTO public.awo_line_items (
    company_id, awo_id, item_id, item_code, item_description, drawing_number,
    required_qty, issued_qty, unit, is_critical, shortage_qty)
  SELECT
    p_company_id, v_awo_id, bl.child_item_id,
    ci.item_code, ci.description, bl.drawing_number,
    bl.quantity * p_quantity_to_build, 0,
    COALESCE(bl.unit, 'NOS'), COALESCE(bl.is_critical, false), 0
  FROM public.bom_lines bl
  JOIN public.items ci
    ON ci.id = bl.child_item_id
   AND ci.company_id = p_company_id
  WHERE bl.company_id = p_company_id
    AND bl.parent_item_id = p_item_id
    AND (p_bom_variant_id IS NULL OR bl.variant_id = p_bom_variant_id);

  awo_id := v_awo_id;
  was_existing := false;
  RETURN NEXT;
  RETURN;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.rpc_create_awo(
  uuid, text, uuid, numeric, uuid, date, text, text, text, uuid, int)
  TO authenticated;
