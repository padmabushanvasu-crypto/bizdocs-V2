# BizDocs V2 — DC / Job-Card / Stage Flow: Audit & Redesign

**Date:** 5 Sep 2026  
**Scope:** How material moves through processing stages (job card → DC → vendor → GRN/QC → store → next stage), what is broken today, and a proposal to make it batch-aware and stage-gated.  
**Status:** Design proposal — no schema or data changes made. Decisions needed are listed in §7.

---

## 1. The one-line diagnosis

**The system has no record of "how many units of item X have finished stage N".** Everything else — batches that can't split, stages that can't be gated, job cards that never close, DC edits that orphan GRNs — follows from that single missing fact.

Today a DC for stage 8 can be raised against any free stock of the item, with no way to know whether those units ever went through stage 6. A returned batch from milling goes back into the same `free` bucket as raw copper sheet. The job card that was supposed to track the batch has become a per-item scratchpad.

---

## 2. What the audit found (live DB, 5 Sep 2026)

All figures are for the production company. Everything below was read-only.

### 2.1 Five overlapping "stage" models, three of them dead

| Table / column | Rows | What it was for | Actual state |
|---|---|---|---|
| `bom_processing_routes` | 4,205 rows / 702 items | Route master: stage N → process code, internal/external | **Alive and mostly good.** Some stages have null process names (e.g. 230206 stage 13). |
| `job_cards` + `job_card_steps` | 334 cards / 2,639 steps | The batch and its step-by-step execution | **Alive but misused** (see §2.2) |
| `job_card_step_dcs` | 621 links | Multiple outward DCs per step | Alive, outward only, never a return |
| `dc_line_items.stage_number / stage_name / nature_of_process` | 1,437 lines with stage > 1 | Which stage this DC line is for | Alive, but **stage_name is free text** ("MILLING VMC", "MILLING-VMC", "Milling - VMC", "\tFOLDING" all appear for the same stage) |
| `bom_processing_stages` | 0 | BOM-line-level stages | Dead |
| `component_processing_log` | 0 | Per-batch current stage tracker | Dead — this was the right idea, never wired up |
| `dc_line_items.route_id / processing_log_id / job_work_step_id / is_rework` | 0 | Link DC line to route/log/step | Dead |

### 2.2 The job card is not a batch

Job cards are supposed to represent "441 pieces of 230206 going through 15 stages". In practice:

- **323 of 334 job cards are `in_progress`**; 329 are `at_vendor`. Only 11 have ever been completed. They don't close because nothing tells them the batch is done.
- **0 of 2,639 steps have ever recorded a return** (`qty_returned`, `return_grn_id`, `return_dc_id` are null everywhere). The outward leg is tracked; the inward leg is not.
- **133 job cards have the same step number appearing more than once** (206 duplicated slots). Every time a new DC was raised for a stage, a new step row was created instead of adding to the existing one.
- **110 job cards have more quantity sent at some stage than the job card's own quantity.** Example — JW-26-27/159 (230206, qty 441): stage 6 milling has three DCs totalling 1,078; stage 8 folding has two totalling 1,410. The card says 441.
- **42 internal steps (QC, deburring) carry an external DC.** The step type isn't enforced.
- **111 DCs are linked to more than one job-card step.**
- **120 job cards share their item with another job card** — because there is no rule about which card a DC belongs to, the same item ends up with several open cards and DCs land on whichever one the user picked.

Net: the job card is functioning as "everything that ever happened to item 230206", not as a batch. That is exactly why it can't answer "where are my 441 pieces?"

### 2.3 Stock has a single `in_process` bucket, and returns go to `free`

Ledger states in use for job work:

| Movement | from → to | Rows |
|---|---|---|
| DC issue | `free → in_process` | 2,004 |
| GRN return | `in_process → free` | 1,649 |

So after milling, the units are back in `free` — indistinguishable from raw sheet that has never been cut. There is no `stage-6-complete` quantity anywhere. This is why stage gating is impossible today and why the AWO engine can't tell a finished plate from a raw one.

### 2.4 DC issue is not atomic, and DC edit is destructive

