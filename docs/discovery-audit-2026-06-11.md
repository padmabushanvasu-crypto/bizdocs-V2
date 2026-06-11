# BizDocs V2 — Read-Only Discovery Audit

**Date:** 2026-06-11
**Company in scope:** `45c14753-4e54-4327-bf77-dd9fb72899dc` (Vasudevan / Innventive Solutions)
**Mode:** READ-ONLY. No code changes, no migrations, no data mutations were made.

---

## ⚠️ Read this first — two cross-cutting caveats that shape every section

**1. The live Supabase DB could not be queried.** The environment's network policy blocks the
Supabase host (`https://mclskjvrkopowusevuyk.supabase.co` → `403 "Host not in allowlist"`; direct
Postgres is also blocked). The prompt states the **live DB is authoritative over migration files and
code** — but the live DB is unreachable from here. Therefore **every finding below is derived from
migration files (`supabase/migrations/*.sql`), application code (`src/`), and the generated snapshot
`src/integrations/supabase/types.ts`.** Anywhere a count or live-state confirmation is required, I give
the exact read-only SQL **query shape** to run against the live DB; I cannot execute it.

**2. There is significant, confirmed schema drift: migrations LAG the live DB.** Multiple
columns/views/constraints are referenced by code and by later migrations but are **never created by any
migration in the repo** — they were applied directly to the live DB (the Lovable platform pattern).
Confirmed examples:

- `stock_ledger.from_state` / `to_state` columns — written by code and backfilled by
  `20260512000001_backfill_stock_ledger_states.sql`, but **no migration adds them**.
- The `v_stock_free` availability view — read by `src/lib/stock-free-api.ts`, **defined in no migration**.
- The `stock_alerts` view (Dashboard) — read by `StockAlertsBoard.tsx`, **defined in no migration**.
- `transaction_type = 'physical_count'` — written by app code since 2026-06-07, but **absent from the
  latest `stock_ledger` CHECK constraint** in the repo (`20260513000010`, dated 2026-05-13).
- Many `dc_line_items` / `job_card_steps` columns (Section 1) added directly to live.
- `types.ts` is **stale**: it has **zero** entries for `stock_ledger`, `job_cards`, `job_card_steps`,
  `from_state`, `physical_count`, and the five `items.stock_*` bucket columns. Do not trust it as the
  schema of record for any post-Phase-12 subsystem.

**Practical consequence:** a database rebuilt purely from `supabase/migrations/*` would be **missing
columns/views the app depends on** and would break stock postings. This is itself a finding (flagged in
Sections 3 and 5). Confirm anything load-bearing against the live DB before acting.

---

## SECTION 1 — Multi-batch DC blocking (same item → same process, multiple DCs)

### 🛑 The prompt's core assumption does not hold — STOP-and-report

The prompt states *"Today the system blocks/rejects the second DC."* **On the actual DC-creation path,
this is not true.** There is **no DB constraint** and **no form validation** that rejects a second DC for
the same item+process. The DC code was, in fact, explicitly rewritten to support multi-batch. Per the
instruction to stop on contradicted assumptions, the rest of this section reports what actually exists
and where a *user-perceived* block really comes from.

### 1. The blocking code — what's actually there

- **No DB block.** The only UNIQUE constraints on these tables are on **document numbers**, not
  item+process:
  - `job_cards (company_id, jc_number) WHERE status <> 'deleted'` —
    `20260514000010_job_cards_numbering.sql:65-67`
  - `delivery_challans (company_id, dc_number) WHERE status <> 'deleted'` —
    `20260513000020_doc_number_triggers_and_uniqueness.sql:267-269`
  - There is **no** unique on `(job_card_id, step_number)`, none on `outward_dc_id`, none spanning
    item+process (verified by grep across all migrations). Other constraints are CHECK enums only
    (`job_card_steps.status`, `step_type`, etc. — `20260318000000_phase2_job_cards.sql:85,110`,
    `20260408000001_job_card_stage_columns.sql:13-14`).
- **No DC-form block.** `DeliveryChallanForm.tsx` `handleSave` (lines 761–812) validates only
  party/lines/item-link/mould/jig — **no item+process duplicate check.** The route-stage selector
  comment is explicit: *"all stages selectable; per-JC scoping handled by the JC picker below"*
  (`DeliveryChallanForm.tsx:1514`). A fully-processed stage shows only a **soft warning**, not a block:
  *"⚠️ Stage N is fully processed … Raising another DC implies rework — please confirm"*
  (`DeliveryChallanForm.tsx:1636-1640`).
