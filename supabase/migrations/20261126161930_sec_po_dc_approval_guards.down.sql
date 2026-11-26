drop trigger if exists trg_guard_po_approval_columns on public.purchase_orders;
drop function if exists public.guard_po_approval_columns();
create or replace function public.guard_dc_approval_columns()
returns trigger language plpgsql security definer set search_path = public as $$
DECLARE actor_role TEXT;
BEGIN
  IF (NEW.approved_at IS DISTINCT FROM OLD.approved_at OR NEW.approved_by IS DISTINCT FROM OLD.approved_by OR
      NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason OR NEW.rejection_noted IS DISTINCT FROM OLD.rejection_noted) THEN
    SELECT role INTO actor_role FROM public.profiles WHERE id = auth.uid();
    IF actor_role NOT IN ('admin', 'finance', 'purchase_team') THEN
      RAISE EXCEPTION 'Permission denied: only admin, finance, or purchase_team may update DC approval columns (role: %)', actor_role;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
drop trigger if exists trg_guard_dc_approval_columns on public.delivery_challans;
create trigger trg_guard_dc_approval_columns before update on public.delivery_challans
  for each row execute function public.guard_dc_approval_columns();
