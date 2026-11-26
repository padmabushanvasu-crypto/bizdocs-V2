# 04 — Root-Cause Analysis

The 41 findings in `03` reduce to 14 root-cause classes. A future project prevents a class, not an incident.
"Findings" lists catalogue IDs. "Control" names the enforceable mechanism (rules in `engineering-rules.yaml`).

| RC | Root-cause class | Findings | Cost in BizDocs | Primary control |
|---|---|---|---|---|
| RC-01 | **More than one writer for one value or effect** | 012, 013, 015, 016, 019, 024 | Highest: months of stock drift, ~600+ duplicate postings, repeated reconciliations | Single-writer map in the data dictionary; DB owns every derived value; drift views = 0 (R-DB-01) |
| RC-02 | **Multi-step business writes orchestrated by the client** | 002, 014, 017 | Duplicate numbers, 2–3× posting, half-issued documents, blocked fail-loud | One DB transaction per business operation (R-DB-02) |
| RC-03 | **Silent failure modes** | 003, 004, 005, 011, 017, 036, 041 | Defects surfaced weeks/months late as data drift | Fail loud; no clamps; pagination guard; error never swallowed (R-DB-04, R-DB-12) |
| RC-04 | **Destructive edit (delete + re-insert)** | 010, 011 | Severed links, reset defaults, duplicated lines | Update in place; `ON DELETE RESTRICT` on business FKs (R-DB-05) |
| RC-05 | **Stored snapshots of derived values without an owner** | 019, 020 | Wrong tolerance gates and approvals | Compute live; if stored, declare owner and refresh rule (R-DB-06) |
| RC-06 | **Overloaded or near-duplicate fields** | 021, 022 | ~190k units routed wrongly; reject events never posted | One meaning per field; drop/rename legacy columns (R-DB-07) |
| RC-07 | **Domain model not validated before modules were built** | 001, 018, 023, 026, 027, 033, 034, 040 | Three redesigns with cutovers (stock ledger, stage ledger, sales event) | Model + state machine + reverse paths + realistic walk-through before UI (R-BL-07, R-PR-01, gate G-02) |
| RC-08 | **Authorization not enforced server-side; permissive defaults** | 007, 008, 009, 035 | Open exposure today | RLS on creation, role checks in DB functions, deny by default, advisor gate (R-SEC-01..06) |
| RC-09 | **Environment not reproducible from the repository** | 029, 030, 037 | No reliable rebuild/DR; unchecked DDL | Migrations-as-code with drift check; strict build (R-DB-09, R-QA-01) |
| RC-10 | **Data migration and corrections without baseline and idempotency** | 025, 039 | Corrections created new drift (34k units, 1,095 rows) | Baseline date, keyed corrections, run-twice test (R-MIG-01..03) |
| RC-11 | **Heuristics committing business writes** | 006, 024 | Wrong items, wrong stage strike-offs | Heuristics may suggest; a human or an exact key commits (R-BL-05) |
| RC-12 | **Weak master-data identity** | 027, 028 | Phantom duplicates, wrong units, costly merges | Normalised unique keys; UOM required; no silent defaults (R-DB-08) |
| RC-13 | **Reverse paths designed after forward paths** | 038 | Each reverse path broke once | Every transition ships with its reverse and a net-zero test (R-BL-02) |
| RC-14 | **Verification by build/demo instead of invariants and tests** | 030, 031, 032 | Production crashes; defects found by users | DB tests, invariant checks, CI gates, evidence-based "done" (R-QA-01..04, R-AI-01) |

## How the classes compound (verified sequence)

1. RC-07: documents built before the stock model (F-001) →
2. RC-01/RC-02: each module posted stock its own way from the browser (F-012..016) →
3. RC-03: silent clamps hid the resulting negatives (F-017) →
4. RC-14: no automated invariant check, so drift accumulated for months (F-016, 87% reconciliation in Sept) →
5. RC-10: large corrections were then needed, and two of them double-counted (F-025) →
6. RC-09: corrections were applied directly to the live DB and not captured as code (F-029).

Breaking the chain at step 1 or 2 would have prevented most of the rest. That is why `12-ERP-DEVELOPMENT-METHODOLOGY.md` puts the domain model, ledger design and posting function before any document screen, and why gate G-03 blocks schema approval without a single-writer map.

## Fixes that did not address the root cause at first (verified)

| Finding | First fix | Why insufficient | Root fix |
|---|---|---|---|
| F-012 | July: skip re-issue on edit, keep client delta | Two writers remained; when the DB gained reconciliation the client delta double-posted again | Nov: DB owns stock; client posts nothing |
| F-017 | July: app-wide fail-loud throw | Writes were still non-atomic, so a throw half-issued documents; reverted | Sept: atomic DB posting, then fail loud inside it |
| F-019 | May 19: compute at read | Replaced 5 days later by write-time computation | Still a stored running balance (open) |
| F-004 | Per-page pagination fixes (6+ commits) | Each new list re-introduced the bug | Shared helper exists; not enforced by lint (open) |
| F-024 | PR #95 removed auto-link | Dialog still struck off stages from legacy status (PR #97 two days later) | All linking through two DB functions |

## Inferred contributing factors (not directly evidenced — treat as hypotheses)

- **I-01** Speed of AI-assisted generation outran domain discovery: very large commits early ("11 fixes", "Phase 6 complete — …") suggest batches of features generated per prompt without per-feature acceptance criteria.
- **I-02** Scaffolding from a low-code generator (UUID-named early migrations, `@lovable.dev` dependency, generator Playwright config) set defaults (strict off, build without type-check) that were never revisited.
- **I-03** Corrections were often made under live operational pressure (team blocked), which favoured warn-not-block and direct SQL.
