-- Adds the is_consumable flag to items, used by the Consumables Issue Queue
-- picker on src/pages/ConsumableIssueDetail.tsx. Created in Supabase SQL Editor
-- earlier today; this file retroactively captures it for source control.
-- Idempotent: safe to re-run against a DB where the column already exists.

alter table public.items
  add column if not exists is_consumable boolean not null default false;
