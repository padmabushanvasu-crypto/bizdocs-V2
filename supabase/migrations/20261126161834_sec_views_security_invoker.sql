-- Security hardening 2/6 — views run with the caller's rights (RLS applies).
-- Advisor: security_definer_view (18 views, all owned by postgres = bypassrls, so they
-- returned every company's rows to any caller incl. anon). Every base table already has
-- authenticated company policies (grn_weldment_consumption gets one in 1/6).
-- The OLTC Dashboard (anon key) reads no views, so anon SELECT is revoked.
-- Inverse: .down.sql
do $$
declare v text;
begin
  foreach v in array array['v_job_card_stage_position','v_item_stage_stock','v_job_card_status',
    'v_job_card_stage_ledger_totals','v_stock_pending_verification','v_stock_drift_latest',
    'v_dc_line_return_position','v_jcsl_invariant_violations','v_stock_ledger_reversed_qty',
    'v_stock_ledger_net','v_item_bucket_events','v_item_bucket_position','v_item_position',
    'v_item_position_drift','v_stock_invariants','v_stock_ledger','v_stock_current','wip_register'] loop
    execute format('alter view public.%I set (security_invoker = true)', v);
    execute format('revoke all on public.%I from anon', v);
  end loop;
end $$;