- There is **no `rpc_issue_dc`**. The frontend writes ledger rows and bucket updates in a loop. This is the root of the double/triple posting on DCs /507, /570, /676 (already on the backlog).
- DC edit **deletes and re-inserts** line items, giving them new IDs. `grn_line_items.dc_line_item_id` has no FK, so 120 GRN lines across 38 DCs were left pointing at nothing (fixed at read time last week via `dcReceiptKey`; the write path is still destructive).
- `trg_block_duplicate_dc_issue` blocks a second `dc_issue` ledger row for the same **(item, DC)**. That means one DC cannot carry two lines of the same item — which is exactly what happens when two batches of the same part go to the same vendor together. This is the "second DC conflicts" symptom on the backlog.

### 2.5 What is actually good and should be kept

- The route master (`bom_processing_routes`) is 90% right: ordered stages, internal/external flag, process codes with vendor lists (`process_code_vendors`).
- The ledger is append-only with from/to states — the redesign only adds a second, finer-grained ledger next to it.
- `rpc_record_grn` and `rpc_delete_delivery_challan` already exist as atomic server-side transactions. The new issue/edit paths follow the same pattern.
- `prevent_dc_over_receipt` and `guard_grn_dc_item_conversion` are the right kind of guard (loud, DB-level).

---

## 3. How the reference systems model this

