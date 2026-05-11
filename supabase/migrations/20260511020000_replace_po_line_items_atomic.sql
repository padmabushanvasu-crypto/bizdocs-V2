-- Atomic replacement of po_line_items for a given po_id.
-- Replaces today's non-transactional DELETE + INSERT pattern in
-- updatePurchaseOrder. Either both succeed or both roll back.
--
-- Returns the count of inserted rows. Throws on any failure.
--
-- Note: pending_quantity is auto-maintained by trigger
-- trg_po_line_items_sync_pending_quantity, so this function does NOT
-- write it. It writes the other columns and the trigger fills it in.

create or replace function replace_po_line_items(
  p_po_id uuid,
  p_company_id uuid,
  p_line_items jsonb  -- array of line item objects
)
returns int
language plpgsql
security definer
as $$
declare
  v_inserted_count int;
begin
  -- Guard: PO must exist for this company.
  if not exists (
    select 1 from purchase_orders
    where id = p_po_id and company_id = p_company_id
  ) then
    raise exception 'Purchase order not found for this company'
      using errcode = '22023', hint = 'check po_id and company_id';
  end if;

  -- Wipe existing line items.
  delete from po_line_items where po_id = p_po_id;

  -- Insert new line items (only if any provided).
  if p_line_items is not null and jsonb_array_length(p_line_items) > 0 then
    insert into po_line_items (
      po_id,
      company_id,
      serial_number,
      description,
      drawing_number,
      quantity,
      unit,
      unit_price,
      delivery_date,
      line_total,
      gst_rate,
      hsn_sac_code,
      received_quantity,
      item_id,
      quantity_2,
      unit_2
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
    from jsonb_array_elements(p_line_items) as item;

    get diagnostics v_inserted_count = row_count;
  else
    v_inserted_count := 0;
  end if;

  return v_inserted_count;
end;
$$;

-- Grant execute to authenticated users (matches Supabase RLS pattern)
grant execute on function replace_po_line_items(uuid, uuid, jsonb) to authenticated;
