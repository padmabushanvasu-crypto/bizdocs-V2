-- Invariant views template (see 13-TESTING-AND-REGRESSION-FRAMEWORK.md §2).
-- Rename tables/columns to the new schema. Every view must return ZERO rows.
-- Assumed shapes:
--   stock_ledger(id, item_id, from_state, to_state, qty, source_type, source_id, event_seq, reverses_ledger_id, business_date, created_at)
--   stock_position(item_id, state, qty)   -- cache maintained ONLY by trigger on stock_ledger

-- INV-01 cache = ledger
create or replace view inv_01_position_drift with (security_invoker=true) as
with flows as (
  select item_id, to_state as state, qty from stock_ledger where to_state is not null
  union all
  select item_id, from_state, -qty from stock_ledger where from_state is not null)
select f.item_id, f.state, sum(f.qty) as ledger_qty, coalesce(p.qty,0) as cached_qty
from flows f left join stock_position p on p.item_id=f.item_id and p.state=f.state
where f.state not in ('external','consumed','dispatched','scrap')   -- terminal/outside states not cached
group by f.item_id, f.state, p.qty
having sum(f.qty) <> coalesce(p.qty,0);

-- INV-02 no negative balances unless allowed by setting
create or replace view inv_02_negative_positions with (security_invoker=true) as
select p.* from stock_position p
where p.qty < 0 and p.state not in (select state from negative_allowed_states);

-- INV-03 each source posts at most once per event
create or replace view inv_03_duplicate_postings with (security_invoker=true) as
select source_type, source_id, event_seq, count(*) from stock_ledger
where reverses_ledger_id is null
group by source_type, source_id, event_seq having count(*) > 1;

-- INV-04 reversals capped at original
create or replace view inv_04_over_reversed with (security_invoker=true) as
select o.id, o.qty, sum(r.qty) as reversed
from stock_ledger o join stock_ledger r on r.reverses_ledger_id=o.id
group by o.id, o.qty having sum(r.qty) > o.qty;

-- INV-08 every row has states and a resolvable source
create or replace view inv_08_untraceable_rows with (security_invoker=true) as
select id from stock_ledger
where (from_state is null and to_state is null) or source_type is null or source_id is null;

-- Add per project: INV-05 document derived quantities, INV-06 posted documents fully posted,
-- INV-07 operation eligibility >= 0, INV-09 tenant key present.
