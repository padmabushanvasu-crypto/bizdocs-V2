do $$
declare v text;
begin
  foreach v in array array['v_job_card_stage_position','v_item_stage_stock','v_job_card_status',
    'v_job_card_stage_ledger_totals','v_stock_pending_verification','v_stock_drift_latest',
    'v_dc_line_return_position','v_jcsl_invariant_violations','v_stock_ledger_reversed_qty',
    'v_stock_ledger_net','v_item_bucket_events','v_item_bucket_position','v_item_position',
    'v_item_position_drift','v_stock_invariants','v_stock_ledger','v_stock_current','wip_register'] loop
    execute format('alter view public.%I reset (security_invoker)', v);
    execute format('grant all on public.%I to anon', v);
  end loop;
end $$;
