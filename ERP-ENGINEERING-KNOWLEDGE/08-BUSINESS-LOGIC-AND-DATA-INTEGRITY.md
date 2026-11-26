# 08 — Business Logic and Data Integrity

## 1. Rules

| Rule | Standard | Enforcement | Test | Origin |
|---|---|---|---|---|
| R-BL-01 | **Ledger first.** Every quantity-affecting event posts through one posting function owned by Inventory. Documents never update balances. | revoke direct writes; posting function is the only grantee | T-INV-01 | F-001, F-012..016 |
| R-BL-02 | **Reverse path with every forward path.** A document type is not done until edit, cancel, delete (draft) and reversal (posted) are implemented and pass a net-zero test — or the path is explicitly declared irreversible (e.g. after period close) with the reason and the correction route recorded in the module spec. | gate G-04 checklist | T-BL-01 | F-038 |
| R-BL-03 | **One consumption event per physical movement.** Decide, per flow, which document records goods leaving/entering (e.g. dispatch, not invoice). All others are informational. | ADR per flow; reconciliation view = 0 | T-INV-07 | F-018 |
| R-BL-04 | **Status is derived.** Progress status (received, issued, completed, closed) is computed from events by the DB; clients never write it. Human decisions (approve, hold, cancel) are recorded as events through operations, never by writing the status column. | revoke UPDATE on status columns; trigger/view | T-MFG-04 | F-021, 024 |
| R-BL-05 | **No auto-commit heuristics.** Fuzzy matches, "first open card", auto-ticks may pre-fill or suggest; the commit needs an exact key or an explicit user choice. | code review | T-BL-05 | F-006, 024 |
| R-BL-06 | **Fail loud on ambiguity.** A lookup that can match more than one record raises with the candidates listed. | function code | T-BL-05 | F-006, 011 |
| R-BL-07 | **Model validated before UI.** Every flow is walked end to end, forward and reverse, with realistic data, on paper or in SQL, before screens are built. | gate G-02 evidence | T-SIM-01 | F-023, 027, 040 |
| R-BL-08 | **Gate policy is a business rule.** Whether a check blocks or warns is decided by the business owner, recorded in the business-rules register with ID and date, and implemented as a setting. | BR register | T-BL-06 | F-017, 026 |
| R-BL-09 | **Reversal nets prior compensation.** Before reversing a document, find manual adjustments already made for it; reversal = document effect − compensation. | reversal function checks reference links | T-BL-07 | governance §3.5 |
| R-BL-10 | **Consumption respects state.** Material may be consumed only from states permitted for the consuming document (e.g. finished per route for assembly). Unknown state = not permitted (fail safe). | posting function guard | T-MFG-05 | F-040 |
| R-BL-11 | **Primary unit for stock.** All stock arithmetic in the item's primary unit; alternate quantities are captured as measured, never converted into stock by a factor unless the business defines one. | posting function accepts primary only | T-UOM-01 | F-027 |

## 2. Document lifecycle template

Every document type defines, before coding:

| Element | Content |
|---|---|
| States | e.g. `draft → pending_approval → approved → posted → (partially_fulfilled) → closed`, plus `cancelled` |
| Allowed transitions | from → to, who (role), guard conditions, side effects (postings) |
| Editable fields per state | e.g. after `posted`, only notes/vehicle fields |
| Edit after posting | forbidden, or "revert to draft → edit → re-post" with DB netting the difference |
| Partial fulfilment | how remaining quantity is computed (live), when the document closes |
| Cancellation | which postings are reversed, what happens to downstream documents |
| Numbering | series, when assigned (at insert or at posting) |
| Printing | which states may print; "DRAFT" watermark |

Implement the transition table in the DB (function per transition or a trigger validating from→to).

## 3. Approvals

- Approval is a transition guarded by role and, if needed, amount thresholds from settings.
- Separation of duties: creator cannot approve their own document when the business requires it (setting).
- Approval history is append-only (who, when, decision, comment).
- Editing an approved document returns it to approval if it changes quantities, prices, parties or items (rule from discovery).

