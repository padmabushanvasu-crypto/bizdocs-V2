-- Backfill stock_ledger from_state / to_state for known transaction types.
--
-- Why: from_state / to_state columns were added to stock_ledger after most of
-- the application code paths already existed. Assembly + dispatch flows wrote
-- rows with null state, which surfaces in the OLTC dashboard as "Untracked"
-- stock. The accompanying application changes
--   - src/lib/production-api.ts (assembly_issue / assembly_return)
--   - src/lib/invoices-api.ts   (invoice_dispatch)
--   - src/lib/dispatch-api.ts   (invoice_dispatch)
-- now write the correct state on new rows. This migration fills history.
--
-- Scope: only company 45c14753-4e54-4327-bf77-dd9fb72899dc (Vasudevan /
-- Innventive Solutions). Other tenants are NOT touched — a wrong assumption
-- about the OLTC mental model must not pollute anyone else's data.
--
-- Idempotency: each UPDATE only fills NULL state fields. Re-running the
-- migration is a no-op once history is filled. A non-null state is never
-- overwritten — if BizDocs writes a different state in the future, this
-- migration won't clobber it.

BEGIN;

-- assembly_issue: material moves out of free stock and into WIP.
UPDATE public.stock_ledger
SET from_state = 'free',
    to_state   = 'wip'
WHERE company_id = '45c14753-4e54-4327-bf77-dd9fb72899dc'
  AND transaction_type = 'assembly_issue'
  AND from_state IS NULL
  AND to_state   IS NULL;

-- assembly_return: material returns from WIP back to free stock.
UPDATE public.stock_ledger
SET from_state = 'wip',
    to_state   = 'free'
WHERE company_id = '45c14753-4e54-4327-bf77-dd9fb72899dc'
  AND transaction_type = 'assembly_return'
  AND from_state IS NULL
  AND to_state   IS NULL;

-- invoice_dispatch: previously the invoices-api.ts path wrote
--   from_state = 'finished_goods', to_state = NULL
-- and the dispatch-api.ts path wrote both as NULL. Fill each side separately
-- so partially-populated rows are still completed correctly.
UPDATE public.stock_ledger
SET from_state = 'finished_goods'
WHERE company_id = '45c14753-4e54-4327-bf77-dd9fb72899dc'
  AND transaction_type = 'invoice_dispatch'
  AND from_state IS NULL;

UPDATE public.stock_ledger
SET to_state = 'dispatched'
WHERE company_id = '45c14753-4e54-4327-bf77-dd9fb72899dc'
  AND transaction_type = 'invoice_dispatch'
  AND to_state IS NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
