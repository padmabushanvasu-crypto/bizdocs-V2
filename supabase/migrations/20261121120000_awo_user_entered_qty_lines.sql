-- User-entered quantity BOM lines on assembly work orders (Nov 21, 2026)
--
-- A BOM line with qty_group set is "user enters qty": when a WO is raised the
-- user types the total qty for each line in the group (0 allowed, group total
-- must be > 0). BOM quantity is kept only as a costing reference.
-- First use: VAC. TECH. FRONT PLATE ASSY. vacuum bottles (230059 CG / 230059 - I).
--
-- Inert until a BOM line is tagged with qty_group (tagging is a separate step).

-- 1. Columns ------------------------------------------------------------------
alter table public.bom_lines      add column if not exists qty_group text;
alter table public.awo_line_items add column if not exists qty_group text;
alter table public.assembly_work_orders add column if not exists user_qtys jsonb not null default '{}'::jsonb;

alter table public.bom_lines drop constraint if exists bom_lines_qty_group_xor_alt_group;
alter table public.bom_lines add constraint bom_lines_qty_group_xor_alt_group
  check (qty_group is null or alt_group is null);

-- 2. Validator ----------------------------------------------------------------
create or replace function public._awo_validate_user_qtys(
  p_company_id uuid, p_item_id uuid, p_bom_variant_id uuid, p_user_qtys jsonb)
returns void
language plpgsql stable security definer
set search_path to 'public'
as $function$
declare r record; v_val text; g record;
begin
  if p_user_qtys is not null and jsonb_typeof(p_user_qtys) <> 'object' then
    raise exception 'user_qtys must be an object of {item_id: qty}' using errcode='check_violation';
  end if;

  -- one child item may appear only once among user-qty lines
  if exists (select 1 from bom_lines bl
             where bl.company_id=p_company_id and bl.parent_item_id=p_item_id and bl.qty_group is not null
               and (p_bom_variant_id is null or bl.variant_id=p_bom_variant_id)
             group by bl.child_item_id having count(*)>1) then
    raise exception 'BOM has the same item twice in a user-entered quantity group — fix the BOM first' using errcode='check_violation';
  end if;

  for r in select bl.child_item_id, bl.qty_group, ci.item_code
           from bom_lines bl join items ci on ci.id=bl.child_item_id
           where bl.company_id=p_company_id and bl.parent_item_id=p_item_id and bl.qty_group is not null
             and (p_bom_variant_id is null or bl.variant_id=p_bom_variant_id) loop
    v_val := p_user_qtys->>r.child_item_id::text;
    if v_val is null or btrim(v_val)='' then
      raise exception 'Enter the quantity for % (% — enter 0 if not used)', r.item_code, r.qty_group using errcode='check_violation';
    end if;
    if v_val !~ '^\d+(\.\d+)?$' then
      raise exception 'Quantity for % must be a number 0 or more (got %)', r.item_code, v_val using errcode='check_violation';
    end if;
  end loop;

  for g in select bl.qty_group, string_agg(ci.item_code, ' / ' order by ci.item_code) codes,
                  sum(coalesce(nullif(p_user_qtys->>bl.child_item_id::text,'')::numeric,0)) total
           from bom_lines bl join items ci on ci.id=bl.child_item_id
           where bl.company_id=p_company_id and bl.parent_item_id=p_item_id and bl.qty_group is not null
             and (p_bom_variant_id is null or bl.variant_id=p_bom_variant_id)
           group by 1 loop
    if g.total <= 0 then
      raise exception '% — total quantity must be more than 0 (%)', g.qty_group, g.codes using errcode='check_violation';
    end if;
  end loop;
end $function$;

-- 3. Getter for the raise screen ------------------------------------------------
create or replace function public.rpc_get_bom_user_qty_lines(p_item_id uuid, p_bom_variant_id uuid default null)
returns table(qty_group text, item_id uuid, item_code text, description text, unit text, bom_qty numeric)
language sql stable security invoker
set search_path to 'public'
as $function$
  select bl.qty_group, ci.id, ci.item_code::text, ci.description::text, coalesce(bl.unit,'NOS')::text, bl.quantity
  from bom_lines bl join items ci on ci.id=bl.child_item_id
  where bl.company_id=get_company_id() and bl.parent_item_id=p_item_id and bl.qty_group is not null
    and (p_bom_variant_id is null or bl.variant_id=p_bom_variant_id)
  order by bl.qty_group, ci.item_code;
