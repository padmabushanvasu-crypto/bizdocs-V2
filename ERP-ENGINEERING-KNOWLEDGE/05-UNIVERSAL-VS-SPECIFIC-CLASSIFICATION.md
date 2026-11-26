# 05 — Universal vs Specific Classification

Purpose: stop a new ERP from inheriting BizDocs assumptions. Every pattern, rule and feature below is placed in one category with the reason and the treatment a new project must give it.

| Cat | Meaning | Treatment in a new ERP |
|---|---|---|
| A | Universal ERP engineering principle | Adopt as a mandatory rule |
| B | Reusable architectural pattern | Adopt only after validating fit (record an ADR) |
| C | Configurable business capability | Build only if discovery shows the need; behaviour set by requirements |
| D | Industry-specific requirement | Do not carry over; rediscover for the new industry |
| E | Company-specific requirement | Never carry over |
| F | Legacy decision / technical debt | Do not inherit; redesign if the need exists |

## Category A — Universal principles

| Item | Why universal | New-ERP treatment |
|---|---|---|
| Append-only movement ledger; corrections are compensating entries | Audit, reconstruction and dispute resolution need immutable history in any ERP | Mandatory (R-DB-11) |
| Single writer for every derived value; DB maintains caches | F-012..016: two writers always diverge eventually | Mandatory (R-DB-01) |
| One DB transaction per business operation | Partial writes are unrecoverable inconsistency in any domain | Mandatory (R-DB-02) |
| Fail loud; no silent clamps or swallowed errors | Silent drift is the most expensive defect class | Mandatory (R-DB-04) |
| Document numbers generated in DB under lock, unique-indexed | Legal/fiscal documents must be unique everywhere | Mandatory (R-DB-03) |
| Edit in place; preserve references | Any document with downstream documents | Mandatory (R-DB-05) |
| Every forward transition has a designed reverse path | Every ERP has edit/cancel/delete/return | Mandatory (R-BL-02) |
| Idempotent posting (repeat submit = no-op) | Double clicks, retries and reconnects exist everywhere | Mandatory (R-DB-10) |
| Server-side authorization; tenant isolation on every table | UI restrictions are not security | Mandatory (R-SEC-01/02) |
| Status derived from events, not written by clients | Removes a whole class of desync | Mandatory (R-BL-04) |
| Exact quantity precision; round only at display | Arithmetic drift is universal | Mandatory (R-DB-14) |
| Schema-as-code; environment rebuildable from the repo | Disaster recovery and second deployments | Mandatory (R-DB-09) |
| Data migrations idempotent with a recorded baseline | Every ERP has a go-live import | Mandatory (R-MIG-01) |
| Physical count calibrates the book, it does not replace it | Applies to any perpetual inventory | Mandatory where inventory exists |

## Category B — Reusable patterns (validate fit first)

| Pattern | BizDocs form | Fit conditions |
|---|---|---|
| Stock buckets as ledger-maintained cache per item | `stock_free`, `stock_in_process`, WIP buckets | Good when locations/states are few and fixed. For many warehouses/bins/lots, use a position table keyed by (item, location, lot, state) instead of columns |
| Single-row transition ledger (`from_state`, `to_state`) | `stock_ledger` | Good for state-based inventory. If a full accounting GL is required, keep this as the operational ledger and post to GL separately |
| Stage/operation ledger beside the stock ledger | job-card stage ledger | Needed when material passes through routed operations (internal or subcontracted) and partial batches move |
| GRN as staged receipt (inward → QC → store) | three gates | Fits where incoming QC exists; collapse to one step where it does not |
| Item-level advisory locks for stock postings | `pg_advisory_xact_lock(hash(item))` | Postgres-specific; equivalent row locks elsewhere |
| Drift / invariant views that must return zero | `v_dc_ledger_drift`, `v_dispatch_ledger_check` | Universal idea; implementation per schema |
| "Held on receipt document" material that is drawn by the next document | GRN-held | Fits only where received material often skips the store; otherwise unnecessary complexity |
| Like-for-like / conversion mappings on receipt | `item_conversions` | Fits subcontracting that transforms items |
| Count-approval workflow for adjustments | Physical Count | Common; approval roles are company-specific |

## Category C — Configurable business capabilities

Build only if discovery confirms; parameters from requirements.

Dual units of measure per item · purchase over-receipt tolerance · partial receipts and partial issues · subcontract/job-work DCs with returnable tracking · BOM with alternates · work orders (sub-assembly / finished good) · scrap and rework dispositions · reorder levels and alerts · serial-number tracking per unit · dispatch records separate from invoices · document approvals and who approves · print layouts · weekly e-mail digests · foreign-currency documents · processor invoice vs estimate · jig/tool custody.

## Category D — Industry-specific (do not carry over)

| Item | Why industry-specific |
|---|---|
| Electrical-equipment assembly structure (front plates, phase boards, vacuum bottles, voltage-class variants) | Product-specific |
| Specific processing routes (turning, milling, drilling, plating, anodising, welding) and their order | Depends on the products made |
| Weldment "three parts out, one assembly back" receipt | Arises from outsourced fabrication practice |
| Tube/rod cutting lists and raw-material-to-part conversion recorded after the fact | Machining-shop practice; another industry may convert by recipe with yields |
| Inward QC as the job-card QC step | Plant practice |
| FAT certificates | Specific test regime |

## Category E — Company-specific (never carry over)

Item codes and drawing-number conventions (`<code>-01` raw material), roles and who may approve counts, staff workflows, the decision that sub-assembly issue may go negative, the decision that mid-route returns never go to store, posting a mid-route line to store being allowed "as team practice", GST/state codes for one state, financial-year format, document prefixes, print layouts (15 items per A4), naming ("Inward Receipt Queue"), the mid-September reconciliation baseline, reorder levels from one guideline sheet.

## Category F — Legacy and debt (do not inherit)

| Item | Why debt | Replacement |
|---|---|---|
| Per-module client-side stock posting | F-012..016 | DB posting function only |
| Bucket columns maintained by deltas (WIP) | Drift | Ledger-maintained or computed |
| Stored running `balance_qty` | F-019 | Window function at read, or ledger sequence per item |
| `is_final_grn` dual meaning | F-021 | Separate fields: `is_last_delivery`, route position |
| Legacy near-duplicate columns (`accepted_quantity` / `accepted_qty`, `rejected_quantity` / `rejected_qty`) | F-022 | One column each |
| Five stage models | F-023 | One operation ledger |
| Opening-stock append-assert semantics | F-015 | One dated opening per item; counts thereafter |
| Snapshotted ordered qty on GRN | F-020 | Live read |
| Manual SQL-editor DDL; live-only functions | F-029 | Migrations as code |
| `strict: false`, build without type-check | F-030 | Strict + tsc in build |
| Backup/log tables in exposed schema | F-037 | `ops` schema, RLS, retention |
| Role allowlists in three places | F-035 | One permission source |
| Multi-tenant shared database (company_id everywhere) | Each new ERP is an independent deployment per customer (owner's stated direction, Nov 2026) | Decide per project: single-tenant deployment removes cross-tenant risk but still keep authorization per role |

## Accidental-inheritance checklist (run at G-02)

- [ ] No BizDocs item codes, prefixes, process names, roles or approval rules appear in the new requirements unless the new customer stated them.
- [ ] Every Category B pattern adopted has an ADR saying why it fits.
- [ ] Every Category C capability has a requirement ID from discovery.
- [ ] No Category D/E/F item is present.
