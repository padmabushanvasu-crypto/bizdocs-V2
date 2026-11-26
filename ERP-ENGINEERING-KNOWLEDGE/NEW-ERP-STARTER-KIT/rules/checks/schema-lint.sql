-- schema:lint for PostgreSQL. Each query returns violations; CI fails on any row.
-- Set the exposed schema list to match the API configuration.

-- 1. Exposed tables without row-level security (R-SEC-02)
select 'no_rls' as violation, n.nspname||'.'||c.relname as object
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where c.relkind in ('r','p') and n.nspname in ('public') and not c.relrowsecurity;

-- 2. Foreign keys relying on the default ON DELETE (NO ACTION) — must be explicit and reviewed (R-DB-05)
--    Policy: business FKs RESTRICT ('r'); SET NULL/CASCADE only with ADR. Flags NO ACTION and CASCADE for review.
select 'fk_on_delete_'||confdeltype::text as violation, conrelid::regclass::text||' '||conname as object
from pg_constraint where contype='f' and confdeltype in ('a','c')
  and connamespace='public'::regnamespace;

-- 3. Float types for quantities or money (R-DB-14)
select 'float_column' as violation, table_name||'.'||column_name
from information_schema.columns
where table_schema='public' and data_type in ('real','double precision');

-- 4. Near-duplicate column names on the same table (R-DB-07), e.g. accepted_qty vs accepted_quantity
--    Normalises quantity->qty and strips _old/_new/_legacy suffixes; alternate-unit *_2 columns are exempt.
with cols as (
  select table_name, column_name,
         regexp_replace(replace(column_name,'quantity','qty'),'_(old|new|legacy)$','') as norm
  from information_schema.columns
  where table_schema='public' and column_name !~ '_2$')
select 'near_duplicate_columns' as violation, a.table_name||': '||a.column_name||' ~ '||b.column_name as object
from cols a join cols b on a.table_name=b.table_name and a.norm=b.norm and a.column_name<b.column_name;

-- 5. Definer-rights functions without fixed search_path (R-DB-17)
select 'definer_without_search_path' as violation, p.oid::regprocedure::text
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef
  and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) cfg where cfg like 'search_path=%');

-- 6. Definer-rights functions executable by anon (R-DB-17) — adjust role name to the platform
select 'definer_exec_by_anon' as violation, p.oid::regprocedure::text
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE');

-- 7. Views without security_invoker (R-SEC-04), PostgreSQL 15+
select 'view_not_security_invoker' as violation, n.nspname||'.'||c.relname
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where c.relkind='v' and n.nspname='public'
  and not coalesce((select bool_or(o='security_invoker=true' or o='security_invoker=on') from unnest(c.reloptions) o), false);
