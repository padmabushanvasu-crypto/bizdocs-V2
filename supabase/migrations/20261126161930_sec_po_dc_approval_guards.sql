-- Security hardening 5/6 — PO and DC approval enforced in the database, mirroring the UI.
-- UI rules (26 Nov 2026): PO approve/reject = admin, finance (PurchaseOrderDetail/List);
-- DC approve/reject = admin, finance, purchase_team (guard_dc_approval_columns, DC pages).
-- Submitters (purchase_team for PO, inward_team for DC) can only submit for approval, and may
-- issue only an approved document. Calls with no signed-in user (service role, cron, SQL
-- editor) are not restricted — unchanged from the existing DC guard.
-- Changes to the existing DC guard: a signed-in user with NO role is now refused (was let
-- through because NULL NOT IN (...) is NULL); INSERT is now covered; issuing an unapproved DC
-- by a non-approver is refused (the app already refuses this client-side).
-- Inverse: .down.sql

create or replace function public.guard_dc_approval_columns()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_role text;
begin
  if auth.uid() is null then return new; end if;
  select role::text into actor_role from public.profiles where id = auth.uid();
  if coalesce(actor_role,'') in ('admin','finance','purchase_team') then return new; end if;

  if tg_op = 'INSERT' then
    if new.approved_at is not null or new.approved_by is not null or new.rejection_reason is not null
       or new.status in ('approved','rejected','issued') then
      raise exception 'Permission denied: only admin, finance or purchase_team may create an approved, rejected or issued DC (role: %). Submit it for approval instead.', coalesce(actor_role,'none');
    end if;
    return new;
  end if;

  if new.approved_at      is distinct from old.approved_at      or
     new.approved_by      is distinct from old.approved_by      or
     new.rejection_reason is distinct from old.rejection_reason or
     new.rejection_noted  is distinct from old.rejection_noted then
    raise exception 'Permission denied: only admin, finance, or purchase_team may update DC approval columns (role: %)', coalesce(actor_role,'none');
  end if;
  if new.status = 'issued' and old.status is distinct from 'issued' and new.approved_at is null then
    raise exception 'This DC has not been approved yet. It can be issued after approval (role: %).', coalesce(actor_role,'none');
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_dc_approval_columns on public.delivery_challans;
create trigger trg_guard_dc_approval_columns before insert or update on public.delivery_challans
  for each row execute function public.guard_dc_approval_columns();

create or replace function public.guard_po_approval_columns()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_role text;
begin
  if auth.uid() is null then return new; end if;
  select role::text into actor_role from public.profiles where id = auth.uid();
  if coalesce(actor_role,'') in ('admin','finance') then return new; end if;

  if tg_op = 'INSERT' then
    if new.approved_at is not null or new.approved_by is not null or new.rejection_reason is not null
       or new.status in ('approved','rejected','issued') then
      raise exception 'Permission denied: only admin or finance may create an approved, rejected or issued PO (role: %). Submit it for approval instead.', coalesce(actor_role,'none');
    end if;
    return new;
  end if;

  -- Clearing approval fields (edit → resubmit) stays allowed; setting them is approver-only.
  if (new.approved_at is distinct from old.approved_at and new.approved_at is not null) or
     (new.approved_by is distinct from old.approved_by and new.approved_by is not null) or
     (new.rejection_reason is distinct from old.rejection_reason and new.rejection_reason is not null) or
     (new.status is distinct from old.status and new.status in ('approved','rejected')) then
    raise exception 'Permission denied: only admin or finance may approve or reject a PO (role: %)', coalesce(actor_role,'none');
  end if;
  if new.status = 'issued' and old.status is distinct from 'issued' and new.approved_at is null then
    raise exception 'This PO has not been approved yet. It can be issued after approval (role: %).', coalesce(actor_role,'none');
  end if;
  return new;
end $$;

revoke execute on function public.guard_po_approval_columns() from public, anon, authenticated;
revoke execute on function public.guard_dc_approval_columns() from public, anon, authenticated;

drop trigger if exists trg_guard_po_approval_columns on public.purchase_orders;
create trigger trg_guard_po_approval_columns before insert or update on public.purchase_orders
  for each row execute function public.guard_po_approval_columns();
