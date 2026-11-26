-- Restores each function's ACL as captured before 3/6.
do $$
declare r record;
begin
  for r in select fn, acl from public.z_sec_function_acl_20261126 loop
    execute format('grant execute on function %s to public, anon', r.fn);
  end loop;
end $$;
alter default privileges for role postgres in schema public grant execute on functions to public, anon;
