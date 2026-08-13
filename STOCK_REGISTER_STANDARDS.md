# BizDocs V2 — Stock Register, Inventory Ledger & Closing Stock Standards

**Status:** Authoritative companion to `STOCK_LIFECYCLE_GOVERNANCE.md`. That document governs how stock *moves*; this one governs how stock is *recorded, rounded, and reported* — the Stock Register, the Inventory/Stock Ledger, and Closing Stock. Same amendment rule: reality and this document move together.

**Frame:** BizDocs is a perpetual-inventory system. Industry-standard perpetual inventory means every movement — receive, issue, transfer, return, adjust, consume, dispatch — posts an event to the ledger at the moment it happens, and the registers are *projections* of that event stream, never independent books. The ERP is a tracking system for every item that enters its vicinity: from the moment a PO is raised, through processing, sub-assembly, WIP, finished goods, and out the door, each step is captured as exactly one truthful event.

---

## 1. The Three Surfaces and What Each Is Allowed to Be

There are exactly three reporting surfaces, with a strict hierarchy:

**1. The Stock Ledger (Inventory Register)** — the event stream. Append-only history of every movement, one row per transition, with `transaction_type`, `from_state`, `to_state`, quantity in primary UOM, date, reference, and actor. This is the *source of truth for history*.

**2. The Stock Register** — the current position. Per-item bucket balances (`stock_free` and the WIP buckets), reorder context, alert levels. This is a *cache of the ledger's net effect*, maintained by the ledger RPC stack. It answers "where is everything right now."

**3. Closing Stock** — the reporting figure. `stock_free` only, per item, per the established decision. It answers "what do we own, usable, in the store."

Rules that keep them straight:

1. **One-way derivation.** Ledger → Register → Closing Stock. Nothing flows backward. No report may compute its own alternative balance, apply its own corrections, or "fix" a number at display time. If a register figure looks wrong, the fix happens at the ledger/RPC layer, never in the report query.
2. **The reconciliation identity must always hold per item, per bucket:**
   `opening + Σ(in-transitions) − Σ(out-transitions) = current bucket balance`
   This is the standard perpetual-inventory closing equation. Divergence between the ledger-implied balance and the bucket column is a defect to be diagnosed (see §5 for the one known systemic exception), never something to paper over in a report.
3. **Registers display; they never transact.** The only math a register/report may do is grouping, filtering, formatting, and summation of ledger/bucket values. Any business math (shortage, pending, effective stock) lives in one named place — a view or RPC (e.g., the `stock_alerts` view computing effective stock live from `stock_free`) — never duplicated per-page.
4. **Completeness over convenience.** No register may silently truncate. Every list query paginates (`.range()` / batched scoped fetches) with a loud abort guard. A register showing 1,000 of 1,300 rows without saying so is corrupt output, indistinguishable from missing stock.
5. **WIP visibility without WIP inclusion.** The Stock Register may *show* WIP buckets as columns for tracking (that is the whole point of staged movement), but Closing Stock and stock-position math include `stock_free` only. Never blend them, in UI or Excel export.
6. **Alert effective-stock has one owner: the live `stock_alerts` view.** Verified live: `effective_stock = COALESCE(stock_free, 0)`, alerting when below `min_stock` (excluding services/inactive items). An earlier design discussion (April 2026) proposed effective stock = all in-custody buckets summed; the shipped view superseded that with free-only. If the definition is ever to change back, it changes **in the view**, deliberately, with sign-off — never as report-level math, and no agent may "restore" the all-buckets definition on the strength of the old conversation.

---

## 2. Rounding and Precision Principles

The industry rule is simple: **precision is a property of the item and its UOM, decided once, enforced everywhere; the ledger stores full precision; rounding happens only at display.** Rounding inside calculations is how "decimal dust" accumulates into real drift.

1. **Storage precision:** all quantities are `numeric(15,3)`. Three decimals is the storage ceiling and the calculation precision. Never store at lower precision than the column; never let a client round before writing.
2. **Per-item quantity precision, driven by the primary UOM:**
   - **Discrete units (NOS, PCS, SET, EA):** whole numbers only, as a **forward-looking entry rule**. A fractional quantity of a countable item is invalid input, not a rounding candidate — reject loudly at entry (the standard "generate an error, don't auto-round" posture for discrete items). There is no such thing as 3.5 gear boxes.
     *Live-data caveat (verified Aug 2026): 113 active NOS items currently carry fractional `stock_free` balances — legacy of weight-based receipts, partial-issue math, and the opening-stock bug. These are a reconciliation class, not auto-round targets: never mass-round them, never let this rule block reading/reporting them, and enforcement at entry begins only after this class is reviewed in its own session.*
   - **Measured units (KGS, MTR, LTR, SQM):** up to 3 decimals, entered as measured. No forced rounding at entry.
