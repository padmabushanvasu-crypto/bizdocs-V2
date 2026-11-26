# 13 — Testing and Regression Framework

**A successful build, passing type checks or the absence of visible errors is not evidence that an ERP is production-ready.** Evidence is: database tests of every operation (forward and reverse), invariant checks returning zero on realistic data, and role-based access tests.

## 1. Test layers

| Layer | What | Where it runs | Mandatory for |
|---|---|---|---|
| Unit | pure functions (formatting, parsing, calculations in UI) | CI | all |
| **Database tests** | every operation function and trigger: success, guard failures, idempotency, reversal | CI against a fresh DB built from migrations | every operation (most important layer for ERP) |
| Constraint tests | unique/FK/check behave as designed | CI DB | every table |
| Business-rule tests | one per BR-### | CI DB | every BR |
| Permission tests | role × operation matrix, generated | CI DB | every operation |
| Integration | API → DB for each flow | CI | each flow |
| End-to-end | browser through top tasks per role | CI nightly | top-3 tasks per role |
| Concurrency | two sessions posting same item/document | CI DB | posting functions, numbering |
| Idempotency | submit twice; retry after timeout | CI DB | every posting |
| Property-based | random sequences of valid operations keep invariants | CI nightly | inventory, operations ledger |
| Financial | tax/rounding/totals fixtures | CI | money logic |
| Inventory reconciliation | ledger net = caches; no negatives; one posting per source | CI + nightly in prod (read-only) | inventory |
| Migration | run twice, reconcile to source | staging | each data migration |
| Performance | 3-year volume, p95 targets | staging before G-09 | lists, postings, reports |
| Backup/restore | restore + invariants | quarterly | ops |
| Failure recovery | kill connection mid-operation | CI DB | posting operations |
| Security | advisor, anon access, secret scan | CI | all |
| UAT | real scenarios by users | staging | G-08 |

## 2. Standard invariants (adapt names to the schema)

| ID | Invariant |
|---|---|
| INV-01 | For each item and state: Σ ledger in − Σ ledger out = cached balance |
| INV-02 | No balance below zero unless the transaction type is configured to allow it |
| INV-03 | Each (source line, event type, sequence) posts at most once |
| INV-04 | Each reversal references an original; Σ reversed ≤ original |
| INV-05 | Document derived quantities (received, pending, issued, returned) = Σ of their lines/postings |
| INV-06 | Every posted document has ledger rows equal to its lines (or a documented exemption) |
| INV-07 | Operation ledger: per batch and operation, eligible ≥ 0 |
| INV-08 | Every ledger row has from/to state and a resolvable reference |
| INV-09 | No row exists without tenant key (multi-tenant) |

Ship INV checks as views that return violating rows; CI asserts zero; production runs them nightly and alerts.

## 3. Regression tests for BizDocs failures

Each test is universal unless marked *adapt*. Format: prerequisite → action → expected → invariant.

