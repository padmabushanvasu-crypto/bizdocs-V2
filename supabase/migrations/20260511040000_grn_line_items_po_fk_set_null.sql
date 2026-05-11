-- Change grn_line_items.po_line_item_id FK to ON DELETE SET NULL.
-- Today it's the default behavior (NO ACTION / RESTRICT), which blocks edits
-- to POs that have GRN history. With SET NULL, deleting a po_line_item
-- silently nulls out the grn_line_items reference — the GRN itself stays.

-- Drop the existing FK if it exists. Name from previous error: grn_line_items_po_line_item_id_fkey
alter table public.grn_line_items
  drop constraint if exists grn_line_items_po_line_item_id_fkey;

-- Recreate it with ON DELETE SET NULL.
alter table public.grn_line_items
  add constraint grn_line_items_po_line_item_id_fkey
  foreign key (po_line_item_id)
  references public.po_line_items(id)
  on delete set null;