3. **The ledger never rounds.** Ledger rows record the exact transacted quantity. Compensating/reversal entries use the exact original quantity, never a re-rounded one — a reversal that rounds differently from its original leaves permanent residue.
4. **Round once, at the end, at display.** Reports and prints may format (e.g., trim trailing zeros, show 2 decimals for weights on a print), but every subtotal and total is computed on full-precision values and rounded only for presentation. Never sum rounded values.
5. **No intermediate rounding in chains.** Alt↔primary relationships, BOM explosions (qty-per × build qty), and cumulative-issue math run at full precision end to end. Only a final *entered/confirmed* quantity — a human-validated number — becomes the transacted figure.
6. **Alternate UOM is captured, never converted-and-rounded into stock.** The existing UOM rule already prevents the classic conversion-drift problem: primary is transacted as entered; alternate is recorded as measured; no computed conversion ever becomes the stock figure. Keep it that way — do not introduce conversion factors that generate primary from alternate.
7. **Decimal-dust hygiene:** a bucket balance within ±0.001 of zero for a measured-UOM item after legitimate full consumption may be zeroed via `manual_adjustment` in a reconciliation session — never automatically, never silently, and never for discrete items (where any nonzero residue is a real bug).
8. **Threshold comparisons use exact values.** Over-receipt ceilings, issue caps (`issued − returned − damage`), and non-negative checks compare full-precision numerics. No epsilon-fudging in guards; if precision handling is ever genuinely needed in a guard, it is explicit and documented, not a hidden tolerance.

---

## 3. Traceability: Every Row Answers Six Questions

The register is only "neat" if every line explains itself. Each ledger row must answer, without a human going hunting:

**What** (item, primary qty, UOM) · **When** (transaction date) · **Which movement** (transaction_type) · **From where to where** (from_state → to_state, both populated) · **Because of what** (reference_type + reference_id pointing at the source document) · **By whom** (actor/audit stamp).

Rules:

1. **Every ledger row links to its source document.** `dc_issue` → the DC; `grn_receipt`/`dc_return` → the GRN line; `assembly_*` → the AWO/MIR; `invoice_dispatch` → the invoice; `manual_adjustment` → a stated reason and reference (`item_merge`, reconciliation session, etc.). An unreferenced movement is an audit failure.
2. **The document chain is the traceability spine.** PO → GRN → store confirmation → DC → Job Card (stages) → DC-return GRN → MIR → AWO → FG → Invoice → Dispatch. Each link is an FK that must survive edits (no destructive DELETE+re-INSERT severing it — §3.1 of the governance doc). An item's full biography must be reconstructible by walking the ledger rows and their references in date order.
3. **One event, one row.** A physical movement posts exactly one ledger row (per line item). Never two rows for one movement (the double-posting incidents), never zero (the GRN-245 class), never a summary row replacing detail rows.
4. **Display translation, not data mutation.** Historical legacy state labels (`in_subassembly_wip`, `wip`, `stock_free`-as-state) are aliased at display via `STATE_LABELS` and treated as aliases in reconciliation queries. The historical rows themselves are never rewritten to canonical labels — append-only means the past stays as written.
5. **The register reads well to a storekeeper.** Latha and Priyanka should be able to open an item's ledger and read its story: came in on GRN-x, went to vendor on DC-y, came back, issued to SA-WO-z, consumed, output produced. If a flow generates rows a storekeeper can't narrate, the flow's reference data is inadequate.

---

## 4. Physical Verification Anchors the Book

Perpetual inventory does not eliminate physical counting; it changes its role. Counts stop being the source of truth and become the *calibration* of the book.

1. **Cycle counts over shutdown counts.** Small, targeted counts validate the register continuously. Priority by value/velocity and by *known variance history* — in this system that means the flagged items (f2df02c0, 230237, the SA-WO gear boxes, the V-family) count first.
2. **Count → investigate → then adjust.** A variance is first diagnosed against the ledger (was it the opening-stock append pattern? a missed posting? a real physical loss?) before any `manual_adjustment` posts. The adjustment row states the count date and reason. Never adjust to match a count without understanding which side is wrong.
3. **A physical count gates every high-stakes reversal.** Established rule from the +4 lesson: before reversing documents where a manual compensation may already exist, the physical count is the tiebreaker, not the ledger SUM and not the bucket alone.

---

## 5. Known Noise and How the Registers Treat It (Until Fixed)

Honesty layer — the registers must be clean about what is currently *not* clean:

1. **Opening-stock append bug (systemic, open):** for affected items the ledger SUM is inflated; `stock_free` is the more reliable figure. Until root-caused and remediated, no report may present ledger SUM as authoritative for items with multiple opening-stock rows, and no reconciliation may treat SUM-vs-bucket divergence on such items as proof of drift.
2. **Legacy NULL-state rows** (early `opening_stock`, `dc_return`, `manual_adjustment`): excluded from state-transition analytics, included in quantity totals. Never backfill states onto them by guess.
3. **Parked anomalies** (governance doc §7) surface in registers as-is. Registers do not hide them, annotate them, or auto-correct them.

The end state this document points at: every one of these resolved through its dedicated session, after which the reconciliation identity in §1 holds exactly, for every item, with zero exceptions — and stays that way because every new write path is built to these standards.

---

## 6. Pre-Merge Checklist for Any Change Touching a Register or Report

Before shipping any change to the Stock Register, Stock Ledger page, Closing Stock, exports, or any stock-displaying surface:

1. Does it read `stock_free` only for closing stock, and via the single named source for any derived figure?
2. Does it paginate completely, with a loud guard on truncation?
3. Does it round only at display, summing full-precision values?
4. Does it treat legacy state labels as aliases and never mutate history?
5. Does every displayed movement still link back to its source document after the change?
6. Does the reconciliation identity still hold on a dry-run of the most common end-to-end workflow (not just the changed case)?
7. Is the change display-only, or did business math leak into the presentation layer? If it leaked — move it down.