$function$;

-- 4. rpc_create_awo with p_user_qtys --------------------------------------------
drop function if exists public.rpc_create_awo(uuid,text,uuid,numeric,uuid,date,text,text,text,uuid,integer,jsonb);

create or replace function public.rpc_create_awo(
  p_company_id uuid, p_awo_type text, p_item_id uuid, p_quantity_to_build numeric,
  p_bom_variant_id uuid default null, p_planned_date date default null, p_work_order_ref text default null,
  p_notes text default null, p_serial_number text default null, p_raised_by_user_id uuid default null,
  p_dedup_window_secs integer default 10, p_alt_choices jsonb default null, p_user_qtys jsonb default null)
returns table(awo_id uuid, was_existing boolean)
language plpgsql security definer
set search_path to 'public'
as $function$
DECLARE
  v_item_code text; v_item_desc text; v_raised_by text; v_existing uuid; v_awo_id uuid;
  v_choices jsonb := coalesce(p_alt_choices, '{}'::jsonb);
  v_uq jsonb;
BEGIN
  IF p_awo_type NOT IN ('sub_assembly', 'finished_good', 'component') THEN
    RAISE EXCEPTION 'Invalid awo_type: %', p_awo_type;
  END IF;
  IF COALESCE(p_quantity_to_build, 0) < 1 THEN
    RAISE EXCEPTION 'quantity_to_build must be >= 1 (got %)', p_quantity_to_build;
  END IF;
  SELECT i.item_code, i.description INTO v_item_code, v_item_desc
  FROM public.items i WHERE i.id = p_item_id AND i.company_id = p_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item % not found for company %', p_item_id, p_company_id; END IF;

  PERFORM public._awo_validate_alt_choices(p_company_id, p_item_id, v_choices);
  PERFORM public._awo_validate_user_qtys(p_company_id, p_item_id, p_bom_variant_id, coalesce(p_user_qtys,'{}'::jsonb));

  -- keep only keys that are user-qty lines on this BOM, normalised to numbers
  SELECT coalesce(jsonb_object_agg(bl.child_item_id::text, (p_user_qtys->>bl.child_item_id::text)::numeric), '{}'::jsonb)
    INTO v_uq
  FROM public.bom_lines bl
  WHERE bl.company_id = p_company_id AND bl.parent_item_id = p_item_id AND bl.qty_group IS NOT NULL
    AND (p_bom_variant_id IS NULL OR bl.variant_id = p_bom_variant_id);

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_company_id::text || '|' || p_item_id::text || '|' || p_awo_type
    || '|' || COALESCE(p_bom_variant_id::text, '') || '|' || p_quantity_to_build::text
    || '|' || v_choices::text || '|' || v_uq::text, 0));

  SELECT a.id INTO v_existing FROM public.assembly_work_orders a
  WHERE a.company_id = p_company_id AND a.item_id = p_item_id AND a.awo_type = p_awo_type
    AND a.quantity_to_build = p_quantity_to_build AND a.bom_variant_id IS NOT DISTINCT FROM p_bom_variant_id
    AND a.alt_choices = v_choices AND a.user_qtys = v_uq
    AND a.status IN ('draft', 'pending_materials')
    AND a.created_at > now() - make_interval(secs => p_dedup_window_secs)
  ORDER BY a.created_at DESC LIMIT 1;
  IF v_existing IS NOT NULL THEN awo_id := v_existing; was_existing := true; RETURN NEXT; RETURN; END IF;

  IF p_raised_by_user_id IS NOT NULL THEN
    SELECT full_name INTO v_raised_by FROM public.profiles WHERE id = p_raised_by_user_id;
  END IF;

  INSERT INTO public.assembly_work_orders (company_id, awo_number, awo_type, awo_date, item_id, item_code,
    item_description, quantity_to_build, bom_variant_id, planned_date, work_order_ref, notes, serial_number,
    raised_by, raised_by_user_id, status, alt_choices, user_qtys)
  VALUES (p_company_id, '', p_awo_type, CURRENT_DATE, p_item_id, v_item_code, v_item_desc, p_quantity_to_build,
    p_bom_variant_id, p_planned_date, p_work_order_ref, p_notes, p_serial_number, v_raised_by,
    p_raised_by_user_id, 'draft', v_choices, v_uq)
  RETURNING id INTO v_awo_id;

  INSERT INTO public.awo_line_items (company_id, awo_id, item_id, item_code, item_description, drawing_number,
    required_qty, issued_qty, unit, is_critical, shortage_qty, alt_group, alt_option, qty_group)
  SELECT p_company_id, v_awo_id, bl.child_item_id, ci.item_code, ci.description, bl.drawing_number,
    CASE WHEN bl.qty_group IS NOT NULL THEN (v_uq->>bl.child_item_id::text)::numeric
         ELSE bl.quantity * p_quantity_to_build END,
    0, COALESCE(bl.unit, 'NOS'), COALESCE(bl.is_critical, false), 0,
    bl.alt_group, bl.alt_option, bl.qty_group
  FROM public.bom_lines bl JOIN public.items ci ON ci.id = bl.child_item_id AND ci.company_id = p_company_id
  WHERE bl.company_id = p_company_id AND bl.parent_item_id = p_item_id
    AND (p_bom_variant_id IS NULL OR bl.variant_id = p_bom_variant_id)
    AND (bl.alt_group IS NULL OR bl.alt_option = v_choices->>bl.alt_group)
    AND (bl.qty_group IS NULL OR (v_uq->>bl.child_item_id::text)::numeric > 0);

  awo_id := v_awo_id; was_existing := false; RETURN NEXT; RETURN;