| Test | For | Prerequisite | Action | Expected | Invariant |
|---|---|---|---|---|---|
| T-INV-01 | F-001 | item, receipt doc | post receipt via document | ledger row exists; balance updated by trigger | INV-01, 08 |
| T-INV-02 | F-013 | approved receipt line 10 | confirm twice; then two partials 4+6 | one credit of 10; partials sum 10 | INV-03 |
| T-INV-03 | F-012 | issued outward doc (10 of A) | edit qty 8; swap A→B; remove line | ledger net per item = document lines | INV-01, 06 |
| T-INV-04 | F-014 | 3-line outward doc | abort connection after line 2 | zero lines posted; doc not issued | INV-06 |
| T-INV-05 | F-015 | item with history | attempt opening-balance edit | rejected; count adjustment path offered | INV-01 |
| T-INV-06 | F-016 | any | post corrections via correction path | caches equal ledger | INV-01 |
| T-INV-07 | F-018 | finished good in stock | create invoice; confirm dispatch | exactly one goods-leave posting | INV-03 |
| T-INV-08 | F-019 | item | 20 concurrent postings | running balance (if stored) = window sum | INV-01 |
| T-INV-09 | R-DB-11 | ledger row | UPDATE/DELETE as app role | denied | — |
| T-INV-10 | R-DB-16 | two items | two sessions post A,B and B,A | no deadlock, both succeed | INV-01 |
| T-DB-01 | F-017 | balance 5 | issue 6 | error naming shortfall; nothing written | INV-02 |
| T-DB-03 | F-002 | none | 50 concurrent creates | 50 distinct numbers | unique |
| T-DB-04 | F-003 | series at 999; FY end | create 3 docs across 999→1000 and FY boundary | `1000`, `1001`; new FY prefix from doc date | unique |
| T-DB-05 | F-022 | schema | schema lint | no near-duplicate column names | — |
| T-DB-06 | F-028 | item "AB 1" | create "ab  1 " | rejected as duplicate | unique |
| T-DB-07 | F-029 | repo | build fresh DB; diff vs prod schema | empty diff | — |
| T-DB-08 | F-036 | company TZ ≠ UTC | run weekly job at 23:30 local Sunday | runs for local Sunday | — |
| T-DB-09 | F-041 | NOS item | enter 3.5 | rejected; KGS accepts 3.125 | — |
| T-API-01 | F-004 | 2,500 rows | every list/picker | 2,500 shown or explicit paging; never silent 1,000 | — |
| T-MIG-01 | F-005, 039 | source file N rows incl. bad | import | created + rejected = N; rejection report | — |
| T-MIG-02 | F-025 | backfill script | run twice | second run posts zero | INV-03 |
| T-BL-01 | F-038 | every document type | forward → reverse | all positions back to start | INV-01, 04 |
| T-BL-02 | F-010, 011 | received PO / issued DC | edit lines | child ids preserved; links intact | INV-05 |
| T-BL-03 | F-020 | GRN against PO | edit PO qty | GRN pending/tolerance reflect new qty | INV-05 |
| T-BL-04 | F-021 | receipt flags | set "last delivery" | routing unaffected | — |
| T-BL-05 | F-006 | two items sharing drawing no. | resolve by drawing no. | error listing both | — |
| T-BL-06 | F-026 | gate setting | toggle block/warn | behaviour follows setting; audit row | — |
| T-BL-07 | §3.5 | doc + manual compensation | reverse doc | reversal nets compensation | INV-01 |
| T-MFG-01..03 | F-023 | routed item, batch 100 | send 60 to op 1, return 55 + 5 reject, send 55 to op 2 | eligibility per op correct; over-send blocked | INV-07 |
| T-MFG-04 | F-024 | job card | QC save / client attempts status write | status derived; client write denied | — |
| T-MFG-05 | F-040 | part with remaining op | assembly issue | refused; message names remaining op | — |
| T-UOM-01..02 | F-027 | item primary KGS, alt NOS | receive 12 NOS / 30 KGS | stock +30 KGS; alt kept as measured | — |
| T-SEC-01..09 | F-007..009, 035 | see `09` §6 | | | |
| T-FE-01 | F-032 | form with cached data | edit then refocus window | edits kept; cache unchanged | — |
| T-FE-02 | F-032 | two hooks | lint/unit: unique query keys per shape | — | — |
| T-FE-03 | F-033 | dashboard | idle 10 min | request count ≤ budget | — |
| T-QA-01 | F-030 | repo | build | fails on type error | — |
| T-QA-02 | F-031 | repo | CI | DB tests run on every PR | — |
| T-SIM-01 | R-BL-07 | model pack | scripted walk-through with real data | every exception maps to a transition | — |
| T-PERF-01 | `07` | 3-year volume | top lists and postings | p95 within NFR | — |
| T-OPS-01 | `07` | backup | restore + invariants | zero violations | INV-* |

## 4. Rules for tests

- R-QA-04: every fixed defect gets a regression test named with its ID before the fix is merged.
- R-AI-04: a test may be changed only when the requirement changed; the change cites the BR/FR ID. Tests are never edited to make failing code pass.
- Universal tests (T-INV, T-DB, T-SEC, T-MIG, T-QA) apply to every ERP. *Adapt* tests (T-MFG, T-UOM, T-BL-04) are rewritten against the new domain model.

## 5. Recommended harness (choose per stack; record in ADR)

SQL-level test framework running in a disposable DB built from migrations (e.g. pgTAP for Postgres) · application test runner for unit/integration · browser E2E runner for top tasks · property-based library for operation sequences · CI that runs all of the above on every PR and blocks merge on failure.
