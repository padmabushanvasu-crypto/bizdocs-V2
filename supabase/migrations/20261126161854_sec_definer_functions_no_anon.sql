-- Security hardening 3/6 — SECURITY DEFINER functions are not callable without login.
-- Advisor: anon_security_definer_function_executable (131). Verified 26 Nov 2026: neither the
-- BizDocs app (pre-login pages call no RPC), the edge functions (user JWT or service role),
-- the cron jobs (run as postgres) nor the OLTC Dashboard (anon key, table reads only) call
-- these as anon.
-- Kept for anon: get_company_id(), get_user_role() — referenced by RLS policies whose role is
-- PUBLIC, so anon reads of dashboard tables evaluate them (they return NULL for anon).
-- authenticated and service_role keep exactly the access they had (re-granted explicitly
-- before PUBLIC is revoked). Trigger functions are unaffected: EXECUTE is not checked when a
-- trigger fires. Inverse: .down.sql (restores PUBLIC + anon EXECUTE).
create table if not exists public.z_sec_function_acl_20261126 (fn regprocedure primary key, acl aclitem[]);
alter table public.z_sec_function_acl_20261126 enable row level security;
revoke all on public.z_sec_function_acl_20261126 from anon, authenticated;
insert into public.z_sec_function_acl_20261126
select p.oid::regprocedure, p.proacl from pg_proc p
where p.pronamespace='public'::regnamespace and p.prosecdef
  and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
on conflict (fn) do nothing;

do $$
declare r record; had_auth bool; had_svc bool;
begin
  for r in select p.oid::regprocedure as sig, p.proname from pg_proc p
           where p.pronamespace='public'::regnamespace and p.prosecdef
             and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e') loop
    had_auth := has_function_privilege('authenticated', r.sig, 'EXECUTE');
    had_svc  := has_function_privilege('service_role', r.sig, 'EXECUTE');
    if r.proname in ('get_company_id','get_user_role') then continue; end if;
    if had_auth then execute format('grant execute on function %s to authenticated', r.sig); end if;
    if had_svc  then execute format('grant execute on function %s to service_role', r.sig); end if;
    execute format('revoke execute on function %s from public, anon', r.sig);
  end loop;
end $$;

-- New functions created by postgres in public: no automatic PUBLIC/anon EXECUTE.
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
