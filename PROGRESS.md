# PROGRESS.md — BizDocs V2

Status, backlog, and blockers. The agent reads this only when a task needs context. Operating rules live in `CLAUDE.md`.

_Last updated: 30 Jun 2026_

---

## 🔴 Active queue (current focus)
Tackle in this order — each starts with its own Step-0 discovery query before any write.

| # | Item | What | First Step-0 check |
|---|---|---|---|
| 1 | **Draft GRNs stuck** | Stage 1 (qty) + Stage 2 (QC) both complete but GRN stays in `draft`. Many sitting in draft. | Status distribution of stuck GRNs + their stage states; confirm `trg_grn_stage_update` (disabled) is the gap. |
| 2 | **Reorder data refresh** | Load new Aimed / Min(Reorder) levels from `STOCK_GUIDLINE.xls` (31 sub-assy codes). | Pull current items-master values for the 31 codes; confirm which column the reorder *alert* reads; resolve 31-vs-33 count delta. |
| 3 | **Opening stock not reflecting items master** | Values set in items master must seed the opening-stock screen so storekeepers can see/edit them there. | How opening stock is sourced (separate table vs read-through vs snapshot). |
| 4 | **Inward receipt — GRN-number selector** | Select/search a receipt by **GRN number** (primary) with **PO number** as secondary. GRN ≠ separate register; it's the GRN itself. | How the inward receipt page currently filters/identifies receipts; is GRN no. unique/indexed per company. |
| 5 | **Batch DC (multi-batch)** | Same item → same process across multiple DCs must be allowed and tracked **cumulatively**, not blocked. Structurally similar to weldment pool accumulation. | DC-line uniqueness constraints that currently block the second DC. |

---

## ⛔ Pre-launch blockers
| Item | State |
|---|---|
| **PO qty propagation** | GRN ordered-qty snapshots don't refresh when PO quantities are edited. Migration written (`fn_propagate_po_qty_to_open_grns()`, targets `draft` + `quantitative_pending`, `GREATEST(NEW.quantity, received_qty)` clamp + status reflow). **Pending manual apply** in Supabase SQL Editor. |
| **DC-delete → Job Card cascade** | If a DC is deleted after a Job Card was raised from it, verify the Job Card is cancelled/handled gracefully. **Needs investigation** — check cascade logic / triggers / soft-delete in the DC delete flow before go-live. |

---

## 🟡 Backlog — buildable now (no client dependency)
- **Weldment mapping** — 60–70% buildable; build math + cost rollup blocked on client qty-per-component sheet.
- **QC dispositions A2** (store-confirm damage) **and A3** (unified register). A1 shipped.
- **Reorder alarms** — pairs with active item #2.
- **Sidebar reorganization** — proposed grouping: Dashboard · Procurement · Inward & QC · Production & Job Work · Inventory & Stores · Dispatch · Finance & Compliance · Masters & Setup.
- **Weekly email upgrades** — flexible scheduling + vendor contact details on all three sheets.

---

## ⚪ Awaiting client deliverables
All five unlock from just **two** client inputs: the **qty-per mapping sheet** and the **Service Issue / FG access definitions**.

- Weldment build math + cost rollup → needs qty-per mapping sheet.
- Service Issue (feature #3) and FG access (feature #5) → parked pending business definition. **Do not build on these until settled.**
- BOM discrepancy details.
- Physical count (client-run).

---

## 🟢 Shipped to production
- **Final GRN checkbox** extended to DC-return lines (Option B: always present, unticked by default, user-controlled). Merged `ccdcca8`.
- **Sub-assembly stock targets** bulk-loaded (aimed/min/reorder). Note: `min_stock` vs `min_stock_override` field-mapping mismatch needed a second pass — watch this on the next reorder load (active item #2).
- **QC A1 disposition** — rejects → `disposal_method`, ledger legs, scrap register, vendor notification.
- **Clear All Account Data** (Settings → Danger Zone) — `clear_all_company_data()` RPC; deletes all transactional data + masters; preserves company profile + users; requires typing company name; irreversible.

---

## 📌 Known live-DB artifacts
Re-discover from live before relying on any of these — do not trust this list as current.
- `recompute_po_line_received_quantity` — live, not in migrations.
- `trg_grn_stage_update` — **disabled** (prime suspect for active item #1).
- `clear_all_company_data()` — live RPC.
