# PROGRESS.md — BizDocs V2

Status, backlog, and blockers. The agent reads this only when a task needs context. Operating rules live in `CLAUDE.md`.

_Last updated: 03 Jul 2026_

---

## 🔴 Active queue (current focus)

| # | Item | State | Next step |
|---|---|---|---|
| 1 | **Dual-UOM feature (5 commits)** | Built, **local-only, UNTESTED**, not pushed | Test end-to-end on a clean dual-UOM line (NOT GRN-613 — corrupted), verify stock posts primary correctly, then push |
| 2 | **Opening Stock display — reorder column** | Data correct; screen doesn't show it | Add a "Reorder Level"/min column to Opening Stock reading `min_stock` (UI change, Claude Code) |
| 3 | **Page redesign — primary/alt basis toggle** | Spec'd, not built | Design pass: toggle across inward/QC/store (buildable); "stock holds both units" is a separate stock-model question — do NOT bundle as a UI tweak |

---

## ⛔ Blocked (need info, not effort)

| Item | Blocker |
|---|---|
| **452 broken DC lines + GRN-1007** | DC lines have `quantity_2` but `unit_2 = null`. Backfill needs the correct unit per line — **unknown**. Ask the team what the job-work alt quantities are measured in (likely NOS, unconfirmed). GRNs are frozen snapshots — editing the DC does NOT heal existing GRNs; needs direct `grn_line_items.unit_2` backfill. |
| **Dual-UOM stock model** ("stock possesses both qty+unit") | Needs a decision: does stock need to *transact* in both units (full dual-balance architecture + conversion factor) or just *display* both (reference)? No reliable NOS↔KG conversion exists in the data. Design pass required before any build. |

---

## 🟢 Shipped this session (02–03 Jul)

**Pushed to prod & verified:**
- **GRN numbering crash fixed** — `LPAD((v_max+1), 3)` was *truncating* 1000→100 (not padding), colliding with existing `/100`. Fixed `generate_doc_number` to `LPAD(..., GREATEST(pad_width, length(...)))`. Pure SQL. Fixes ALL doc types at the 999→1000 boundary. GRN creation confirmed working past /1000.
- **Inward Receipt Queue search** (895dd02) — GRN#/PO#/vendor/serial search on `/storekeeper-queue`, server-side. Empty = same list (inert-default).
- **Pending Final Receipt** (66d9226) — non-final `quality_done` GRNs relabeled/grouped so they stop looking like store work. Register badge + filter pill; `/grn-queue` pending split.
- **Receiving Queue button** (1ba225d) — GRN Register header → `/grn-queue`.
- **Calendar pickers** (e0cc540) — click-to-pick From/To on `/grn-queue` Confirmed date range.
- **gitignore supabase/.temp** (2c817cd).

**Done in Supabase (SQL only, no deploy):**
- **2 unposted DC-return stock lines** (GRN-508, GRN-532) — ledger-confirmed unposted; posted via real `creditPartialStock` path (dev-shim, faithful reuse), DC semantics. Ledger rows effd374a / b07c0a61.
- **3 orphan PO alt-qty rows cleaned** (`quantity_2` with no `unit_2`, never used).
- **Reorder levels loaded from STOCK_GUIDLINE.xls** — 31 sub-assemblies set to guideline values in `min_stock`(reorder) + `aimed_stock`(aimed). 12 corrected, 19 already right, 2 non-guideline P/S Shaft items untouched. Reorder alarms now accurate (they read `min_stock`).

**Investigated & closed (no action needed):**
- **13 "draft" GRNs** — abandoned zero-qty shells, not stuck.
- **336 `quality_done` GRNs** — not stuck; non-final receipts correctly terminal, stock already posted at QC. Resolved by the Pending Final Receipt relabel.

---

## 📋 Dual-UOM feature — the 5 unpushed commits

| commit | slice | what |
|---|---|---|
| dcc68a0 | 1 | PO form persists `unit_2` when `quantity_2` entered |
| 38c3db2 | 1b | DC form persists `unit_2` (same bug as PO) |
| adc4337 | 2 | Inward create: dual-capture (KG + NOS independent inputs), never zeroes primary |
| 66c8ca8 | 3 | QC: primary-NOS input for alt lines → `conforming_qty` + primary received; friendly over-receipt msg; `accepted_qty_2` null-guarded |
| 4ff5f69 | 4 | Store screen: read-only "Received: X KG" alt reference (no writes) |

**Design decided:** capture both measures as independent human-entered values, NO app derivation between them. Stock posts **primary** via existing unchanged path. Alt saved for audit. GRNDetail Stage-1 edit already dual-captures (verified) — untouched.

**Not done:** runtime test. Build-clean ≠ tested. The `receiving_now→received_quantity` recompute and over-receipt trigger are only verifiable at runtime. Test before push.

---

## 🔑 Key data facts (discovered this session)

- **Reorder alarms read raw `min_stock`.** `min_stock_override` is dead (no UI sets it, no alarm reads it). `aimed_stock` = reorder-to target, not a trigger. Opening Stock screen reads `aimed_stock` only.
- **Dual-UOM lives on DCs, not POs.** PO: 6 alt lines (3 missing unit). DC: 584 alt lines, **452 missing unit** — the real dual-UOM volume (job-work).
- **Primary/alt direction varies per item.** Some sub-assemblies stocked in NOS (weight=alt); others in KGS (pieces=alt). No universal rule; no conversion factor anywhere.
- **`createGrnFromDC` snapshots** `unit_2`/`ordered_qty_2` at creation — frozen. `updateDeliveryChallan` deletes+re-inserts DC lines with new UUIDs, so `grn_line_items.dc_line_item_id` dangles after a DC edit. **Editing a DC does NOT propagate to existing GRNs** (snapshot-staleness class).
- **Stock is single-unit per item** (`items.unit`, one bucket set, one ledger, no conversion). Dual-unit stock = architecture change.

---

## 🟡 Backlog (unblocked, buildable)

- QC dispositions A2 (store-confirm damage), A3 (unified register). A1 shipped.
- Weekly email upgrades — vendor contact details + flexible scheduling.
- Sidebar reorganization.
- Weldment mapping — 60–70% buildable; build math blocked on client qty-per sheet.
- **Store stock reconciliation** — verify item buckets = ledger sums; every accepted GRN line has a ledger row; no phantom/double posts. (Discovery-first; scope to sub-assemblies or GRN-active items initially.)

## ⚪ Small follow-ups (don't lose)

- **Why did GRN-508/532 skip QC posting?** Likely `item_id` linked after QC ran → QC saw null, skipped. Check for a recurring silent-skip class.
- **GRN-613 duplicate line** — same `po_line_item_id` in two rows. Corrupted; not a valid test case. Investigate/clean.
- **Retire `min_stock_override`** — 33 stray values, nothing reads them for alarms. Eventual cleanup.
- **Stale GRNForm comments** (`prev_accepted_2` unused after Slice 2) — tiny cleanup.
- **Windows installer CI (b8440e9)** — pushed to main; owned by Vasu, not our thread.

---

## 📌 Live-DB artifacts to re-verify (don't assume current)
- `generate_doc_number` — **fixed** this session (GREATEST pad).
- `recompute_po_line_received_quantity` — live, not in migrations.
- `trg_grn_stage_update` — **disabled** (do NOT re-enable — double-posts stock).
- `clear_all_company_data()` — live RPC.