- **Where the real user-perceived block lives:** `JobCardCreationDialog.tsx` (the post-DC "Create Job
  Cards" dialog) **disables stage chips that are already done** —
  `JobCardCreationDialog.tsx:360 disabled={isDone}`, `:362 if (isDone) return;`. `isDone` comes from
  **`fetchCompletedStepsForItem`** (`job-works-api.ts:1106-1126`), which is **explicitly
  `@deprecated`** (`:1097-1104`): it looks only at the most-recent JC for the item and *"gives wrong
  answers whenever parallel JCs exist… Do not introduce new callers."* This deprecated UI disable is
  almost certainly the "system won't let me send Stage X again" symptom.

### 2. Frontend, DB, or both? → **Neither is a true block.** The only block-like behavior is a
**frontend UI disable** in `JobCardCreationDialog.tsx` built on a deprecated, incorrect approximation.

### 3. How DC lines link to job cards / steps + the "one-DC-per-step" assumption

Single-column FKs, no junction table:
- `job_card_steps.outward_dc_id → delivery_challans(id)`, `return_dc_id`, `return_grn_id`
  (`20260318000000_phase2_job_cards.sql:98,100,101`); `job_card_id → job_cards ON DELETE CASCADE`.
- `dc_line_items.job_work_id`, `job_work_step_id`, `stage_number` written by `createDeliveryChallan`
  (`delivery-challans-api.ts:400-404`). Note `job_work_step_id` is **intentionally not written** for new
  DCs (null across all 314 live rows); GRN matching keys on `outward_dc_id` instead
  (`DeliveryChallanForm.tsx:227-229`).

The multi-batch model is **"one new `job_card_steps` row per DC dispatch"** — multiple DCs for the same
`step_number` create multiple step rows with distinct `outward_dc_id`. Downstream code that assumes
one-DC-per-step (the real fragility):
- **GRN return match uses `.maybeSingle()`** keyed on `outward_dc_id` (`grn-api.ts:1620-1626`) — safe
  *only while each DC yields exactly one step row*; throws if a DC ever maps to >1 step.
- Stage-1 GRN return bulk-updates **all** steps for an `outward_dc_id` with no DC-line scoping
  (`grn-api.ts:1185-1191`).
- Step auto-close hard-sets `status:'done'` on the single step row regardless of partial return
  (`job-works-api.ts:808`, `delivery-challans-api.ts:1036-1037`, `grn-api.ts:1638-1647`) — there is **no
  partial-step / cumulative-per-step reconciliation**.
- JC auto-close (`grn-api.ts:1649-1677`) correctly keeps the JC open if a second outstanding step row
  exists — but only if a second row was actually created (not if a DC reuses an in-progress step).

### 4. Cumulative quantity tracking today

- **Per-DC-line cumulative (robust):** `dc_line_items.returned_qty_nos/kg/sft` are incremented additively
  across returns (`delivery-challans-api.ts:813-820`), and `recalculateDCStatus`
  (`:868-882`) derives `fully/partially_returned` per line within one DC. Multi-partial-return safe at
  the DC level.
- **Per-step cumulative across DCs (the only cross-document SUM):** `fetchJobCardsForItem`
  (`job-works-api.ts:1164-1182`) sums `actual_qty` over all step rows sharing a `step_number` (comment
  `:1166-1168`: *"Multi-batch case… sum across them"*). Drives the DC form's per-stage breakdown and the
  rework warning.
- **Not summed anywhere:** sent-vs-returned per item+process **across DCs** to compute an
  outstanding-at-vendor balance for *gating* a new DC. `job_cards.quantity_accepted/quantity_rejected`
  are mutated per-return (`job-works-api.ts:826-827`, `delivery-challans-api.ts:1062-1064`), not
  re-derived, so they can drift if step rows arrive out of order.

### 5. Smallest change set to allow multi-batch while keeping returns correct

The create path already works — no migration needed to *unblock*. To make it correct and remove the
perceived block:
1. **Keep the load-bearing invariant: one new `job_card_steps` row per DC dispatch** (never reuse an
   in-progress step for a second DC — `JobCardCreationDialog.tsx:147` already inserts; preserve it).
2. **Replace the deprecated stage-disable** in `JobCardCreationDialog.tsx:360-362` with the per-JC
   scoping the DC form uses (`fetchJobCardsForItem`), or drop the `disabled` gate. *This removes the only
   user-facing "can't send again".*
3. **Harden GRN return matching** (`grn-api.ts:1621-1626` `.maybeSingle()`) — keep the one-step-per-DC
   invariant (cheapest) or iterate matched rows scoped by DC line.
4. **Make `job_cards.quantity_accepted/quantity_rejected` derived** (recompute from step-row sums as
   `fetchJobCardsForItem` already does) instead of order-sensitive mutation.
5. **Do NOT add a `(job_card_id, step_number)` unique index** — multi-batch deliberately needs multiple
   rows per step_number.

> **Implications for design:** The blocker is a *frontend illusion* (a deprecated stage-disable), not a
> constraint — unblocking is a small UI change, no migration. The genuine risk is return reconciliation,
> which assumes one DC per step; the cumulative-per-step SUM pattern in `fetchJobCardsForItem` is the
> reusable primitive and overlaps directly with the weldment "accumulate across documents" surface
> (→ Section 2).

---

## SECTION 2 — Weldment process: current schema readiness

### 1. Existing weldment artifacts — **NONE.** Greenfield.

Exhaustive search for `weld`, `weldment`, `w-item`, `w_item`, `pool`, `accumulat` across migrations,
`types.ts`, and `src/`: no weldment table, column, route, component, item-type value, or status. Only
incidental hits: a job-work example comment (`20260319000005_phase7_dc_fields.sql:15`), vendor helper
text (`PartyForm.tsx:427`), and a QC instrument name "Fillet Weld Gauge" (`qc-instruments.ts:16`).
`pool` appears only in lockfiles.

### 2. QC Stage 1/2 flow — where "route to weldment pool (full/partial qty)" hooks in

- **Components:** `GrnQueue.tsx`/`QcQueue.tsx` (queues; `QcQueue.tsx:23` filters
  `grn_stage = 'quality_pending'`), `GRNForm.tsx` (Stage-1 identity + Stage-2 QC entry; per-line state
  `:40-66`), `GRNDetail.tsx` (disposition entry; `DISPOSITIONS` `:81-87`), `GrnStoreQueue.tsx` /
  `StorekeeperQueue.tsx` (store confirmation), write path `grn-api.ts`.
- **QC disposition vocabulary** (`GRNDetail.tsx:81-87`): `accept_as_is`, `conditional_accept`,
  `return_to_vendor`, `scrap`, `rework_our_scope`.
- **Fields written:** table `grn_line_items` (Stage-2 update `grn-api.ts:1287-1313`): `disposition`
  (`:1296`, bare `varchar`, no CHECK — `20260318000003_grn_revamp.sql:17`), `accepted_qty`,
  `rejected_qty`, `disposal_method` (`:1305`, CHECK `('return_to_vendor','rework','scrap','use_as_is')`
  — `20260331000002_phase14_grn_rebuild.sql:32`), `conforming_qty`, `non_conforming_qty`,
  `qc_inspected_by/_at`. Header QC fields on `grns`; per-characteristic rows in `grn_qc_measurements`.
  GRN stage machine `grns.grn_stage`: `draft/quantitative_pending/quantitative_done/quality_pending/
  quality_done/awaiting_store/closed`.
- **Cleanest hook = store-confirmation step, not Stage-2 entry.** Accepted qty is credited to
  `stock_free` at store confirmation via `creditPartialStock` (`grn-api.ts:2434-2447`; comment `:442`:
  *"stock_free is updated at storeConfirmGRN (after QC), not at creation"*). A weldment route would
  (a) add a `disposition` value like `route_to_weldment` (column is unconstrained `varchar`, no ALTER
  needed to store it) and/or (b) intercept the store-confirm credit so conforming qty lands in a
  weldment-pool bucket instead of `stock_free`. **Partial qty is already supported** by the additive
  partial store-confirm machinery (`store_confirmed_qty` accumulation, `creditPartialStock` is additive).

### 3. Existing "pool"/reserved bucket to reuse? → **No weldment-fit bucket; a new one is needed.**

Five canonical stock buckets on `items` (`20260331000001_phase13_stock_buckets.sql:4-9`): `stock_free`,
`stock_in_process`, `stock_in_subassembly_wip`, `stock_in_fg_wip`, `stock_in_fg_ready`, each mapping 1:1
to a ledger state (`src/lib/stock-states.ts:12-39`). The WIP register (`wip_register` view,
`20260318000001_phase3_wip_register.sql`) is **job-card-centric** (tracks JCs at vendors), not a
component pool. There is **no "pool", "reserved", or "allocated" bucket**. Reusing
`stock_in_subassembly_wip` would conflate it with assembly WIP. **A new state/bucket (e.g.
`in_weldment_pool → stock_in_weldment_pool`) plus a dedicated pool table** (tracking which source
GRN/PO lines accumulated into which weldment, with per-source qty) is needed. The five-bucket + ledger-
state pattern is the model to extend.

### 4. W-items in Items Master → **not represented.** 8 `item_type` values exist.

`items.item_type` authoritative CHECK (`20260403000001_raw_material_type.sql:9-18`, matching
`Items.tsx:21-41`): `raw_material, component, sub_assembly, bought_out, finished_good, product,
consumable, service`. **No weldment/W-item type and no naming convention.** A weldment output would map
to a new `item_type` value (e.g. `weldment`) added to the CHECK, or be modeled as `sub_assembly`.
(`awo_type` is separately constrained to `('sub_assembly','finished_good')` —
`20260401000001_phase16_production_module.sql:8`.)

### 5. Overlap with Section 1 (accumulate-across-documents)

The most relevant existing pattern is the **additive partial-confirmation accumulation**:
`store_confirmed_qty` accumulates across partial store confirmations and `creditPartialStock` is additive
with a float-drift guard (`grn-api.ts:2289-2447`, `EPS=0.0005`); see also
`20260511000001_partial_confirm_quantity_types.sql`. This is structurally identical to the weldment
"accumulate components across multiple POs/GRNs" requirement **and** to Section 1's per-step cumulative
SUM. There is no existing "accumulate across documents" table/UI to extend, so the pool table is net-new
but should mirror these semantics.

> **Implications for design:** ~65% is buildable now without the qty-per mapping sheet — a new
> `in_weldment_pool` bucket/state, a pool table keyed to source GRN/PO lines, a `route_to_weldment`
> disposition (no ALTER needed), and a partial-qty hook at store-confirm. Reuse the additive
> partial-confirm accumulation pattern (shared with Section 1) rather than inventing a new one; defer only
> the per-component qty-ratio math that depends on the client sheet.

---

## SECTION 3 — Assembly issue flow: health check

### 0. How the stock ledger works (foundation for §3/§4/§5)

- **Ledger table `public.stock_ledger`** (`20260319000004_phase7_assembly_orders.sql:40-71`): movement
  column is **`transaction_type`** (varchar + CHECK), quantities `qty_in`/`qty_out`/`balance_qty (NOT
  NULL)`, plus **`from_state`/`to_state`** bucket-state columns that **exist only in the live DB** (no
  migration adds them; backfilled by `20260512000001`). `transaction_type` CHECK was extended for
  assembly types in `20260420000001_consumable_issues.sql:95-113`.
- **Buckets live on `items`, not the ledger** (`20260331000001`). State→bucket map in `stock-states.ts`.
- **No trigger recomputes buckets from ledger events.** Buckets are maintained entirely in JS by
  `updateStockBucket` (`items-api.ts:934-988`) as a **separate, non-atomic** write after the ledger
  insert (`addStockLedgerEntry`, `assembly-orders-api.ts:1011-1060`). Ledger and buckets **can diverge**.
- **Availability is read from view `v_stock_free`** (`stock-free-api.ts:25-33`), *not* from buckets —
  *"ledger-truth for physically-counted items, bucket fallback otherwise."* This view is **also defined
  in no migration** (drift).
- Two correctness caveats baked into `addStockLedgerEntry`: `balance_qty` is computed from the latest
  prior row **filtered by `item_id` only, ignoring `company_id`** (`:1037-1044`) → wrong running balance
  in multi-tenant; and an acknowledged concurrency window.

### 1. What happens on "issue"

Modern path uses `assembly_work_orders`, `awo_line_items`, `material_issue_requests`, `mir_line_items`
(`20260401000001_phase16_production_module.sql`); the phase-7 `assembly_orders` tables are effectively
dead. The issue action is **`confirmMaterialIssue`** (`production-api.ts:935-1072`, called from
`StorekeeperQueue.tsx:101`) — **all JS, no trigger.** Per line, when `delta>0`: (1) INSERT `stock_ledger`
`transaction_type:'assembly_issue'`, `qty_out:delta`, `from_state:'free'`, `to_state:wip_bucket`
(`:981-999`; `wip_bucket` = `in_fg_wip` for finished_good else `in_subassembly_wip`); (2)
`updateStockBucket(item,'free',-delta)` then `updateStockBucket(item,wip_bucket,+delta)` (`:1007-1008`);
(3) update `mir_line_items`/`awo_line_items` issued qty + statuses. **Stock moves free → WIP at issue.**
Final consumption (WIP→consumed) + output happens at store acceptance `acceptAssemblyWorkOrder`
(`:1131-1258`): `assembly_consumption` then `assembly_output` (`in_fg_ready` for FG else `free`) + serial
upsert.

### 2. BOM-driven or manual pick? → **BOM-driven, single-level only.**

`createAssemblyWorkOrder` (`production-api.ts:278-314`) reads `bom_lines` for the parent
(`required_qty = bl.quantity * quantity_to_build`, `:302`) **without recursive explosion**. Multi-level
is modeled by raising separate sub-assembly AWOs whose output is then issued as a component. Within one
AWO the storekeeper can adjust issued qty downward.

### 3. Over-issue? → **YES — allowed, silent, no free-stock check.**

- Server: `delta = max(0, targetIssued − currentIssued)` (`:973-974`) — capped only against the issued
  *target*, **never against `stock_free`/`v_stock_free`.** Nothing blocks issuing more than on-hand.
- UI: input clamped to `requested_qty` remaining, **not** to stock (`StorekeeperQueue.tsx:288`); stock is
  only color-coded as a hint (`:270-272`), submit not disabled.
- `updateStockBucket` floors at zero: `newValue = Math.max(0, current + delta)` (`items-api.ts:952`). So
  issuing 100 when free=30 → `stock_free` floors at 0 (the 70 over-issue **vanishes**), `wip_bucket` is
  credited the full +100, ledger records `qty_out=100`. **Stock value silently destroyed; buckets
  desynced from ledger.** No negative ever surfaces — arguably worse, since the loss is invisible.

### 4. Soft-delete / edit / reversal

- AWO/MIR have **no soft-delete columns** (`deleted_at/is_deleted/voided` exist only on
  `consumable_issues`/`consumable_returns`). AWO uses `status='cancelled'`.
- Issue is idempotent on cumulative target (re-submit → delta 0). You can issue **more** later; there is
  **no path to reduce/un-issue** an MIR line.
- Reversal only via `cancelAssemblyWorkOrder(id, stockAction)` (`:648-710`). Default
  **`stockAction='none'` does NOT reverse stock** — issued material is stranded in WIP.
  `return_all`/`scrap_all`/`partial` post `assembly_return` (wip→free) or `scrap_write_off`, capped at
  `issued − returned − scrapped`, through the same `updateStockBucket` 0-floor. Because return also
  floors at 0, **a return after an over-issue can manufacture free stock that never existed** — issue and
  return are non-symmetric.
- (Consumable issues *do* have proper soft-delete + reversal via `consumable_return`.)

### 5. Consistency-check SQL (DB unreachable — run read-only against live DB)

(a) **Ledger legs don't balance / bucket drift** — WIP net should be 0 once an AWO is complete:
```sql
SELECT sl.reference_id AS awo_id, sl.item_id,
       SUM(CASE WHEN to_state   IN ('in_subassembly_wip','in_fg_wip') THEN qty_out ELSE 0 END) AS into_wip,
       SUM(CASE WHEN from_state IN ('in_subassembly_wip','in_fg_wip') THEN qty_out ELSE 0 END) AS out_of_wip
FROM public.stock_ledger sl
WHERE sl.company_id = '45c14753-4e54-4327-bf77-dd9fb72899dc'
  AND sl.reference_type = 'assembly_work_order'
  AND sl.transaction_type IN ('assembly_issue','assembly_return','assembly_consumption','scrap_write_off')
GROUP BY 1,2
HAVING SUM(CASE WHEN to_state   IN ('in_subassembly_wip','in_fg_wip') THEN qty_out ELSE 0 END)
    <> SUM(CASE WHEN from_state IN ('in_subassembly_wip','in_fg_wip') THEN qty_out ELSE 0 END);
```
Plus ledger-vs-bucket drift (catches the 0-floor loss): compare `items.stock_in_subassembly_wip` to the
signed sum of ledger legs per item; any mismatch = JS bucket write diverged from the ledger.

(b) **Issues referencing deleted items** (items have no soft-delete; orphan = missing item row):
```sql
SELECT sl.* FROM public.stock_ledger sl
LEFT JOIN public.items i ON i.id = sl.item_id
WHERE sl.company_id = '45c14753-4e54-4327-bf77-dd9fb72899dc'
  AND sl.transaction_type IN ('assembly_issue','assembly_consumption','assembly_return')
  AND (sl.item_id IS NULL OR i.id IS NULL);
```

(c) **Stock moved for a different company than the order** (catches the company-less balance bug / RLS
bypass):
```sql
SELECT sl.id, sl.company_id AS ledger_company, awo.company_id AS awo_company, i.company_id AS item_company
FROM public.stock_ledger sl
JOIN public.assembly_work_orders awo
  ON awo.id = sl.reference_id AND sl.reference_type = 'assembly_work_order'
LEFT JOIN public.items i ON i.id = sl.item_id
WHERE sl.transaction_type IN ('assembly_issue','assembly_consumption','assembly_output','assembly_return')
  AND (sl.company_id <> awo.company_id OR (i.id IS NOT NULL AND i.company_id <> sl.company_id));
```

### 6. Top 3 risks (ranked)

1. **Silent over-issue → invisible stock loss + bucket/ledger drift.** No free-stock check anywhere +
   `Math.max(0,…)` floor. Over-issue destroys free value silently, credits WIP in full, and a later
   return re-creates phantom stock. Permanent desync of `items.stock_*` from `stock_ledger`.
2. **Migration drift: `from_state`/`to_state` and `v_stock_free` exist only in the live DB.** Every
   assembly posting and all availability reads depend on them; a migration-only rebuild breaks issuance.
3. **Non-atomic, non-trigger stock maintenance + cross-company balance bug.** Ledger insert and the two
   bucket writes are separate awaits (drift on partial failure, no reconciler); `balance_qty` ignores
   `company_id` (`assembly-orders-api.ts:1037-1044`); `cancelAssemblyWorkOrder` default `'none'` strands
   WIP.

> **Implications for design:** Before trusting assembly numbers, add a free-stock guard at issue (block or
> hard-warn against `v_stock_free`) and stop the silent 0-floor from absorbing over-issues; then add a
> ledger↔bucket reconciliation report. The drift items (§Caveat) must be captured as real migrations.
> Ledger conventions here (`transaction_type`, `from_state`/`to_state`, `to_state='free'↔stock_free`) are
> the same ones the Section 4 stock-set script must honor.

---

## SECTION 4 — Consumables stock update: schema confirmation (read-only Step 0)

### 1. Exact stock storage model

There is **no separate stock table.** On-hand lives in **bucket columns on `public.items`**; the event
log is **`public.stock_ledger`**.
- Item PK `items.id`. **Free/available column = `items.stock_free`** (issuable bucket;
  `20260331000001_phase13_stock_buckets.sql:4-9`). Legacy `items.current_stock` is kept synced to
  `stock_free` (`items-api.ts:977-978`). `items.aimed_stock` is a target, not on-hand.
- **Ledger `public.stock_ledger`** (`20260319000004:40-71`): FK `item_id`; movement column is
  **`transaction_type`** (NOT `movement_type`); quantities `qty_in`/`qty_out`/`balance_qty`; bucket-state
  columns **`from_state`/`to_state`** (live-DB-only — see Caveat). State↔bucket map in
  `stock-states.ts:28-39` (`free→stock_free`, `in_process→stock_in_process`, …; terminal states have no
  bucket). Availability read = view **`v_stock_free`** (`stock-free-api.ts:25-29`), also live-DB-only.
- `types.ts` `items` block (`:1088-1145`) is **stale** — it omits the five `stock_*` bucket columns.

### 2. Recomputed by trigger, or written directly? → **Directly by app code (no trigger).**

No trigger reads `stock_ledger` to write `items.stock_*`. App code does **two writes**: INSERT a ledger
row (`addStockLedgerEntry`, `assembly-orders-api.ts:1011-1060`) then a read-modify-write
`updateStockBucket` (`items-api.ts:934-988`, delta floored at 0, syncs `current_stock`, refreshes
`stock_alert_level`). The only stock-area trigger in migrations is
`sync_consumable_returns_aggregate()` (`20260514000020:54-101`), which recomputes
`consumable_issue_lines.qty_returned` only — **it touches no `items.stock_*` bucket and no ledger.**
Same two-write pattern across Opening Stock (`OpeningStock.tsx:159-183`), Physical Count
(`physical-count-api.ts:56-81`), assembly issue/return.

### 3. Count queries (DB unreachable — run read-only against live DB)

(a) Target items for the company:
```sql
SELECT count(*) FROM public.items
WHERE company_id = '45c14753-4e54-4327-bf77-dd9fb72899dc'
  AND (item_code LIKE 'DRILL-%' OR item_code LIKE 'TAP-%' OR item_code LIKE 'REAMER-%'
    OR item_code LIKE 'EM-%' OR item_code LIKE 'CB-%');
```
(b) How many already have stock — two senses (use whichever the script cares about):
```sql
-- (b-i) non-zero on-hand bucket
SELECT count(*) FROM public.items
WHERE company_id = '45c14753-4e54-4327-bf77-dd9fb72899dc'
  AND (item_code LIKE 'DRILL-%' OR item_code LIKE 'TAP-%' OR item_code LIKE 'REAMER-%'
    OR item_code LIKE 'EM-%' OR item_code LIKE 'CB-%')
  AND COALESCE(stock_free,0)+COALESCE(stock_in_process,0)+COALESCE(stock_in_subassembly_wip,0)
    +COALESCE(stock_in_fg_wip,0)+COALESCE(stock_in_fg_ready,0) > 0;
-- (b-ii) already has ANY ledger event
SELECT count(DISTINCT i.id) FROM public.items i
JOIN public.stock_ledger sl ON sl.item_id = i.id AND sl.company_id = i.company_id
WHERE i.company_id = '45c14753-4e54-4327-bf77-dd9fb72899dc'
  AND (i.item_code LIKE 'DRILL-%' OR i.item_code LIKE 'TAP-%' OR i.item_code LIKE 'REAMER-%'
    OR i.item_code LIKE 'EM-%' OR i.item_code LIKE 'CB-%');
```
Specifically — do any **TAP-*** codes exist yet?
```sql
SELECT count(*) AS tap_count FROM public.items
WHERE company_id = '45c14753-4e54-4327-bf77-dd9fb72899dc' AND item_code LIKE 'TAP-%';
```
*(Cannot be computed here — claude.md §8 logs "81 vendor name mismatches"; whether the 81 consumable
codes all exist, and whether TAP-* has been created, must be confirmed on the live DB before the
stock-set script runs.)*

### 4. Correct, trigger-respecting way to set opening/adjusted qty

Because **nothing is trigger-driven**, "trigger-respecting" = **replicate the app's two-write pattern**:
post a ledger event **and** update the `stock_free` bucket yourself. The app uses an **`opening_stock`
ledger event** for first-time opening stock (`OpeningStock.tsx:159-183`) with `from_state=NULL`,
`to_state='free'`, plus a direct `stock_free` delta. For the consumables script, mirror OpeningStock
(or use `manual_adjustment` for a correction) — both are unambiguously in the live CHECK. **Avoid
`physical_count` for this script** (it's written by code but absent from the latest repo CHECK — see
Caveat / Section 5).

Authoritative `transaction_type` enum (latest repo CHECK,
`20260513000010_consumable_issue_delete_and_serial.sql:42-58`): `grn_receipt, job_card_issue,
job_card_return, assembly_consumption, assembly_output, assembly_issue, assembly_return,
scrap_write_off, consumable_issue, consumable_return, invoice_dispatch, dc_issue, dc_return,
opening_stock, manual_adjustment, rejection_writeoff`.

**Exact column list to insert one opening-stock ledger row** (`stock_ledger` DDL `20260319000004:40-71`;
strict NOT NULL = `transaction_type`, `balance_qty`, but RLS/views require the rest):

| Column | Value | Why |
|---|---|---|
| `company_id` | `'45c14753-…'` | RLS isolation / tenant scope |
| `item_id` | `items.id` | FK, links to bucket |
| `item_code` / `item_description` | denormalized from `items` | display |
| `transaction_type` | `'opening_stock'` (or `'manual_adjustment'`) | **NOT NULL + CHECK** |
| `qty_in` | absolute opening qty | inflow |
| `qty_out` | `0` | |
| `balance_qty` | prev balance + qty_in − qty_out | **NOT NULL** (app computes) |
| `unit_cost` / `total_value` | cost / qty×cost (or 0) | |
| `from_state` | `NULL` | enters from nowhere |
| `to_state` | `'free'` | maps to `stock_free` / `v_stock_free` |
| `reference_type` | `'manual'` | |
| `created_by` | user uuid or NULL | |

Then the **mandatory second write** (mirrors `updateStockBucket`; for a clean set the delta is
`target − current_free`, leaving `stock_free = target`):
```sql
UPDATE public.items
SET stock_free = :target, current_stock = :target, last_stock_check = now()
WHERE id = :item_id AND company_id = '45c14753-4e54-4327-bf77-dd9fb72899dc';
```
Run per-item sequentially (`balance_qty` derives from the latest prior row;
`addStockLedgerEntry:1023-1026` notes a concurrency caveat). A ledger row alone won't change
availability; a bucket write alone leaves no audit trail.

> **Implications for design:** The stock-set script must do BOTH writes (ledger `opening_stock`/
> `manual_adjustment` with `to_state='free'` + `stock_free` update) — there's no trigger to fill the
> bucket. Confirm the 81 codes (esp. TAP-*) actually exist on the live DB first (count query above), and
> use the same ledger conventions Section 3/5 rely on. Do not use `physical_count` for this script.

---

## SECTION 5 — "Physical Count" sidebar page

**Verdict up front: SAFE — a properly-wired reconciling stock-take, not a parallel source of truth.**

### 1. Route, component, sidebar

- Route `App.tsx:204`: `<Route path="/physical-count" element={<PageGuard page="stock-ledger">
  <PhysicalCount/></PageGuard>}/>` (import `:51`). Note it is guarded under the **`stock-ledger`**
  permission domain — explicitly bucketed with stock, not siloed.
- Sidebar `AppSidebar.tsx:894-899` ("Physical Count" → `/physical-count`, roles
  admin/finance/storekeeper); also in `MobileNav.tsx`.
- Files: `pages/PhysicalCount.tsx` (UI), `components/PhysicalCountImportDialog.tsx` (CSV), logic in
  **`src/lib/physical-count-api.ts`**.

### 2. Git history — **planned feature, not a stray**

```
65a59da  2026-06-07 12:44  feat(stock): Physical Count entry — per-item count posts a ledger reset into free…
d92aedc  2026-06-07 12:58  feat(stock): CSV bulk import for Physical Count — preview, classify, confirm, apply
```
Introducing commit `65a59da` is a coherent single-feature commit touching `App.tsx`, `AppSidebar.tsx`,
`MobileNav.tsx`, plus new `physical-count-api.ts`/`PhysicalCount.tsx`, and it adds `'physical_count'` to
the shared `StockLedgerEntry.transaction_type` union (`assembly-orders-api.ts:118`) — the hallmark of a
deliberate integration. CSV import followed 14 min later, same author (repo owner).

### 3. What SAVE writes — **no `physical_count` table exists** (grep of migrations + types.ts is empty);
it's purely a `transaction_type` value. `recordPhysicalCount` (`physical-count-api.ts:36-90`) does two
writes:
- **A — ledger row** (`:56-76` via `addStockLedgerEntry`): `transaction_type:'physical_count'`,
  `qty_in:counted` (absolute counted value), `qty_out:0`, `reference_type:'stock_count'`,
  `to_state:FREE`, notes record prior vs counted.
- **B — bucket** (`:81`): `updateStockBucket(itemId,'free', counted - priorFree)` → `stock_free` lands at
  the absolute counted value, `current_stock` force-synced.

### 4. Adjustment event vs direct set → **Both — it does NOT bypass the ledger.** It posts a real
ledger event (A) and sets the bucket (B). In this app buckets are **JS-driven, not trigger-recomputed**
(only a one-time backfill exists, `20260331000001:12`), so "post ledger row + call `updateStockBucket`"
**is** the canonical mechanism — writing the bucket is not a bypass. One nuance: the ledger `qty_in` is
the **absolute** counted value (a reset base for the free-view), while the bucket move (B) is the correct
**delta** (`counted − priorFree`) = the variance. This mirrors Opening Stock (`OpeningStock.tsx:160-183`,
absolute `qty_in` + delta bucket move).

### 5. Same buckets as GRN / DC / consumable-issue? → **Yes, identical target.** All flows call
`updateStockBucket(itemId, <bucket>, delta)` on `items.stock_*` + post to `stock_ledger`. Physical Count
writes the **same `stock_free` bucket** as Opening Stock / consumable issues / GRN reversals, and
deliberately leaves `in_process`/`wip`/`fg` untouched (`physical-count-api.ts:11-12,78-80`) — correct,
since only on-shelf stock is physically countable.

### 6. Verdict & recommendation → **Reconciling stock-take. SAFE. No data-integrity fix required.**

It maintains no own quantity store, has no own table, and does not bypass the ledger. **Smallest change
(optional, cosmetic only):** the page subtitle says it "resets the stock ledger base"
(`PhysicalCount.tsx:101-102`) — functionally it posts a normal `physical_count` row + a variance bucket
move, so reword to *"records a counted quantity and posts the variance"* to read as reconciliation, not a
truncation. Copy change, not code.

> **⚠️ One real (drift) caveat to verify on the live DB:** the latest `stock_ledger` CHECK in the repo
> (`20260513000010`, 2026-05-13) **does not list `'physical_count'`**, yet the page (added 2026-06-07)
> inserts exactly that value. Either the live CHECK was altered directly (likely, since the page is
> presumably working) or these inserts fail. Confirm `pg_get_constraintdef` for
> `stock_ledger_transaction_type_check` on the live DB. This is the §4 reason to keep the consumables
> script on `opening_stock`/`manual_adjustment`.
>
> **Implications for design:** Keep Physical Count — it is the same write path as every other stock flow
> (shared with §4), so it's a safe stock-take, not a parallel truth. Only action items: a copy reword,
> and add a migration registering `'physical_count'` in the CHECK so the live DB and repo agree.

---

## SECTION 6 — Operations-health dashboard redo

### 1. Current Dashboard (`src/pages/Dashboard.tsx`) — cards + queries

All cards are direct table reads aggregated client-side via React Query; **no DB views drive the cards**
(except `stock_alerts` in the board). Inventory:

| Card / widget | Source fn / file | Tables |
|---|---|---|
| PO/DC approval pills | `fetchPending*ApprovalCount`, `fetchUnread*RejectionCount` | `purchase_orders`, `delivery_challans` |
| Stock Alerts Board | `StockAlertsBoard.tsx` | `stock_alerts` view + `items`, `purchase_orders`, `po_line_items`, `assembly_work_orders` |
| Outstanding POs | `OutstandingPOsWidget.tsx` | `purchase_orders` + `parties` |
| Outstanding DCs | `OutstandingDCsWidget.tsx` | `delivery_challans` + `parties` |
| Storekeeper cards | `fetchAwaitingStoreCount`, `fetchPendingQCGRNs` | `grns` |
| Production card | `fetchAwoStats`, `fetchFatStats` | `assembly_work_orders`, `awo_line_items`, serials/FAT |
| Financials card | `fetchDashboardData` | `invoices`, `purchase_orders` |
| Ready-to-Ship | `fetchReadyToShip` | `serial_numbers` |
| Recent Activity | `fetchRecentActivity → fetchAllAuditLog` | `audit_log` |

`fetchDashboardData` (`Dashboard.tsx:58-127`) issues five parallel reads: `invoices`
(`grand_total, invoice_date, due_date, status`, FY-filtered, `status<>'cancelled'`), open `purchase_orders`
value (`status in issued/partially_received`), open `delivery_challans` (`dc_type, return_due_date`,
`status='issued'`), `items` (`stock_free, stock_in_fg_ready, min_stock`, `status='active'`), and an open-PO
count. **Note:** the "Overdue POs" label (`:119`) is actually a count of all open POs
(draft/issued/partially_received), **not date-filtered** — a real bug to fix in the redo.
`OutstandingPOsWidget` (`:25-33`) reads `purchase_orders` in `draft/approved/issued/partially_received`;
`OutstandingDCsWidget` (`:25-33`) reads `delivery_challans` in `draft/issued`. `MetricCard.tsx` is a pure
presentational card, **not currently imported by Dashboard** — reusable for the redo.

### 2. `stock_alerts` view → **NOT in version control** (defined directly in the live DB; see Caveat).
`grep` for `stock_alerts`/`effective_stock` in migrations = 0 hits; `types.ts` Views block is
`[_ in never]: never`. Consumer code (`StockAlertsBoard.tsx:79-101`, `Dashboard.tsx:405-455`) implies
columns `id, item_code, description, item_type, effective_stock, min_stock, shortage, company_id,
alert_type` (`aimed_stock` is NOT in the view — supplementally fetched from `items`). **The five buckets
it sums are the `items.stock_*` columns** (`20260331000001:4-9`); `effective_stock` is almost certainly
`stock_free` (± `stock_in_process`), per the alert-level CASE (`:22-28`). Get the real DDL on the live DB:
`SELECT pg_get_viewdef('public.stock_alerts'::regclass, true);` — cannot run here.

### 3. "Procurement Intelligence" remnants → **none to clean up; live and reusable.** No file literally
named that. The page is **`ReorderIntelligence`** — a thin wrapper rendering `<StockAlertsBoard …/>`,
still routed (`App.tsx:66,212`, sidebar "Reorder Alerts" → `/reorder-intelligence`,
`AppSidebar.tsx:163,788`). The only "Procurement Intelligence" trace is a tooltip label
(`AppSidebar.tsx:140`). Reusable as-is.

### 4. Follow-Up Tracker (`src/pages/FollowUpTracker.tsx`, `src/lib/follow-up-api.ts`) — four tabs (open
POs, open DCs, partially-received POs, partially-returned DCs). Reads: PO `status in
issued/partially_received`, **due date = earliest `po_line_items.delivery_date`** (no header column),
auto-hidden when a closed GRN exists; DC `status='issued'`/`partially_returned`, **due date =
`delivery_challans.return_due_date`**; completion via **`follow_up_logs.manual_received/_at`** (added
`20260414000001_follow_up_logs.sql`). ⚠️ `follow_up_logs.follow_up_{1..4}_*` are **manual fields** — not
usable for a derived-only health score.

