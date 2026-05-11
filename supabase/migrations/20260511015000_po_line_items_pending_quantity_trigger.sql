-- Auto-maintain pending_quantity on po_line_items.
-- Created in the Supabase SQL Editor earlier today; this file retroactively
-- captures it in source control so it survives a fresh DB reset.
-- Idempotent: safe to re-run against a DB where the trigger already exists.

create or replace function fn_po_line_items_sync_pending_quantity()
returns trigger
language plpgsql
as $$
begin
  new.pending_quantity := greatest(0, coalesce(new.quantity, 0) - coalesce(new.received_quantity, 0));
  return new;
end;
$$;

drop trigger if exists trg_po_line_items_sync_pending_quantity on po_line_items;

create trigger trg_po_line_items_sync_pending_quantity
  before insert or update of quantity, received_quantity, pending_quantity
  on po_line_items
  for each row
  execute function fn_po_line_items_sync_pending_quantity();
