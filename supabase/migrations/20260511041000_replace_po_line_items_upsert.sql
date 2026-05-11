-- Rewrite replace_po_line_items to UPSERT instead of DELETE+INSERT.
-- Why: today the function deletes all po_line_items for the po_id, but that
-- fails when grn_line_items has FK references to those rows. Switching to
-- UPSERT-then-cleanup approach so existing line rows survive (with their ids)
-- and only legitimately-removed lines get deleted.

create or replace function public.replace_po_line_items(
  p_po_id uuid,
  p_company_id uuid,
  p_line_items jsonb
)
returns int
language plpgsql
security definer
as $$
declare
  v_count int;
begin
  -- Guard: PO must exist for this company.
  if not exists (
    select 1 from purchase_orders
    where id = p_po_id and company_id = p_company_id
  ) then
    raise exception 'Purchase order not found for this company'
      using errcode = '22023', hint = 'check po_id and company_id';
  end if;

  -- Step 1: Delete rows whose serial_number is no longer in the new payload.
  -- The grn_line_items FK is now ON DELETE SET NULL, so any GRN line items
  -- referencing this row will have their po_line_item_id silently nulled.
  delete from po_line_items
  where po_id = p_po_id
    and serial_number not in (
      select coalesce((item->>'serial_number')::int, -1)
      from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) item
    );

  -- Step 2: UPSERT each line by (po_id, serial_number).
  -- ON CONFLICT updates in place, preserving id (so GRN FK references hold).
  -- pending_quantity is computed by the existing trigger.
  if p_line_items is not null and jsonb_array_length(p_line_items) > 0 then
    insert into po_line_items (
      po_id, company_id, serial_number, description, drawing_number,
      quantity, unit, unit_price, delivery_date, line_total, gst_rate,
      hsn_sac_code, received_quantity, item_id, quantity_2, unit_2
    )
    select
      p_po_id,
      p_company_id,
      (item->>'serial_number')::int,
      item->>'description',
      item->>'drawing_number',
      (item->>'quantity')::numeric,
      item->>'unit',
      coalesce((item->>'unit_price')::numeric, 0),
      (item->>'delivery_date')::date,
      coalesce((item->>'line_total')::numeric, 0),
      coalesce((item->>'gst_rate')::numeric, 18),
      item->>'hsn_sac_code',
      coalesce((item->>'received_quantity')::numeric, 0),
      (item->>'item_id')::uuid,
      (item->>'quantity_2')::numeric,
      item->>'unit_2'
    from jsonb_array_elements(p_line_items) as item
    on conflict (po_id, serial_number) do update
      set description = excluded.description,
          drawing_number = excluded.drawing_number,
          quantity = excluded.quantity,
          unit = excluded.unit,
          unit_price = excluded.unit_price,
          delivery_date = excluded.delivery_date,
          line_total = excluded.line_total,
          gst_rate = excluded.gst_rate,
          hsn_sac_code = excluded.hsn_sac_code,
          received_quantity = excluded.received_quantity,
          item_id = excluded.item_id,
          quantity_2 = excluded.quantity_2,
          unit_2 = excluded.unit_2;

    get diagnostics v_count = row_count;
  else
    v_count := 0;
  end if;

  return v_count;
end;
$$;

-- Grant execute to authenticated users.
grant execute on function public.replace_po_line_items(uuid, uuid, jsonb) to authenticated;