### 5. Per-document columns for aging/health (reliability: NN=NOT NULL, DEF=has default, NULLABLE=optional)

- **PO** (`purchase_orders`+`po_line_items`): created `po_date`(NN)/`created_at`(NN) ✅; `issued_at`,
  `approved_at` NULLABLE; `status`(DEF: draft/approved/issued/partially_received/cancelled/rejected) ✅;
  **expected delivery = `po_line_items.delivery_date` (per-line, NO header col, NULLABLE)** ⚠️; ordered
  `po_line_items.quantity`(NN) ✅; received `received_quantity`/`pending_quantity` (trigger-maintained,
  `20260511015000_…pending_quantity_trigger.sql`, null until first receipt).
- **GRN** (`grns`+`grn_line_items`): inward `grn_date`(NN)/`created_at`(NN) ✅; **QC stage `grns.grn_stage`
  (DEF: draft/quantitative_pending/quantitative_done/quality_pending/quality_done/awaiting_store/closed)**
  ✅; `quantitative_completed_at`, `quality_completed_at` NULLABLE; **store-confirm: `partial_store_confirmed`
  (bool DEF), line `store_confirmed`(bool DEF)/`store_confirmed_at`(NULLABLE)/`store_confirmed_by`**;
  qtys `total_accepted/received/rejected`, line `conforming_qty`/`non_conforming_qty`(DEF 0).
