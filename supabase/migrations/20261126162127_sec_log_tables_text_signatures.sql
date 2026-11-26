-- Follow-up to security hardening 3/6 and 4/6: store function signatures as text
-- (regprocedure columns block pg_upgrade — advisor unsupported_reg_types).
alter table public.z_sec_function_acl_20261126 alter column fn type text using fn::text;
alter table public.z_sec_search_path_20261126 alter column fn type text using fn::text;