END;
$function$;

-- 5. Change a user-entered qty on an existing WO ---------------------------------
create or replace function public.rpc_set_awo_user_qty(p_awo_id uuid, p_item_id uuid, p_qty numeric)
returns table(out_line_id uuid, out_qty numeric, out_mir_lines_changed integer)
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  a record; b record; l record; m record;
  v_net_issued numeric := 0; v_outstanding numeric; v_open_unissued numeric;
  v_target_mir uuid; v_mir_changed int := 0; v_line_id uuid; v_group_total numeric;
begin
  if p_qty is null or p_qty < 0 then
    raise exception 'Quantity must be 0 or more' using errcode='check_violation';
  end if;

  select * into a from assembly_work_orders where id=p_awo_id for update;
  if not found then raise exception 'Work order % not found', p_awo_id; end if;
  if a.company_id is distinct from get_company_id() then
    raise exception 'Work order % not found', p_awo_id;
  end if;
  if a.deleted_at is not null or a.status not in ('draft','pending_materials') then
    raise exception 'Bottle quantity can only be changed on a draft / pending-materials work order (this one is %)', a.status
      using errcode='check_violation';
  end if;

  select bl.*, ci.item_code ci_code, ci.description ci_desc into b
  from bom_lines bl join items ci on ci.id=bl.child_item_id
  where bl.company_id=a.company_id and bl.parent_item_id=a.item_id and bl.child_item_id=p_item_id
    and bl.qty_group is not null and (a.bom_variant_id is null or bl.variant_id=a.bom_variant_id)
  limit 1;
  if not found then
    raise exception 'This item is not a user-entered quantity line on the work order''s BOM' using errcode='check_violation';
  end if;

  -- WOs raised before the BOM was tagged: stamp the group on their lines
  update awo_line_items x set qty_group=bl.qty_group
  from bom_lines bl
  where x.awo_id=p_awo_id and x.qty_group is null and x.alt_group is null
    and bl.company_id=a.company_id and bl.parent_item_id=a.item_id and bl.child_item_id=x.item_id
    and bl.qty_group=b.qty_group and (a.bom_variant_id is null or bl.variant_id=a.bom_variant_id);

  select * into l from awo_line_items
  where awo_id=p_awo_id and item_id=p_item_id and company_id=a.company_id for update;

  if found then
    v_line_id := l.id;
    v_net_issued := coalesce(l.issued_qty,0) - coalesce(l.returned_qty,0);
    if p_qty < v_net_issued then
      raise exception '% already issued on this work order — return % first before lowering to %',
        v_net_issued, v_net_issued - p_qty, p_qty using errcode='check_violation';
    end if;
  end if;

  -- group total must stay > 0
  select coalesce(sum(case when x.item_id=p_item_id then p_qty else x.required_qty end),0)
    + case when v_line_id is null then p_qty else 0 end
    into v_group_total
  from awo_line_items x where x.awo_id=p_awo_id and x.qty_group=b.qty_group;
  if v_group_total <= 0 then
    raise exception '% — total quantity on the work order must stay more than 0', b.qty_group using errcode='check_violation';
  end if;

  -- write the WO line
  if v_line_id is null then
    if p_qty > 0 then
      insert into awo_line_items (company_id, awo_id, item_id, item_code, item_description, drawing_number,
        required_qty, issued_qty, unit, is_critical, shortage_qty, qty_group)
      values (a.company_id, p_awo_id, p_item_id, b.ci_code, b.ci_desc, b.drawing_number,
        p_qty, 0, coalesce(b.unit,'NOS'), coalesce(b.is_critical,false), 0, b.qty_group)
      returning id into v_line_id;
    end if;
  else
    update awo_line_items set required_qty=p_qty where id=v_line_id;
  end if;

  -- keep open material requests in step: whatever is still to be issued sits on one open MIR line
  if v_line_id is not null then
    v_outstanding := p_qty - v_net_issued;

    perform 1 from mir_line_items ml join material_issue_requests r on r.id=ml.mir_id
     where ml.awo_line_item_id=v_line_id and r.status in ('pending','partially_issued')
     for update of ml, r;

    select r.id into v_target_mir from material_issue_requests r
    where r.awo_id=p_awo_id and r.company_id=a.company_id and r.status in ('pending','partially_issued')
    order by r.created_at desc limit 1;

    if v_target_mir is not null then
      -- park all other open lines for this WO line at what they already issued
      update mir_line_items ml set requested_qty=ml.issued_qty, shortage_qty=0
      from material_issue_requests r
      where r.id=ml.mir_id and ml.awo_line_item_id=v_line_id and r.status in ('pending','partially_issued')
        and ml.mir_id<>v_target_mir and ml.requested_qty<>ml.issued_qty;
      get diagnostics v_mir_changed = row_count;

      select * into m from mir_line_items where mir_id=v_target_mir and awo_line_item_id=v_line_id
      order by created_at desc limit 1;
      if found then
        if coalesce(m.issued_qty,0)=0 and v_outstanding=0 then
          delete from mir_line_items where id=m.id;
        else
          update mir_line_items set requested_qty=coalesce(m.issued_qty,0)+v_outstanding, shortage_qty=0
          where id=m.id and requested_qty is distinct from coalesce(m.issued_qty,0)+v_outstanding;
        end if;
        v_mir_changed := v_mir_changed + 1;
      elsif v_outstanding > 0 then
        insert into mir_line_items (company_id, mir_id, awo_line_item_id, item_id, item_code, item_description,
          drawing_number, requested_qty, issued_qty, shortage_qty, unit)
        values (a.company_id, v_target_mir, v_line_id, p_item_id, b.ci_code, b.ci_desc,
          b.drawing_number, v_outstanding, 0, 0, coalesce(b.unit,'NOS'));
        v_mir_changed := v_mir_changed + 1;
      end if;
    end if;

    -- a zero line with no history is removed so the issue queue doesn't show it
    if p_qty = 0 and coalesce(l.issued_qty,0)=0 and coalesce(l.returned_qty,0)=0
       and not exists (select 1 from mir_line_items x where x.awo_line_item_id=v_line_id)
       and not exists (select 1 from awo_grn_allocations g where g.awo_line_item_id=v_line_id)
       and not exists (select 1 from rm_conversion_grn_allocations g where g.awo_line_item_id=v_line_id) then
      delete from awo_line_items where id=v_line_id;
      v_line_id := null;
    end if;
  end if;

  update assembly_work_orders
     set user_qtys = user_qtys || jsonb_build_object(p_item_id::text, p_qty), updated_at=now()
   where id=p_awo_id;

  out_line_id := v_line_id; out_qty := p_qty; out_mir_lines_changed := v_mir_changed;
  return next;
end $function$;

revoke all on function public.rpc_set_awo_user_qty(uuid,uuid,numeric) from public, anon;
grant execute on function public.rpc_set_awo_user_qty(uuid,uuid,numeric) to authenticated;
grant execute on function public.rpc_get_bom_user_qty_lines(uuid,uuid) to authenticated;
grant execute on function public.rpc_create_awo(uuid,text,uuid,numeric,uuid,date,text,text,text,uuid,integer,jsonb,jsonb) to authenticated;