The three systems you named all converge on the same four ideas. None of them is worth adopting wholesale (SAP's PP02 flow alone involves five transaction codes), but the shape is the target.

| Concept | SAP PP | ERPNext | Odoo MRP | BizDocs today |
|---|---|---|---|---|
| **Route master** — ordered operations, each in-house or external | Routing with control key (`PP01` in-house, `PP02` external) | BOM → Routing → Operations | BOM → Operations, with "blocked by previous operation" dependency | `bom_processing_routes` ✅ |
| **Order = one batch of one item with a fixed qty** | Production Order | Work Order | Manufacturing Order | `job_cards` — but qty isn't respected ❌ |
| **Per-operation quantity confirmation** — "N units done at op 3" | `CO11N` confirmation, partial (PCNF) or final (CNF); external ops auto-confirm on goods receipt (status `EODL`) | Job Card per operation with progressive completed qty; multiple stock entries per work order | Work order per operation; partial qty via **backorder split** (MO-001 done, MO-002 open) | nothing ❌ |
| **Gate**: next op only releases what the previous op confirmed | Trigger points on confirmation | Job Card sequence | Operation dependencies ("Waiting for another WO") | nothing ❌ |
| **External op** = send material out, receive it back against the same order | Subcontract PO + `541` movement out, GR in; WIP never becomes stock | Subcontracting Order → "Send to Subcontractor" stock entry → Subcontracting Receipt; remaining qty auto-calculated for partial orders | Subcontracting via purchase | DC out ✅, GRN in ✅, but not tied to a batch ❌ |
| **Split batches** | Order split / WIP batch | Multiple partial job cards / stock entries | Backorder creates a sibling MO | duplicate step rows ❌ |

Two things worth stealing directly:

1. **SAP's rule that intermediate WIP is not stock.** Between operations, units belong to the order, not to the warehouse. Our equivalent: units stay in `in_process` for the whole life of the batch, and the batch ledger says which stage they're at. They only return to free stock when the batch finishes.
2. **ERPNext's "remaining qty auto-calculated" on partial subcontracting.** Our equivalent: a stage-N DC form shows "available to send = completed at stage N-1 minus already sent to stage N" and refuses more.

Odoo's backorder-split approach (physically cloning the order) is the one to *avoid* — it is why users on their forum complain that v17 can't do "50 at op 1, 30 at op 2, 20 at op 3". A quantity ledger handles that without cloning anything.

---

## 4. Proposed model — the batch ledger

Plain-language version first, schema after.

### 4.1 Four rules

1. **A job card is a batch.** One item, one fixed quantity, one snapshot of the route at creation. It closes when all its quantity has either completed the final stage or been scrapped. Never more than its quantity can be at any stage.
2. **Every stage keeps a running count.** For each job card and each stage: how much has been *sent in*, *completed*, *rejected*, *scrapped*. These are derived from an append-only ledger, never stored and edited.
3. **A stage can only take what the previous stage has completed.** Sending 60 to folding requires ≥ 60 milled-and-accepted units not already sent to folding, *from that job card*. Enforced in the database, not the form.
4. **A batch can enter the route part-way, but only at stages marked as entry points.** Procurement, incoming inspection, raw cutting can be skipped ("already done outside"). Milling cannot. The skip is recorded with a reason so the history is honest.

Batches split and merge for free: 100 in, 60 go to stage 2 today and 40 next week — that's just two ledger rows. No cloning, no duplicate steps.

### 4.2 What changes for users

| Today | Proposed |
|---|---|
| Raise a job card, then raise DCs and hope they land on the right step | Raise a job card for N units. The DC form asks "which job card, which stage?" and shows how much is eligible. |
| Stage typed as free text on the DC | Stage picked from the job card's route |
| Internal steps (QC, deburr) either ignored or given a fake DC | Internal steps get a one-tap "N units done by [name]" confirmation, no DC |
| Job cards never close | Close automatically when the last stage is complete |
| "Where are my 441 pieces?" — no answer | Job card screen: 210 at folding (MKS), 150 QC-passed awaiting drilling, 81 at milling, 0 scrapped |
| Same item on two DCs to the same process blocked | Allowed, tracked cumulatively against the batch |

### 4.3 Schema (additive — nothing existing is dropped in phase 1)

```
bom_processing_routes                     -- existing, cleaned
  + process_code_id uuid FK process_codes  -- replaces free-text process_code drift
  + entry_allowed   boolean default false  -- rule 4: batch may start here
  + is_gate         boolean default true   -- must be completed before next stage
  (fix: null process_name rows; unique (item_id, stage_number) where is_active)

job_cards                                  -- existing, redefined as "batch"
  + route_version   int                    -- which route snapshot was copied
  + entry_stage     int                    -- rule 4
  + qty_completed   numeric   (derived view, not stored)
  + qty_scrapped    numeric   (derived view, not stored)
  status: open | completed | closed_short   -- enforced state machine

job_card_steps                             -- existing, becomes the route snapshot
  UNIQUE (job_card_id, step_number)        -- kills the 206 duplicate slots
  step_type CHECK IN ('internal','external')
  vendor / dates / costs stay here
  (drop: qty_sent, qty_returned, qty_accepted, outward_dc_id, return_grn_id — all derived now)

job_card_stage_ledger                      -- NEW, append-only, the core of the design
  id, company_id, job_card_id, step_number,
  event      CHECK IN (
               -- forward
               'entry','skipped','issued','returned_accepted','returned_rejected',
               'internal_done','rework_in','scrapped','converted_out','released_unprocessed',
               -- backward (one per forward event; every reversal points at the row it undoes)
               'entry_reversed','skip_reversed','issue_reversed','return_reversed',
               'internal_undone','rework_reversed','scrap_reversed','conversion_reversed')
  qty        numeric NOT NULL CHECK (qty > 0)        -- primary UOM only, always positive
  ref_type   ('dc_line_item','grn_line_item','internal_confirmation','job_card','manual')
  ref_id     uuid
  reverses_ledger_id uuid FK job_card_stage_ledger   -- NOT NULL for *_reversed / *_undone
  reason     text                                    -- NOT NULL for skipped, scrapped,
                                                     -- released_unprocessed and every reversal
  created_by, created_at

  -- idempotency: a forward event can be posted once per source row
  UNIQUE (ref_type, ref_id, event) WHERE event NOT LIKE '%reversed' AND event <> 'internal_undone'
  -- a row can never be reversed by more than its own qty (trigger)
  CHECK via trigger: Σ qty of reversals pointing at row R ≤ R.qty

dc_line_items
  + job_card_id   uuid FK job_cards   NOT NULL for job-work DCs
  + step_number   int                 -- with job_card_id → FK job_card_steps
  (stage_name / nature_of_process become derived display columns)
  (job_work_id / job_work_step_id / route_id / processing_log_id — dropped in phase 3)

grn_line_items
  dc_line_item_id  → real FK, ON DELETE RESTRICT   -- edits must not delete lines any more
```

Derived views (no stored state):

```
v_job_card_stage_position     -- per (job_card, step): sent, completed, rejected, scrapped, eligible_next
v_item_stage_stock            -- per (item, step): units completed and not yet consumed by the next stage
v_job_card_status             -- open / completed / closed_short, computed from the ledger
```

`items.stock_in_process` = Σ open job-card quantity not yet completed-at-final-stage or scrapped. `items.stock_free` moves out once when the batch opens, and moves back in **per unit as units complete the final stage** (each final-stage GRN store-confirm or internal confirmation writes its own `in_process → free` stock-ledger row). There is deliberately **no batch-level "close" stock movement**: job-card completion is a pure view (`qty_original = final_completed + scrapped + converted_out`), so if a final-stage GRN is later deleted the card simply reopens and the stock reversal rides on the GRN reversal — nothing to unwind separately. Both bucket columns are already trigger-maintained; they become simpler, not more complex.

All quantities on this ledger are in the item's **primary UOM** (BizDocs UOM rule). Where a DC or GRN line was entered in the alternate UOM, the conversion to primary is done once at posting time and the factor is stored on the source line, never re-derived later.

### 4.4 The four server-side operations

All four are single transactions with `pg_advisory_xact_lock` on the job card. All fail loudly. No client-side ledger writes remain.

| RPC | Does | Guards |
|---|---|---|
| `rpc_open_job_card(item, qty, entry_stage, reason)` | Copies route snapshot into steps, writes `entry` ledger row, moves qty `free → in_process` | qty ≤ stock_free; entry_stage must be `entry_allowed`; reason mandatory if entry_stage > 1 |
| `rpc_issue_dc(dc)` | Writes `issued` rows for each line, links each line to (job_card, step) | for each line: qty ≤ eligible at that step (rule 3); step must be external; job card open. Replaces the client-side loop and fixes the atomicity bug. |
| `rpc_record_grn(...)` (extend) | On store-confirm: `returned_accepted` / `returned_rejected` rows against the DC line's (job_card, step) | qty ≤ issued − already returned for that DC line (existing `prevent_dc_over_receipt`, re-keyed) |
| `rpc_confirm_internal_step(job_card, step, qty, by)` | Writes `internal_done` | step must be internal; qty ≤ eligible |
| `rpc_update_dc(dc)` (new) | **In-place** line updates; qty reductions re-checked against the ledger; lines with GRN receipts cannot be removed | Replaces DELETE+re-INSERT; closes the orphan bug at the source |

Rejection handling on GRN: `returned_rejected` qty sits in a holding state on the same step. Disposition is a separate call — `rework_in` (goes back to the same step, `rework_cycle + 1`, eligible for a fresh DC) or `scrapped` (leaves the batch, feeds the scrap register — backlog item A3).

### 4.5 The gate, precisely

Every figure below is **net of reversals**: `issued(J,N)` means Σ `issued` − Σ `issue_reversed` at that step, and so on. Reversal rows never appear on their own; they only subtract from the row they point at.

```
completed(J, N)   = returned_accepted(J,N) + internal_done(J,N)         -- units that finished N
consumed(J, N)    = issued(J,N) + internal_done(J,N) − rework_in(J,N)   -- units that entered N
                                                                         -- (rework re-admits units
                                                                         --  that were already counted)
upstream(J, N)    = qty_original(J) − scrapped(J, <N) − converted_out(J, <N)   if N = entry_stage
                  = effective_completed(J, N-1)                                otherwise

eligible(J, N)    = upstream(J, N) − consumed(J, N)                      -- must be ≥ 0 at all times

effective_completed(J, N) = completed(J, N)                              if is_gate(N)
                          = effective_completed(J, N-1) − scrapped(J, N) if NOT is_gate(N)
```

A non-gating stage (`is_gate = false`) is pass-through: it may still record confirmations for the audit trail, but the next stage draws on what arrived at the non-gating stage, not on what was confirmed there.

**The backward invariant.** Every reversal RPC recomputes `eligible(J, k)` for the affected step and every step after it, and **refuses if any of them would go negative**. In plain terms: you cannot un-receive 100 milled units if 60 of them have already been sent for folding. You must first reverse the folding DC (or reduce it), then the milling GRN. The error message names the downstream document that is blocking. This one rule is what makes every edit / cancel / delete path below safe.

### 4.6 Fixing `trg_block_duplicate_dc_issue`

Re-key from `(item_id, reference_id)` to `(dc_line_item_id)`. Two lines for the same item on one DC — two batches going to the same vendor — become legal; posting the same *line* twice stays blocked.

---

## 5. Cutover — what happens to the 334 existing job cards

They cannot be converted; the quantities are wrong by design. Proposal:

1. **Freeze.** Pick a date. Existing job cards are marked `legacy` and become read-only history.
2. **Reconstruct in-flight stock.** For every item with an open DC (`issued` / `partially_returned` — 160 DCs today), the outstanding-at-vendor quantity per stage is known from DC issue − GRN return. Open one legacy job card per (item, stage) with `entry_stage = that stage`, qty = outstanding, reason `"cutover: in flight at vendor on <date>"`. From then on, returns land on the new ledger.
3. **Everything in `free` is treated as raw.** If the store knows some free stock is actually stage-N-complete, they open a job card with `entry_stage = N+1` and the reason "cutover: pre-processed stock". This is honest and auditable — better than guessing.
4. **`pre_bizdocs` steps (1,165 rows)** are dropped with the legacy cards; they carried no quantities.

Dry-run script first (`BEGIN … ROLLBACK`), sign-off, then commit — same discipline as the stock corrections.

---

## 6. Phased delivery

| Phase | Lane | Deliverable | Unblocks |
|---|---|---|---|
| **0 — Route master hygiene** | DB (this session) | Fix null process names; add `process_code_id`, `entry_allowed`, `is_gate`; unique constraint. Client to confirm which stages are entry-allowed. | Everything |
| **1 — Ledger + RPCs** | DB (this session) | **✅ COMPLETE (5 Sep 2026).** `job_card_stage_ledger` (append-only, immutable via trigger, RLS), the four position views, and thirteen functions: forward — `rpc_open_job_card`, `rpc_issue_dc`, `rpc_confirm_internal_step`, `rpc_confirm_grn_store`; backward — `rpc_update_dc_line_qty`, `rpc_cancel_dc`, `rpc_reverse_grn_return`, `rpc_undo_internal_step`, `rpc_dispose_rejected`, `rpc_cancel_job_card`, `rpc_close_job_card_short`; shared — `_jcsl_credit_if_final_stage`, `_jcsl_reverse_qty_fifo`. The `grn_line_items.dc_line_item_id` FK is real and validated (213 pre-existing orphans preserved in `legacy_orphaned_dc_line_item_id`, never discarded); `trg_block_duplicate_dc_issue` re-keyed. All deployed dormant — nothing in the live app calls any of it yet, so Phases 0–1 changed zero live behavior except the FK's `ON DELETE RESTRICT`, which is a strict safety improvement on the existing DC-edit path. Every function was dry-run tested against real production items before commit, including the flagship proof: reversing a milling GRN return while 60 of those units were already sent onward to folding is correctly blocked, and remains blocked even at exactly zero slack after partially undoing the downstream confirmation. **Known gap, not silently papered over:** `rpc_confirm_grn_store` explicitly refuses conversion lines (where the received item differs from the shipped item) rather than guess at their cross-item stock mechanics — see §10.1 item 5. Two real bugs were caught by the dry-run process itself and fixed before any row was ever written: the idempotency index colliding across multiple skipped stages on one job-card open, and that same index blocking legitimate DC quantity edits. | Phase 2, 3 |
| **2 — Cutover** | DB + Vasu sign-off | **✅ COMPLETE (5 Sep 2026).** All 334 pre-cutover job cards marked `legacy = true` (frozen, read-only forever). 161 in-flight batches reconstructed via `rpc_cutover_open_inflight_card` — 153 from properly stage-tagged DC lines, 8 more resolved via specialist-vendor inference cross-checked against `Process_Code_Master.xlsx` (one false-positive caught in that inference and excluded before use). Total 48,292.85 units reconstructed, 0 errors on a clean dry run and 0 on the real commit. The Phase-1 `UNIQUE (job_card_id, step_number) WHERE NOT legacy` index — blocked until this moment by 206 duplicate slots on legacy cards — is now live. **Deliberately deferred, tracked, not lost:** 27 (item, DC) combinations where the vendor is a generalist shop with no unique process match remain on the old system, untouched, pending a physical stock-take from the store team (`Cutover_Stage_Confirmation_Needed.xlsx`, trimmed to these 27). They'll be reconstructed opportunistically whenever the sheet returns or the item next comes up — this does not block Phase 3; the old DC/GRN flow keeps working for these 27 exactly as before. | Phase 3 |
| **3 — UI** | Claude Code | DC form: job card + stage picker with eligible qty; job-card screen: per-stage position; internal-step confirm button; item stage-stock view; Stage 2 QC disposition (rework / scrap). | Users |
| **4 — Loops** | Both | Rework cycles, scrap register (A3), damage disposition (A2), weldment pool accumulation reuses the same ledger with a `pool` batch type. | Weldment, multi-batch, sub-store |

Phases 0 and 1 are safe to build now — nothing calls them until phase 2. The structural DC-edit fix (pending #2) is delivered inside phase 1 rather than as a separate change.

---

## 7. Decisions needed from Vasu

1. **Entry stages — LOCKED (5 Sep 2026).** `entry_allowed = true` for internal stages, `false` for external stages. Grounded in live data: stage 1 is a procurement stage ("BOUGHTOUT", "RAW MATERIAL", etc.) on almost the whole catalog and is satisfied by a PO/GRN, never a DC. Of the 334 live job cards, stage 1 is marked `pre_bizdocs` (already done) on 283, stage 2 on 280, falling to 194 by stage 3 — while **every external stage has a real DC behind it, with zero exceptions found.** No per-item configuration needed.
2. **Non-gating stages — still open.** No evidence yet of a stage the business treats as optional. Default `is_gate = true` everywhere until a specific stage is named.
3. **Rejected units — still open.** Rework vs scrap, chosen at QC or at store-confirm.
4. **Finished output — LOCKED (5 Sep 2026).** Credits to `stock_free`, same as today. Checked live: 100% of the 1,663 job-work DC returns already land in plain `stock_free`; the distinct buckets that exist (`stock_in_fg_ready`, `stock_in_fg_wip`, `stock_in_subassembly_wip`) belong to the AWO/assembly engine for finished sub-assemblies, not to job-worked components — there is no existing precedent to match for a "buildable" bucket. The new stage ledger already gives correct traceability regardless of which bucket the stock sits in; a distinct bucket remains a future AWO-engine enhancement, not a blocker here.
5. **Job card numbering.** Still open.
6. **Cutover date.** Still open.

---

## 8. Trade-offs made explicit

- **Ledger vs stored counters.** Every recurring stock bug in this system has traced to a stored derived value. The stage ledger is append-only; positions are views. Cost: slightly heavier reads. Mitigation: materialised views if the job-card screen gets slow (unlikely below ~100k ledger rows).
- **Redefining `job_cards` vs a new `process_lots` table.** A new table would be cleaner but forces users to learn a new word. Redefining keeps "Job Card" and the JW number; the legacy rows get a flag. Chosen: redefine.
- **Hard gate vs warn.** SAP and Odoo both let you configure "warn only". Proposed: hard gate, with a supervisor-only `skipped` event that requires a reason. Soft gates are how the current mess formed.
- **Not adopting Odoo-style order splitting.** Splitting creates document sprawl and is exactly the "duplicate step rows" pattern already in the data.

## 9. What to revisit as it grows

- Serial-level tracking (`tracking_mode = 'serial'` exists on `job_cards` and is unused). The ledger is quantity-based; serialised batches would add a `job_card_units` table hanging off the same events.
- Multi-item batches (a DC carrying a kit). Currently one batch = one item; kits are handled as parallel batches. Fine for now.
- Vendor-side WIP visibility (what the vendor claims vs what we've issued) — out of scope, but the ledger gives the "issued − returned" figure per vendor for free.

## 10. Self-audit — corrections and backward-path coverage

Reviewed 5 Sep 2026 against the live schema and against every operation that goes backwards. Six problems found in the first draft; all fixed above and summarised here so the fix history is visible.

### 10.1 Mistakes found in the first draft

| # | Problem | Why it mattered | Fix |
|---|---|---|---|
| 1 | Ledger had **no reversal events**. An append-only ledger with only forward events cannot represent a cancelled DC or a deleted GRN without editing history. | The design would have forced the very thing governance forbids: editing ledger rows. | Every forward event has a paired `*_reversed` event carrying `reverses_ledger_id`; a trigger caps total reversals at the original qty. All position figures are net. |
| 2 | Stock credit to `free` was tied to **batch close**, and close was described as automatic. | If a final-stage GRN were deleted after the batch auto-closed, the free credit would have to be clawed back by a separate mechanism nobody would remember to build. | Free credit happens per unit at final-stage completion, on the GRN's own transaction. Batch completion is a view with no stock side-effect. |
| 3 | Real FK on `grn_line_items.dc_line_item_id` with `ON DELETE RESTRICT`. | 120 existing orphan rows — the FK would fail to create, or hard-block Phase 1. | Add `NOT VALID`, backfill via the compound key where unambiguous (the 3 structural orphans stay null and are documented), then `VALIDATE CONSTRAINT`. |
| 4 | `UNIQUE (job_card_id, step_number)` on `job_card_steps`. | 206 duplicate slots on legacy cards — constraint creation fails. | Partial unique index `WHERE NOT legacy`. Legacy rows are frozen and never touched. |
| 5 | **Item conversion mid-route was not modelled.** A raw FRP sheet goes out under one item code and comes back as plates 230196/230197/230272K (this is live today — `item_conversions`, `guard_grn_dc_item_conversion`, the Stage 1 conversion picker from PR #42). "One batch = one item" silently broke this. | Any converting job card could never complete and its output would have no batch. | New event `converted_out(J, N, qty)` on the parent card; the GRN that performs the conversion also opens a child card for the output item with `parent_job_card_id`, `entry_stage` = the output item's next route stage, qty per the conversion ratio. Reversal: `conversion_reversed` on the parent + `entry_reversed` on the child (blocked if the child has consumed anything). |
| 6 | Eligibility formula treated `rework_in` as a bonus and ignored scrap/conversion at the entry stage; non-gate rule was ambiguous when a stage was partly recorded. | Wrong "available to send" figures in exactly the edge cases users hit. | Formula rewritten in §4.5 with explicit `consumed`, `upstream`, `effective_completed`. |

### 10.2 Every backward path, and what the system does

The rule that governs all of these is the backward invariant in §4.5: **no reversal may drive any downstream eligibility negative.** Below, "blocked" always means a loud `RAISE EXCEPTION` naming the blocking document.

| Operation | Ledger effect | Guard | Notes |
|---|---|---|---|
| **DC saved as draft / edited while draft** | None | — | Nothing posts until the DC is issued (approved). Drafts are free to change. |
| **DC issued (approved)** | `issued` per line | eligibility; step external; card open | This is the only moment stock leaves `free → in_process` for a fresh batch, and the only moment `issued` is written. |
| **DC line qty reduced after issue** | `issue_reversed` (partial) | new qty ≥ qty already received on GRNs against that line | In place. Same line id, so GRN links survive. |
| **DC line qty increased after issue** | additional `issued` | eligibility for the extra qty | Same line id. |
| **DC line job card / stage changed after issue** | `issue_reversed` full + `issued` on new target | line has **no GRN receipts**; eligibility at new target | Treated as re-issue, not update, so both cards' histories stay true. |
| **DC line removed after issue** | `issue_reversed` full | line has no GRN receipts | Line row soft-flagged, never deleted. |
| **DC cancelled / deleted** (both existing statuses collapse into one RPC) | `issue_reversed` for outstanding qty on every line | **no GRN receipts on any line** — otherwise delete the GRNs first | Stock: `in_process → free` for the reversed qty (existing `rpc_delete_delivery_challan` mapping kept; `write_off` becomes a `scrapped` event instead). The **DC deletion → job card cascade** question on the backlog is answered by this row: the card is not cancelled, its position simply moves back. |
| **GRN Stage 1 recorded / edit-request approved** | None | — | Stage 1 is quantity verification; stock doesn't post here today and won't. |
| **GRN store-confirm (stock posts)** | `returned_accepted` / `returned_rejected` per line, against the DC line's (card, step) | Σ returns ≤ issued on that DC line (`prevent_dc_over_receipt`, re-keyed) | Final-stage accept also writes `in_process → free` stock row. Conversion lines additionally write `converted_out` + child card `entry`. |
| **GRN Stage 2 accepted/rejected split edited** | `return_reversed` on the old split + new `returned_*` rows | downstream invariant (can't un-accept units already sent onward) | Same transaction, same GRN line id. |
| **GRN deleted / cancelled** | `return_reversed` for all its lines; conversion lines also `conversion_reversed` + child `entry_reversed` | downstream invariant; child card must have consumed nothing | Stock `dc_return` row reversed by compensating entry. DC status (now a view) reverts automatically. |
| **Store-confirm undone** | same as GRN deleted, GRN stays as Stage-2 document | downstream invariant | Rare; approver only. |
| **Rejected units → rework** | `rework_in(J, N)` | qty ≤ un-dispositioned rejected at N | Increments `rework_cycle` on the next DC line for these units. |
| **Rejected units → scrap** | `scrapped(J, N)` | qty ≤ un-dispositioned rejected at N | Stock `in_process → consumed` (write-off). Feeds scrap register (A3). |
| **Disposition undone** | `rework_reversed` / `scrap_reversed` | rework: not yet re-issued; scrap: approver + reason | |
| **Internal step confirmed** | `internal_done` | eligibility; step internal | |
| **Internal step undone** | `internal_undone` | downstream invariant | |
| **Job card opened at stage > 1** | `entry` + one `skipped` per skipped stage | each skipped stage `entry_allowed`; reason mandatory | |
| **Job card cancelled** | `entry_reversed` (+ `skip_reversed`) | ledger contains **only** entry/skip rows (net) — nothing ever issued or confirmed | Stock `in_process → free`. Otherwise use close-short. |
| **Job card closed short** | `released_unprocessed` for the un-started remainder | nothing outstanding at any vendor (issued = returned on every line); reason mandatory | Remainder goes `in_process → free` as raw. Card status becomes `closed_short` (view). |
| **Job card qty change** | not allowed | — | Increase → open another card. Decrease → close short. Keeps "card qty is a fact" true. |
| **Job card entry stage change** | not allowed | — | Cancel (if nothing posted) and reopen. |
| **Route master edited while cards are open** | None on open cards | — | Cards hold a snapshot (`job_card_steps`, `route_version`). New cards get the new route. |
| **Legacy card touched** | blocked | `legacy = true` | Read-only forever. |
| **Same source row posted twice** (double-click, retry) | blocked | `UNIQUE (ref_type, ref_id, event)` | Replaces the purpose of `trg_block_duplicate_dc_issue` for the new ledger; that trigger is re-keyed to the line for the stock ledger. |
| **Two users on the same card simultaneously** | serialised | `pg_advisory_xact_lock` per card; multi-card RPCs (a GRN spanning DCs) lock in sorted id order | Prevents the double-posting class of bug at the root rather than detecting it after. |

### 10.3 What is deliberately *not* reversible

- Ledger rows themselves. Nothing updates or deletes a `job_card_stage_ledger` row, ever. A wrong row is corrected by a reversal row plus a correct row, both signed by a user with a reason.
- Legacy job cards and their steps. Frozen at cutover.
- Cutover `entry` rows. If the store's confirmed count turns out wrong, the correction is a `manual` reversal with reason, visible in the history — same as a stock-take adjustment.

### 10.4 Residual risks after the fixes

- **Store-confirmed count at cutover is only as good as the count.** Mitigation: it is recorded as such and correctable by a visible manual entry.
- **Users may want to skip the gate "just this once".** Mitigation: `skipped` exists for stages flagged `entry_allowed`; for any other stage there is no bypass. Decision 2 in §7 (which stages are non-gating) is the release valve — get it right with the client rather than adding a supervisor override.
- **Performance of position views** on the job-card screen once the ledger passes a few hundred thousand rows. Mitigation: materialise `v_job_card_stage_position` if needed; nothing in the design depends on it being a live view.

## 11. References

- SAP PP external processing (control key `PP02`, subcontract PR → PO, `541` transfer, GR auto-confirms the operation as `EODL`): community.sap.com threads on operation subcontracting.
- ERPNext Subcontracting (partial subcontracting orders with auto-calculated remaining qty; raw-material reservation in v16) and Job Card / Work Order (progressive completed qty, multiple stock entries per work order): docs.erpnext.com.
- Odoo MRP backorders (MO-001 / MO-002 split) and BOM operation dependencies ("Waiting for another WO"): odoo.com documentation and forum.
- Internal: `STOCK_LIFECYCLE_GOVERNANCE.md` §3.1 (destructive DC edits), §3.3 (ledger noise); `SUBSTORE_ARCHITECTURE.md` (sixth bucket — compatible with this ledger).
