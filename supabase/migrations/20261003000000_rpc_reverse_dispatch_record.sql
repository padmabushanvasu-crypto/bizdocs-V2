-- Reverse (reopen) or delete a Dispatch Record, atomically.
--
-- Dispatch confirm (dispatch-api confirmDispatch) posts an `invoice_dispatch`
-- ledger row per line (reference_type 'dispatch_record', from_state in_fg_ready
-- for finished goods or free for resale items) and deducts the bucket.
--
-- This RPC undoes that, driven by the LEDGER (not the line quantities), so it
-- is idempotent and safe to retry:
--   net to reverse per item = SUM(qty_out of 'dispatch_record' rows)
--                           - SUM(qty_in  of 'dispatch_record_reversal' rows)
-- For each item with net > 0 it posts a compensating `manual_adjustment` row
-- (dispatched -> original state, reference_type 'dispatch_record_reversal'),
-- credits stock_in_fg_ready for finished goods (stock_free is synced by the
-- ledger trigger), and resets linked serial numbers to in_stock.
--   p_delete = false -> record returns to 'draft' (editable, re-confirmable)
--   p_delete = true  -> record and its lines are deleted (ledger rows remain
--                       as the audit trail)
-- Draft records have no stock effect: p_delete just removes them.
--
-- DOWN: drop function if exists public.rpc_reverse_dispatch_record(uuid, uuid, boolean);

create or replace function public.rpc_reverse_dispatch_record(
  p_company_id uuid,
  p_dr_id uuid,
  p_delete boolean default false
) returns table(reversed_lines integer, new_status text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_dr record;
  v_row record;
  v_count integer := 0;
begin
  if auth.uid() is null
     or p_company_id is distinct from (select company_id from profiles where id = auth.uid()) then
    raise exception 'Not authorised for company %', p_company_id;
  end if;

  select * into v_dr from dispatch_records
   where id = p_dr_id and company_id = p_company_id for update;
  if not found then
    raise exception 'Dispatch record % not found', p_dr_id;
  end if;

  if v_dr.status = 'draft' then
    if not p_delete then
      raise exception 'Dispatch record % is already a draft', v_dr.dr_number;
    end if;
  else
    for v_row in
      select t.item_id, t.item_code, t.item_description, t.net, t.from_state
        from (
          select l.item_id,
                 max(l.item_code) as item_code,
                 max(l.item_description) as item_description,
                 sum(case when l.reference_type = 'dispatch_record' then l.qty_out else 0 end)
                   - sum(case when l.reference_type = 'dispatch_record_reversal' then l.qty_in else 0 end) as net,
                 max(case when l.reference_type = 'dispatch_record' then l.from_state end) as from_state
            from stock_ledger l
           where l.company_id = p_company_id
             and l.reference_id = p_dr_id
             and l.reference_type in ('dispatch_record', 'dispatch_record_reversal')
           group by l.item_id
        ) t
       where t.net > 0
    loop
      if v_row.from_state is null or v_row.from_state not in ('in_fg_ready', 'free') then
        raise exception 'Cannot reverse % on %: unexpected source state %',
          v_row.item_code, v_dr.dr_number, coalesce(v_row.from_state, 'null');
      end if;

      perform pg_advisory_xact_lock(hashtextextended(v_row.item_id::text, 0));

      perform rpc_post_stock_ledger_row(
        v_row.item_id, v_row.item_code, v_row.item_description, current_date,
        'manual_adjustment', v_row.net, 0, 0, null,
        'dispatch_record_reversal', p_dr_id, v_dr.dr_number,
        'Dispatch ' || case when p_delete then 'deleted' else 'reopened' end || ': ' || v_dr.dr_number,
        'dispatched', v_row.from_state);

      if v_row.from_state = 'in_fg_ready' then
        perform rpc_update_stock_bucket(v_row.item_id, 'in_fg_ready', v_row.net, false);
      end if;

      v_count := v_count + 1;
    end loop;

    update serial_numbers
       set status = 'in_stock', dispatch_date = null
     where company_id = p_company_id
       and status = 'dispatched'
       and (id in (select serial_number_id from dispatch_record_items
                    where dispatch_record_id = p_dr_id and serial_number_id is not null)
            or serial_number in (select serial_number from dispatch_record_items
                                  where dispatch_record_id = p_dr_id and serial_number is not null));
  end if;

  if p_delete then
    delete from dispatch_record_items where dispatch_record_id = p_dr_id;
    delete from dispatch_records where id = p_dr_id and company_id = p_company_id;
    return query select v_count, 'deleted'::text;
  else
    update dispatch_records
       set status = 'draft', dispatched_at = null, delivered_at = null, updated_at = now()
     where id = p_dr_id and company_id = p_company_id;
    return query select v_count, 'draft'::text;
  end if;
end;
$$;

revoke all on function public.rpc_reverse_dispatch_record(uuid, uuid, boolean) from public, anon;
grant execute on function public.rpc_reverse_dispatch_record(uuid, uuid, boolean) to authenticated;
