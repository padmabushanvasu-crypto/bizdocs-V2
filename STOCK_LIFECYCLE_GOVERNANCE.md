# BizDocs V2 — Stock Lifecycle Governance Document

**Status:** Authoritative. This document is the governing reference for every SQL session, Claude Code session, and architectural decision touching stock, and it complements CLAUDE.md. Where CLAUDE.md defines *how to operate*, this document defines *how the system is supposed to behave*. Any proposed change that contradicts this document is wrong until this document is deliberately amended.

**Written:** August 2026, from ~6 months of production operation, incident history, and live-schema verification against project `mclskjvrkopowusevuyk` (company `45c14753-4e54-4327-bf77-dd9fb72899dc`).

**Audience:** Claude (chat), Claude Code, and any future engineer. Read this in full before designing or modifying anything in the procurement → production → dispatch chain.

---

## 0. Prime Directive

**Stock is the heart of this ERP.** Every document type in the system — PO, GRN, DC, Job Card, AWO, MIR, Invoice, Dispatch — exists to move material between states in a controlled, auditable way. A feature that produces correct-looking screens but incorrect stock movement is a failed feature. A fix that repairs one screen but breaks a downstream ledger balance is a regression, not a fix.

Before any change, the question is never "does this fix the reported symptom?" It is: **"after this change, does every unit of material still have exactly one truthful, ledger-backed location, across the forward flow AND every reverse path (edit, delete, cancel, reversal) of every stage it can pass through?"**

---

## 1. The Foundation: Buckets, States, and the Ledger

### 1.1 Physical bucket columns (on `items`)

Verified live:

| Column | Meaning |
|---|---|
| `stock_free` | Usable stock in the store. **The only bucket counted as closing stock.** |
| `stock_in_process` | Out at a vendor via DC / job work |
| `stock_in_subassembly_wip` | Issued to a sub-assembly build |
| `stock_in_fg_wip` | Issued to a finished-good build |
| `stock_in_fg_ready` | Finished goods on the floor, awaiting invoice/dispatch |
| `stock_wip`, `stock_raw_material`, `stock_finished_goods` | Legacy columns. Do not write to these. Do not build new logic reading them. |

Rules:

1. **Closing stock = `stock_free` only.** WIP buckets are never included in closing stock or stock-position calculations. The Stock Register and its Excel export already follow this; never regress it.
2. Bucket columns are **derived caches** of the ledger. Every write must go through the ledger RPC stack (`rpc_increment_stock_bucket` and the guarded RPCs). No direct `UPDATE items SET stock_free = ...` outside a deliberate, signed-off reconciliation.
3. All bucket columns carry DB-level non-negative CHECK constraints. A change that would drive a bucket negative must **fail loudly** (`RAISE EXCEPTION`), never clamp silently (`GREATEST(0, ...)` / JS `Math.max`). Silent clamping is how the 78-item / 4,575-unit phantom-stock incident happened.

### 1.2 The state machine

Canonical states: `incoming → free → {in_process | subassembly_wip | in_fg_wip} → ... → in_fg_ready → dispatched`, with terminal states `consumed`, `scrap`/`scrapped`, `returned_to_vendor`, `dispatched`.

Canonical transitions (verified against live ledger data):

| Event | transaction_type | from_state → to_state |
|---|---|---|
| PO goods accepted + store-confirmed | `grn_receipt` | `incoming → free` |
| Material sent to vendor (DC) | `dc_issue` | `free → in_process` |
| Material returned from vendor (DC-return GRN, final, store-confirmed) | `dc_return` | `in_process → free` |
| Components issued to sub-assembly build | `assembly_issue` | `free → subassembly_wip` |
| Components issued to FG build | `assembly_issue` | `free → in_fg_wip` |
| Components consumed on AWO acceptance | `assembly_consumption` | `subassembly_wip → consumed` (or `in_fg_wip → consumed`) |
| Built output enters stock | `assembly_output` | `null → free` (sub-assembly) or `null → in_fg_ready` (FG) |
| Unused components returned from a build | `assembly_return` | `subassembly_wip → free` / `in_fg_wip → free` (also valid: `consumed → free` for completed-WO reversal) |
| WIP scrapped | `scrap_write_off` | `subassembly_wip → scrap` |
| QC rejection, scrap disposition | `rejection_writeoff` | source → `scrapped` (ledger-only leg; FREE untouched) |
| QC rejection, return-to-vendor | `vendor_return` leg pattern | source → `returned_to_vendor` (ledger-only leg) |
| Invoice/dispatch | `invoice_dispatch` | `in_fg_ready → dispatched` |
| Consumables | `consumable_issue` / `consumable_return` | `free → consumed` / `consumed → free` |
| Opening stock | `opening_stock` | `null → free` |
| Corrections, merges, reconciliations | `manual_adjustment` | any → any, with explicit states |