- **Job-work DC** (`delivery_challans`+`dc_line_items`): out `dc_date`(NN)/`created_at`(NN)/`issued_at`(NULL)
  ✅; `dc_type`(NN) ✅; **expected return `return_due_date` (date, NULLABLE, returnable only)** ⚠️;
  `status`(DEF: draft/issued/partially_returned/returned/cancelled) ✅; returned
  `dc_line_items.returned_qty_nos/kg/sft`(NULLABLE — "absence=unknown, not zero",
  `20260518000000`), rejected-on-return `returned_qty_rejected_*`.
- **Job Card** (`job_cards`+`job_card_steps`): `current_stage`(int DEF 1) ✅ / `current_stage_name`(NULL);
  `status`(DEF: in_progress/completed/on_hold) ✅; `current_location`(DEF in_house/at_vendor) ✅;
  `created_at`(NN) ✅ / `completed_at`(NULL); step `started_at`/`completed_at`/`inspected_at`(NULL),
  step `status`(DEF: pending/in_progress/done/pre_bizdocs/material_returned) ✅.
- **Invoice** (`invoices`): `invoice_date`(NN)/`created_at`(NN) ✅; `due_date`(NULLABLE) ⚠️; payment via
  `status`(DEF: draft/sent/partially_paid/paid/cancelled) ✅ + `amount_paid`/`amount_outstanding`(NULL);
  credit terms `payment_terms`(free text NULLABLE — unreliable). **No separate receipt table** — payment
  tracked only on `invoices`.

