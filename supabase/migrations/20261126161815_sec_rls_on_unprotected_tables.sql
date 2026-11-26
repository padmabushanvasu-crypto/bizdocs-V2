-- Security hardening 1/6 — RLS on every public table that had it off.
-- Advisor: rls_disabled_in_public (22 tables). Writers verified 26 Nov 2026:
--  * operational tables are written only by SECURITY DEFINER functions (bypass RLS)
--    or by the app with company_id in the payload (job_card_step_dcs insert);
--  * backup / one-off log tables have no readers or writers outside migrations.
-- Inverse: 20261126161815_sec_rls_on_unprotected_tables.down.sql

-- A. Operational tables with company_id: same company_isolation pattern as items/grn_line_items.
do $$
declare t text;
begin
  foreach t in array array['awo_grn_allocations','grn_weldment_consumption','item_conversions',
                           'job_card_step_dcs','audit_month_end_stock'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists company_isolation on public.%I', t);
    execute format($p$create policy company_isolation on public.%I for all to authenticated
                     using (company_id = get_company_id()) with check (company_id = get_company_id())$p$, t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- B. uom_master: global reference list (no company_id), read-only to signed-in users.
alter table public.uom_master enable row level security;
drop policy if exists uom_master_read on public.uom_master;
create policy uom_master_read on public.uom_master for select to authenticated using (true);
revoke all on public.uom_master from anon;
revoke insert, update, delete, truncate on public.uom_master from authenticated;

-- C. Internal log / backup tables: no API access at all (RLS on, no policy, grants revoked).
do $$
declare t text;
begin
  foreach t in array array['stock_bucket_sync_log','audit_reversal_log_20260921','auto_qc_backfill_log_20260924',
    'bom_lines_backup_20260929','bom_lines_backup_ins4_20261113','bom_lines_backup_phaseboard2_20260929',
    'bom_lines_backup_phaseboard_20260929','bom_lines_backup_shaftassy_20260929','item_unit_corrections_20260919',
    'job_card_ledger_seed_log_20260919','stage_cutover_dedupe_log_20260924','z_dc_dup_reversal_20260728',
    'z_dc_missing_issue_backfill_20260728','z_inprocess_reconcile_20260728','z_inprocess_reconcile_round2_20260728',
    'z_ledger_state_backfill_20260728'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
