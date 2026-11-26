# Live-applied security hardening, 26 Nov 2026

Applied through Supabase MCP `apply_migration`; file names match the live versions.
Each change was dry-run first in one rolled-back transaction as admin, inward_team and
storekeeper (row counts identical before/after on 18 views and 8 tables) and as anon (the
OLTC Dashboard's 7 tables unchanged).

| Version | File | What it does | Inverse |
|---|---|---|---|
| 20261126161815 | sec_rls_on_unprotected_tables | RLS on the 22 tables that had none: company policy on 5 operational tables, read-only `uom_master`, 16 log/backup tables closed to the API | `.down.sql` |
| 20261126161834 | sec_views_security_invoker | 18 views run with caller rights; anon SELECT revoked | `.down.sql` |
| 20261126161854 | sec_definer_functions_no_anon | anon/PUBLIC EXECUTE revoked on SECURITY DEFINER functions (except `get_company_id`, `get_user_role`, used by policies); authenticated/service_role grants preserved; prior ACLs in `z_sec_function_acl_20261126` | `.down.sql` |
| 20261126161905 | sec_invoker_functions_fixed_search_path | `search_path = public, extensions, pg_temp` on invoker functions; list in `z_sec_search_path_20261126` | `.down.sql` |
| 20261126161930 | sec_po_dc_approval_guards | DB-enforced PO/DC approval (mirrors UI roles); DC guard no longer lets a role-less user through; INSERT covered | `.down.sql` |
| 20261126162021 | sec_drop_unused_anon_read_policies | anon read removed from parties, invoices, invoice_line_items, grns, sale_backflush_lines, sale_shortfalls | `.down.sql` |
| 20261126162127 | sec_log_tables_text_signatures | log tables store signatures as text (pg_upgrade-safe) | n/a |

Advisor after: 0 ERROR (was 40). Remaining by design / pending:
- anon EXECUTE on `get_company_id`, `get_user_role` — required by RLS policies on PUBLIC role.
- 7 anon read policies used by the OLTC Dashboard — remove once the dashboard signs in.
- authenticated EXECUTE on definer functions — the app's RPC surface; each function scopes to the caller's company.
- `pg_net`, `pg_trgm` in public — relocation requires drop/recreate (pg_net would interrupt cron e-mails).
- Leaked-password protection — Supabase dashboard setting.