## 4. Partial fulfilment, returns, corrections

| Case | Rule |
|---|---|
| Partial receipt | Each receipt line posts its own quantity; remaining = ordered − Σ accepted (live). Over-receipt ceiling in the DB with tolerance from settings |
| Partial issue | Issue requests accumulate toward a target; each issue posts once (idempotency key = request line + sequence) |
| Returns to vendor | Post from the state the units are in (e.g. rejected-hold), linked to the receipt line they failed on |
| Rejects | Held in a distinct state until disposition (rework/return/scrap); written off only on scrap |
| Corrections | Compensating posting with reason code and reference; never edit the original |
| Physical count | Count → investigate → approved adjustment; adjustment references the count |

## 5. Backdated transactions and period closure

- Every posting has a business date. Backdating allowed only within an open period and up to a limit from settings.
- Period close locks postings with business date ≤ close date; corrections go into the next open period with a reference.
- Position "as of date" is computed from the ledger ordered by business date then sequence; reports state which ordering they use (BizDocs ordered by `created_at` for audit positions — choose deliberately).

## 6. Inter-module dependencies

Draw the dependency matrix (`NEW-ERP-STARTER-KIT/DEPENDENCY-MATRIX.md`) for every document: what it reads, what it posts, which documents reference it, what breaks if it is edited/cancelled. Review the matrix for every change touching a document (this is BizDocs governance rule "trace both directions").

## 7. Preventing bypass

Users and integrations cannot bypass rules if: rules are in DB functions; app roles have no direct INSERT/UPDATE on ledger, balance and status columns; every privileged function checks role; imports call the same operations as the UI; scripts used for corrections call the same posting function with a correction reason.

## 8. Inventory and manufacturing integrity (apply where the capability exists)

| Capability | Safeguards |
|---|---|
| Stock movements | single posting function; from/to state; reference to source line; idempotency key; per-item lock |
| Available vs physical | available = physical − reserved − held (computed); reservations are rows with release rules |
| Material consumption | from permitted state only (R-BL-10); cumulative issue caps; returns capped at issued − returned − damaged |
| Production output | output posting in the same transaction as consumption; quantities validated against order |
| WIP / operations | operation ledger: issued / returned / accepted / rejected / scrapped per (batch, operation); eligibility = completed previous operation − already sent |
| Scrap and wastage | explicit state; reason codes; scrap register derived from ledger |
| Transfers | two-legged posting in one transaction (out of A, into B) |
| Adjustments | approval, reason, reference to count |
| Batch / lot / serial | identity unique per item; serial lifecycle states; serial tracking never posts stock by itself |
| Units and conversions | primary unit for stock; conversions only by defined factor with effective date, or by recording actuals |
| Subcontracting | outward to "at processor" state; return credits once; item transformation via explicit mapping; processor charges separate from stock |
| BOM and revisions | revision with effective date; work orders snapshot the BOM revision used (legitimate snapshot, labelled) |
| Planning | planned quantities never post stock |
| Quality control | inspection result drives disposition; rejected units held, not free |
| Costing and valuation | method chosen at discovery (standard, moving average, FIFO); valuation computed from ledger; cost changes never rewrite history |

## 9. Financial integrity (where applicable)

- Money in fixed-precision types; currency per document; exchange rate snapshot at document date (legitimate snapshot).
- Tax computed per line by one function; rounding rule (per line vs per document) from requirements; totals = Σ lines (checked).
- Partial payments and outstanding balances computed from payment allocations, never stored as editable fields.
- Credit/debit notes reference the original document; they never edit it.
- **Operational ERP vs accounting system:** unless the customer explicitly requires a general ledger, the ERP produces operational documents and exports (invoices, receipts, stock valuation) to the customer's accounting system. Building double-entry accounting is a separate, large scope with statutory requirements — decide at G-01.