Rules:

4. **`from_state` and `to_state` must be populated on every new ledger row.** Single-row transition model, not double-entry pairs. Live data contains historical NULL-state rows (`opening_stock`, early `dc_return`, `manual_adjustment`); those are legacy — never add more.
5. **Canonical label is `subassembly_wip`.** Live data contains legacy variants (`in_subassembly_wip`, `wip`, `stock_free`, `stock_in_fg_ready` as *state labels*). All write paths were standardized; display maps (`STATE_LABELS`) translate historical variants. New code writes canonical labels only. Reconciliation queries must treat legacy labels as aliases, not as separate states.
6. **The ledger is append-only.** Never edit or delete historical rows. Corrections are compensating forward entries. The only exception ever made was archiving verified-spurious rows into a `z_spurious_ledger`-style archive table during a signed-off incident cleanup — that is an incident procedure, not a pattern.
7. The `stock_ledger` CHECK constraint enumerates allowed transaction types (verified live: `grn_receipt, job_card_issue, job_card_return, assembly_consumption, assembly_output, assembly_issue, assembly_return, scrap_write_off, consumable_issue, consumable_return, invoice_dispatch, dc_issue, dc_return, opening_stock, manual_adjustment, rejection_writeoff`). Adding a type means amending the constraint deliberately, with a migration file, not casting around it.

### 1.3 UOM rule (enforced at every stage)

Every item has a **primary quantity** (authoritative UOM) and an optional **alternate quantity** (`_2` columns: `quantity_2`, `unit_2`, `conforming_qty_2`, ...).

- Alternate qty exists for goods movement and physical measurement only: PO ordering reference, GRN receiving, DC send/receive, QC capture.
- **All stock math — buckets, ledger quantities, closing stock, shortage, reorder — uses primary qty only. Never alternate.**
- `rate_basis` (`primary`/`alternate`, snapshotted from DC/PO lines onto GRN lines at creation) governs *pricing* only, never stock.
- The inward/QC/store chain may *display* alternate figures for audit; it must *credit* primary. A recurring bug class is agents "fixing" alt-basis flows by routing stock through `_2` columns — this is always wrong (see §7, alt-GRN incident).

---

## 2. Forward Flow, Stage by Stage

This is the canonical happy path. Every stage lists its stock effect. **A stage with no listed stock effect must not touch stock.**

### Stage A — Purchase Order

1. PO created (`purchase_orders` + `po_line_items`) → status `pending_approval` → approved → issued. **No stock effect.** A PO is a promise, not material.
2. `po_line_items.received_quantity` and `pending_quantity` are **trigger-owned computed columns** (`grn_line_items_sync_po_received`, `trg_po_line_items_sync_pending_quantity`, `recompute_po_line_received_quantity`). They have exactly one writer: the trigger stack. No RPC, no client code, and no fix may write them directly.
3. `recompute_po_line_received_quantity` reads `accepted_quantity` until store confirmation, then switches to `store_confirmed_qty`. This asymmetry is deliberate; do not "simplify" it.
4. `trg_prevent_po_over_receipt` is the authoritative over-receipt ceiling. Any additional over-receipt guard inside an RPC is redundant and, because triggers also write, race-prone. Remove rather than duplicate.

### Stage B — GRN (PO receipt): three gates before stock exists

The two-stage GRN plus store confirmation is the single most important sequencing invariant in the system:

1. **Stage 1 — Inward (quantitative):** physical receipt recorded. Optionally in alternate UOM. **No stock effect.**
2. **Stage 2 — QC (qualitative):** `accepted_quantity` / `conforming_qty` / `non_conforming_qty` recorded, measurements captured, dispositions set. **Accepted quantity credits stock only per the established stock-posting path (`stock_posted_at` gating)** — the accepted-side delta logic is a NO-TOUCH zone unless the change is specifically about it.
3. **Store confirmation:** storekeeper (Latha/Priyanka/Swapna's daily queue) confirms physical placement (`store_confirmed`, `store_confirmed_qty`, location/rack). For lines gated on `is_final_grn`, the store queue only shows `is_final_grn = true` lines — a line never marked final is **invisible to the store**, which is a QC-eligibility question, not a stock bug.
4. Ledger effect when complete: `grn_receipt`, `incoming → free`, primary qty.
5. **Rejection legs are ledger-only.** `scrap` → `rejection_writeoff` to `scrapped`; `return_to_vendor` → vendor-return leg to `returned_to_vendor`; `rework` → no leg. Rejected units were never in a bucket, so these legs never touch `stock_free` or any bucket. Re-saves use reverse-then-repost for idempotency; `scrap_register` uses delete-then-insert keyed on the line id.
6. `rpc_record_grn` is the atomic save path. GRN edits after QC follow the edit-QC reopen gating; never bypass it.

### Stage C — DC / Job Work (the out-and-back loop)

1. DC issued (`delivery_challans` + `dc_line_items`, `dc_type`: returnable / non-returnable / job work) → ledger `dc_issue`, `free → in_process`, one row per line, **atomic across all lines** (a failing line must never leave a DC issued-but-partially-relieved). `block_duplicate_dc_issue` (BEFORE INSERT trigger on `stock_ledger`) plus API/UI idempotency guards prevent double-posting — this exists because DCs /507, /570, /676 historically posted 2–3×.
2. A **Job Card** is raised from the DC for stage tracking (`job_cards` + `job_card_steps`, linked by DC id). Job cards follow the item's `bom_processing_routes` stages (unique on `(company_id, item_id, stage_number)`). Job cards are **tracking documents — no direct stock effect**; stock moves only via DC issue and DC-return GRN.
3. Multi-stage processing = a chain of DCs: return from stage 1 → new DC to stage 2 → etc. Stage suggestion keys off accepted return quantity and the route's `is_final_stage` flag — **not** `is_final_grn`; the two are orthogonal.
4. **DC-return GRN:** same Stage 1 → Stage 2 → store gates. Non-final lines credit at QC; `is_final_grn` lines credit at store-confirm — each line credits **exactly once** (`dc_return`, `in_process → free`). `trg_prevent_dc_over_receipt` is the ceiling and is inert on `is_final_grn`-only updates. PO-sync triggers hard-return on NULL `po_line_item_id` and are fully inert on DC lines.
5. Known open item: **multi-batch DC** (same item, same process, separate DC batches) is currently blocked by the cumulative tracking gap; do not "fix" it by weakening the duplicate-issue guard.

### Stage D — Assembly (sub-assembly and finished-good builds)

Both live in `assembly_work_orders`, discriminated by `awo_type`. The type decides the WIP bucket — this is why hardcoded buckets in return paths caused drift.

1. AWO raised via `rpc_create_awo` (atomic, advisory-lock dedup-guarded). No stock effect.
2. **Material issue** via MIR (`rpc_confirm_material_issue` / `rpc_confirm_mir`): `assembly_issue`, `free → subassembly_wip` (or `in_fg_wip` per `awo_type`), advisory-locked per item, ledger-first, idempotent under re-submit, **cumulative-target contract** (partial issues accrue toward BOM requirement; the storekeeper's "amount to issue now" field converts to a cumulative target internally).
3. BOM is the requirement source (`bom_lines`, fully populated quantities). **Open question, never verified: whether MIR snapshots the BOM at creation or reads it live** — treat any change touching this as requiring that discovery first.
4. **Return / scrap** via `rpc_return_or_scrap_wip` / `returnAssemblyComponents`: capped at `issued − returned − damage`, tracks `returned_qty`, posts `assembly_return` (WIP → free) or `scrap_write_off` (WIP → scrap), bucket chosen by `awo_type`, ledger-first, idempotent.
5. **Acceptance** via `rpc_accept_awo_and_produce`: consumes components (`assembly_consumption`, WIP → `consumed`) and produces output (`assembly_output`, `null → free` for sub-assemblies, `null → in_fg_ready` for FGs). Known parked hardening: it still contains `GREATEST(0,...)` clamping that must become `RAISE EXCEPTION`.
6. **Deletion** via `rpc_delete_awo`: state-machine-aware soft delete (`deleted_at`). Draft = simple delete; in-progress/awaiting-store = WIP return per disposition; **completed = component reversal via `assembly_return` with `consumed → free`** and output reversal. Known frontend gap: the delete dialog only renders the disposition radio for `in_progress`/`awaiting_store` and sends `p_wip_disposition = null` for completed WOs, bypassing the corrected RPC path. All AWO list/stat queries must filter `deleted_at IS NULL`.

### Stage E — Finished Goods, Invoice, Dispatch (the least-built stage)

**Honesty marker: this stage is partially built and lightly exercised (one `invoice_dispatch` ledger row exists in production). Treat everything here as design-intent + confirmed decisions, not battle-tested behavior. Any work here starts with fresh discovery.**

Confirmed decisions:

1. Completed FGs sit in `in_fg_ready` on the floor (serialization, FAT certificates, Ready-to-Dispatch queue are tracking layers).
2. **The invoice is the consumption event.** `invoice_dispatch`, `in_fg_ready → dispatched`. Backflush — the automatic downward consumption of the model's BOM — triggers **on invoice only**, never on DC-out, never on dispatch-record creation.
3. **Double-deduction landmine (unresolved):** discovery found both the invoice path and `dispatch-api`'s `recordDispatch` deducting the model under `invoice_dispatch` on different buckets. Before any dispatch/backflush work, confirm which is the real "model leaves" event and that both never fire for one shipment.
4. **Build-to-stock vs assemble-to-order decides backflush depth.** If the model was built via an FG AWO, its sub-assemblies were already consumed at acceptance — backflushing them again at invoice is double consumption. The staged-movement model Vasu described (free → sub-WIP → sub-assembly → FG-WIP → FG-ready → dispatched) implies consumption happens at each build step, and the invoice moves only the finished model out. Backflush must **complement** that movement, never re-run it.

---

## 3. Reverse Engineering: Edits, Deletes, Cancels, Reversals

This is where the pipes entangle. For every stage, the reverse paths and their known landmines:

### 3.1 The destructive-edit pattern (systemic, two confirmed instances)

**PO edit** (`replace_po_line_items`) and **DC edit** both use DELETE + re-INSERT of line items. Consequences, confirmed in production:

- FK links from existing GRN lines are severed (`ON DELETE SET NULL`) → broken received-quantity rollups (PO-26-27/354, /350, /235 incidents).
- Column defaults reset on re-insert (e.g. `rate_basis`), so every persistent value must be threaded through **both** create and update payloads.
- Recomputation of `pending_quantity` doesn't fire automatically for orphaned links.

**Rules:** never introduce this pattern in new code — edits should update in place, preserve FKs, and recompute. When touching an existing destructive-edit flow, the checklist is: what FKs point at these rows, what defaults reset, what computed columns need recompute, what downstream documents (GRNs, job cards) reference the old ids. A PO with receipts must additionally preserve approval/receiving provenance on edit (never reset to `pending_approval`).

### 3.2 Ordered-quantity snapshots

GRN `ordered_qty` is snapshotted at GRN creation, never re-read. Editing a PO line quantity after a GRN exists therefore does not propagate; the unblock is a new GRN reading live quantities. This stored-vs-derived divergence is a recurring root-cause class — before storing any derived value, justify why it can't be computed live, and if stored, name its single owner.

### 3.3 Opening-stock edit bug (systemic, uninvestigated)

The opening-stock edit flow **appends a full new ledger row on every correction instead of posting a delta.** Consequence: ledger SUM is inflated/noisy across hundreds of items while `items.stock_free` is usually correct. Until root-caused: **for opening-stock-affected items, `stock_free` is the more reliable figure and the ledger SUM is not evidence of drift by itself.** Never "reconcile" such an item by trusting the SUM.

### 3.4 DC deletion / cancellation

- Hard-delete of a DC mid-flow is the go-live blocker: whether a raised Job Card cascades, orphans, or survives is **unverified**. The agreed direction is **Cancel (soft), not delete** — a `cancelled` status with explicit reversal of the `dc_issue` ledger rows (`in_process → free` compensating entries) and explicit Job Card handling.
- Any DC reversal must respect the credit-exactly-once property of returns already received: cancel of a partially-returned DC reverses only the un-returned balance.

### 3.5 AWO deletion — the +4 lesson

SA-WO-2627-179–182 (phantom WOs): a prior **manual opening-stock "+4" correction may have already corrected `stock_free`**, so a standard output reversal would drive the count to 0 incorrectly. Generalized rule: **before reversing any document, check whether a manual adjustment already compensated for it.** Reversal math is `document effect − manual compensations already applied`, verified against physical count where stakes are high.

### 3.6 QC edits and dispositions

Reopening closed QC follows reverse-then-repost: reverse the prior rejection leg using snapshotted old disposition/qty, post the new leg. Accept↔reject flips are two independent passes (accepted-delta pulls units from FREE; rejection leg is ledger-only). Never collapse them into one "smart" update.

### 3.7 Item merges and duplicates

Merge pattern: repoint order/transaction tables to the keeper; **never repoint `stock_ledger`** (each item's balance chain is internally consistent); fold stranded stock via `manual_adjustment` with `item_merge` reference. `~MERGED` / `~DUPLICATE-IMPORT` suffixes mark retired records. Watch `bom_processing_routes` unique constraint on repoints. Duplicate items are the root cause of phantom-shortage bugs (BOM lines pointing at inactive duplicates create ghost MIR lines) — the structural fix (unique functional index on normalized `item_code`) is designed but not yet applied.

---

## 4. Ownership Map: Who Writes What

Single-writer discipline is non-negotiable. Verified live:

| Value | Sole owner | Everyone else |
|---|---|---|
| `po_line_items.received_quantity`, `pending_quantity` | Trigger stack (`grn_line_items_sync_po_received`, `trg_po_line_items_sync_pending_quantity`, `recompute_po_line_received_quantity`) | Read-only |
| PO over-receipt ceiling | `trg_prevent_po_over_receipt` | No duplicate guards in RPCs |
| DC over-receipt ceiling | `trg_prevent_dc_over_receipt` | Same |
| DC duplicate issue | `block_duplicate_dc_issue` trigger + API idempotency | Never weaken for feature work |
| Bucket columns on `items` | Ledger RPC stack | No direct writes |
| GRN reject handling | `saveQualityStage` (single writer; the dormant duplicate was removed) | Do not reintroduce parallel writers |
| Document numbers | `*_assign_number` BEFORE INSERT triggers | Never client-generated |
| Stock movement RPCs | `rpc_confirm_material_issue`, `rpc_confirm_mir`, `rpc_return_or_scrap_wip`, `rpc_accept_awo_and_produce`, `rpc_record_grn`, `rpc_delete_awo`, `rpc_create_awo` | Client code orchestrates, never re-implements |

**Before touching any trigger-owned or single-writer value:** search every other function that writes it (`pg_get_functiondef(p.oid)` over `pg_proc`), then dry-run the most common end-to-end workflow — not just the reported case. This rule exists because RPC-vs-trigger double-writes have caused real race conditions here.

Concurrency: item-level advisory locks via `pg_advisory_xact_lock(hashtextended(item_id::text, 0))` are the established pattern for any multi-step stock movement. `SECURITY DEFINER` functions must set `SET search_path = public`.

---

## 5. Decision Rules for Any Agent (Claude Code or SQL)

Run through these before proposing or making any change in the flow:

1. **Locate the change on the map.** Which stage (§2), which reverse path (§3), which owner (§4)? If it doesn't fit the map, the map is incomplete — stop and flag, don't improvise.
2. **Discovery before assumption.** Live DB over migration files over memory. `information_schema` for schema; `pg_get_functiondef` for function bodies; live ledger data for actual state labels. Both standard and sub-assembly WOs live in `assembly_work_orders` (`awo_type`); UUID literals need `::uuid`.
3. **Verify the bug before fixing it.** Reproduce or evidence it in data. A screenshot from the shop floor describes a symptom, not a cause (the alt-GRN incident: symptom "wrong measure," actual cause `is_final_grn` gating).
4. **Trace both directions.** For any stage touched, enumerate its reverse paths (edit/delete/cancel/reversal) and confirm the change survives each. A fix that only works forward is half a fix.
5. **Credit exactly once.** Any path that credits stock must be idempotent under re-submit, re-save, and edit. Reverse-then-repost for edits; delete-then-insert keyed on a deterministic id for derived registers; idempotency guards on issue paths.
6. **Fail loudly.** No silent clamps, no `.maybeSingle()` swallowing ambiguous matches, no empty-BOM-explosion proceeding as "nothing to consume." Loud failure at the shop floor beats silent drift discovered months later.
7. **Primary qty for stock, always.** Any change routing stock math through `_2` columns is wrong by definition.
8. **Don't fix what's parked.** §7 lists known anomalies deliberately left alone (stranded stock, ledger drift, dedup clusters). An agent encountering these must not "helpfully" reconcile them — each needs its own signed-off session with physical-count context.
9. **Destructive actions need explicit authorization.** Deletes and data mutations: show, wait, then act. DDL may proceed once logic is shown. Dry-run pattern: `BEGIN; [op]; [verify]; ROLLBACK;` → confirm → re-run with `COMMIT` (in one submission — the SQL editor rolls back across submissions).
10. **Repo and live DB stay in sync.** Live changes first, migration file recorded after as documentation. Single-concern commits, heredoc messages, package files excluded, no push without sign-off.

---

## 6. Environment Gotchas (repeated incident causes)

- PostgREST truncates unscoped fetches at **1,000 rows silently**. All list queries need `.range()` pagination or batched scoped fetches (`fetchAllCompanyItems` pattern with loud abort guard). Confirmed victims: store receipt queue, stock alerts fallback path (still open at 732/1,000).
- `execute_sql` returns only the **final statement's** result of a multi-statement submission — run verification SELECTs separately. `execute_sql` over `apply_migration` for DDL in live sessions.
- Auth lookups: use the session-cached `auth-helpers.getCompanyId` resolver, not repeated `getUser()` + `profiles` round trips.
- File transfer between Claude Code and chat: agent's `Write` tool + integrity check (`sha256sum`, `wc -l`), never copy-paste relay.

---

## 7. Known Open Anomalies (do not "fix" in passing)

Each of these is known, parked, and awaiting its own dedicated session. Encountering them is expected; acting on them unilaterally is prohibited.

- **DC-delete → Job Card cascade**: unverified; go-live gate. Direction: Cancel-not-delete.
- **Item `f2df02c0` (230331 U V2)**: ledger drift from historical DC double-posting; needs physical-count reconciliation.
- **Item `230237`**: 881 stranded units on an inactive record.
- **SA-WO-2627-179–182**: four phantom WOs; reversal blocked on physical gear-box count (+4 compensation ambiguity, §3.5); frontend disposition-radio gap.
- **Opening-stock append bug**: systemic ledger inflation; root cause uninvestigated (§3.3).
- **GRN-1 / GRN-245 (MS Bright Bar, 54 KGS)**: store-confirmed but never posted; backfill teed up, not executed.
- **V-item family** (V869, V876, V904, V907 A, V923 A) and parked dedup clusters (E98, E277, E106, E119, E309, E310, ~23 others): duplicate rows with conflicting stock.
- **INS-3 sheet**: 71 items absent from items master.
- **`rpc_accept_awo_and_produce`** silent clamping; **`updateStockBucket` → `rpc_increment_stock_bucket`** uncommitted; **unique `item_code` index** unapplied; **stock-alerts pagination** unpatched; **`min_stock` vs `min_stock_override`** mapping; **multi-batch DC**; **weldment pool** (designed in `SUBSTORE_ARCHITECTURE.md`, blocked on client mapping sheet); **invoice-vs-dispatch double deduction** (§2 Stage E).

---

## 8. Amendment Rule

This document is authoritative but not frozen. When reality and this document disagree: verify against the live DB, and if the document is wrong, amend it in the same session as the change — the document, CLAUDE.md, the migration files, and the live DB move together. A change that is correct but undocumented here is unfinished work.
