# 01 — Executive Summary

## What this is
An evidence-based retrospective of BizDocs (1,016 commits, Mar–Nov 2026) converted into a reusable ERP engineering playbook and a starter kit for new ERP repositories. Docs only; the application was not changed.

## Findings
- **42 catalogued failures** (`03`): 40 verified historical failures, 2 existing unresolved risks. 13 Critical, 19 High, 8 Medium, 2 Low.
- They reduce to **14 root-cause classes** (`04`). The costliest: **one value or effect with more than one writer** (stock posted by several modules and by the browser), **multi-step writes orchestrated by the client**, **silent failure** (clamps, 1,000-row truncation, swallowed errors), and **building documents before the movement model**.
- **Fixed on 26 Nov 2026:** the security-advisor exposure (BD-F-009, 40 errors → 0) and PO/DC approval enforcement (BD-F-007).
- **Significant unresolved risks today:** anonymous read for the companion dashboard on 7 tables (BD-F-042); repository and live schema out of sync (BD-F-029); no type-check in the build, no DB tests, no CI (BD-F-030, 031); item-code uniqueness not enforced (BD-F-028).

## Most important lessons
1. Design the movement ledger, states, the single posting function, reverse paths and invariants **before the first document screen**.
2. The database (or one server transaction) enforces; the browser never orchestrates business writes.
3. Fail loud, but make block-vs-warn a recorded business rule with a setting.
4. Every derived value has one writer; every cache has a drift view that must return zero.
5. Data corrections need the same rigour as features: baseline, keyed postings, run-twice test.
6. Authorization is server-side; every table gets row-level security when created.
7. The repository must be able to rebuild the database.
8. "Build passes" is not evidence; DB tests and invariants are.

## Patterns worth retaining
Append-only ledger with compensating reversals · trigger-maintained balances · DB numbering under lock · governance documents as the authoritative behaviour spec · discovery-then-implementation prompts · dry-run-then-commit SQL · drift views · next-action messages for users.

## Patterns to avoid
Client-side stock posting · delete-and-reinsert edits · snapshots of derived values · overloaded flags and twin columns · heuristic auto-linking · UI-only roles · live-only DDL · incident tables in the exposed schema · breadth-first module building.

## What was produced
| Artefact | Count |
|---|---|
| Playbook documents | 21 (`00`–`20`) + progress register |
| Starter-kit templates | 21 + PR template + README with exact transfer steps |
| Machine-readable rules | 68 rules (`engineering-rules.yaml`), 10 gates (`quality-gates.yaml`) |
| Regression tests specified | 52 test IDs (`13`, `09`), 40 edge cases (`14`) — specified, not yet implemented |
| Reference checks | schema lint and invariant views (verified on PostgreSQL 16), 6 scripts/hooks |

## Limits
Self-reviewed, not independently reviewed. Evidence excludes issue trackers, logs and live data. Following the playbook reduces known failure classes; it does not guarantee a defect-free ERP. See `20`.
