-- Inverse of 20261126161815. Restores Supabase default grants and disables RLS.
do $$
declare t text;
begin
  foreach t in array array['awo_grn_allocations','grn_weldment_consumption','item_conversions','job_card_step_dcs',
    'audit_month_end_stock','uom_master','stock_bucket_sync_log','audit_reversal_log_20260921','auto_qc_backfill_log_20260924',
    'bom_lines_backup_20260929','bom_lines_backup_ins4_20261113','bom_lines_backup_phaseboard2_20260929',
    'bom_lines_backup_phaseboard_20260929','bom_lines_backup_shaftassy_20260929','item_unit_corrections_20260919',
    'job_card_ledger_seed_log_20260919','stage_cutover_dedupe_log_20260924','z_dc_dup_reversal_20260728',
    'z_dc_missing_issue_backfill_20260728','z_inprocess_reconcile_20260728','z_inprocess_reconcile_round2_20260728',
    'z_ledger_state_backfill_20260728'] loop
    execute format('drop policy if exists company_isolation on public.%I', t);
    execute format('alter table public.%I disable row level security', t);
    execute format('grant all on public.%I to anon, authenticated', t);
  end loop;
  drop policy if exists uom_master_read on public.uom_master;
end $$;