### 6. Audit/event log → **`audit_log`** (`20260316194155_…sql`): `id, company_id, document_type,
document_id, action, details(jsonb), user_id, user_email, user_name, created_at`; indexed on
`document_id` + `company_id`; insert-only (RLS, no update/delete) so timestamps are trustworthy. Cheap
"last action per document":
```sql
SELECT document_type, document_id, MAX(created_at) AS last_action_at
FROM public.audit_log
WHERE company_id = '45c14753-4e54-4327-bf77-dd9fb72899dc'
GROUP BY document_type, document_id;
```
Caveat: coverage depends on every mutation calling `logAudit()`; LEFT JOIN to the source table and fall
back to `updated_at`/`created_at` for docs with no audit rows.

### 7. Coverage counts (run read-only on live DB — decides if "target date" signals are usable day one)

```sql
-- (a) open POs with a non-null expected delivery date (line-level)
SELECT COUNT(*) FROM purchase_orders po
WHERE po.company_id = '45c14753-4e54-4327-bf77-dd9fb72899dc'
  AND po.status IN ('draft','issued','partially_received')
  AND EXISTS (SELECT 1 FROM po_line_items li WHERE li.po_id = po.id AND li.delivery_date IS NOT NULL);
-- (b) open job-work DCs with an expected return date
SELECT COUNT(*) FROM delivery_challans dc
WHERE dc.company_id = '45c14753-4e54-4327-bf77-dd9fb72899dc'
  AND dc.dc_type = 'returnable' AND dc.status IN ('issued','partially_returned')
  AND dc.return_due_date IS NOT NULL;
