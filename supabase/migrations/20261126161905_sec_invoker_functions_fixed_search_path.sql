-- Security hardening 4/6 — fixed search_path on ordinary (invoker) functions.
-- Advisor: function_search_path_mutable. Every SECURITY DEFINER function already sets one.
-- Value matches the roles' current resolution order (public, extensions) with pg_temp last,
-- so name resolution is unchanged. Extension-owned functions are skipped.
-- Inverse: .down.sql (RESET search_path on the same list, recorded in the log table).
create table if not exists public.z_sec_search_path_20261126 (fn regprocedure primary key);
alter table public.z_sec_search_path_20261126 enable row level security;
revoke all on public.z_sec_search_path_20261126 from anon, authenticated;
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p
           where p.pronamespace='public'::regnamespace and not p.prosecdef and p.prokind in ('f','p')
             and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
             and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%') loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', r.sig);
    insert into public.z_sec_search_path_20261126 values (r.sig) on conflict do nothing;
  end loop;
end $$;