```
(Run each without the date predicate for the denominator → the % coverage that tells you whether
target-date signals are usable on day one.)

> **Implications for design:** Everything needed for a derived health/donut dashboard already exists as
> timestamps/statuses — no new manual fields. Build deductions off PO aging (`po_date` vs
> `po_line_items.delivery_date` + received/pending), DC return aging (`dc_date`/`return_due_date` vs
> status), GRN stage latency, job-card stage age, invoice overdue. Two reliability gaps to gate on the §7
> coverage counts: PO expected-delivery and DC `return_due_date` are NULLABLE — treat NULL as "unknown,"
> not "on-time." Reuse `audit_log` (last-action-per-doc), `MetricCard.tsx`, and the existing
> `stock_alert_level` critical/warning/watch/locked/healthy taxonomy for the traffic-light donut; capture
> the missing `stock_alerts` view DDL into a migration while you're in there.

---

## Appendix — environment & method

- **Sources used:** `supabase/migrations/*.sql` (112 files), `src/` (pages, components, lib),
  `src/integrations/supabase/types.ts` (stale snapshot), git history. **Live DB not reachable** (network
  policy blocks the Supabase host) — all "counts" and live-state confirmations are given as runnable
  read-only SQL, not executed.
- **No files were modified and no SQL was run** during this audit (this report is the only artifact).
- **Highest-leverage live-DB confirmations to run next:** (§5) does `stock_ledger_transaction_type_check`
  include `'physical_count'`? (§3) does any ledger↔bucket drift exist for assembly WIP? (§4) do the 81
  consumable codes — especially `TAP-*` — exist, and how many already have stock? (§6) coverage of
  `po_line_items.delivery_date` and `delivery_challans.return_due_date` on open docs. (§Caveat) capture
  `from_state`/`to_state`, `v_stock_free`, and `stock_alerts` into real migrations to end the drift.
