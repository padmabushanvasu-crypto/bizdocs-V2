# Progress Register — ERP Engineering Knowledge Extraction

Persistent state for this exercise. A new session reads `00-START-HERE.md`, then this file, then resumes at the first phase not marked DONE.

Branch: `docs/erp-engineering-knowledge` (docs-only; no application code, schema or data changed).
Repository HEAD at start: `1d21062` (main, 26 Nov 2026). 1,016 commits, 18 Mar – 26 Nov 2026, full history (not shallow).

## Investigation plan

| Phase | Scope | Output | Status |
|---|---|---|---|
| 0 | Plan, register, evidence workspace | this file, `00-START-HERE.md` | DONE |
| 1 | Archaeology: git log (all 1,016 commits), fix/revert commits (399 matched), churn hotspots, repo migrations (126 files), live migration list (metadata only), governance docs, tests, TODOs, live security advisors (metadata only), project notes | evidence summarised in `02`, `19` | DONE |
| 2 | Failure catalogue with permanent IDs | `03` | DONE |
| 3 | Root-cause classes, universal-vs-specific classification, anti-patterns | `04`, `05`, `18` | DONE |
| 4–12 | Blueprint, DB, business logic, security, UX, requirements, methodology, testing, edge cases, readiness, gates, AI governance | `06`–`17` | DONE |
| 13 | Starter kit + machine-readable rules/gates | `NEW-ERP-STARTER-KIT/` | DONE |
| 14 | Traceability register | `19` | DONE |
| 15 | Adversarial self-review and corrections | `20` §2 | DONE |
| 16 | Executive summary + final report | `01`, final chat report | DONE |

## Evidence sources used

| Source | How used | Limits |
|---|---|---|
| Git history (`git log`, `git show`) | Commit subjects and bodies; many bodies record root cause and row counts | Commit text is the author's account; not independently re-verified against data |
| `STOCK_LIFECYCLE_GOVERNANCE.md`, `STOCK_REGISTER_STANDARDS.md`, `docs/DC_STAGE_FLOW_REDESIGN.md`, `PROGRESS.md`, `CLAUDE.md` | Incident history, decisions, live-verified schema facts | Written during development; some sections superseded (marked in the docs) |
| `supabase/migrations/` (126 files) vs live migration list | Schema evolution and drift | Live list read as metadata only; no function bodies or data read |
| Supabase security advisors (26 Nov 2026) | Current security posture | Advisor output, not a penetration test |
| Project notes kept by the owner across chat sessions | Decisions and incident figures not in git | Secondary record; cited as "project notes" |
| `src/` tree, `package.json`, `tsconfig*.json`, tests | Build/test reality | — |

Not available: issue tracker, original chat transcripts with the customer, production logs/Sentry history, Vercel build history, customer requirement documents. See `20`.

## Open items for a future session

1. Owner to review security finding BD-F-009 privately (details withheld from this public repository).
2. Owner to answer questions Q-01..Q-08 in `20`.
3. Independent external review of `06`–`17` (this exercise is a self-review only).

## Completion log

| Date | Phase | Evidence |
|---|---|---|
| 26 Nov 2026 | 0–16 | All 21 docs + progress register; starter kit (21 templates + PR template + README); rules YAML (67) and gates YAML (10) parse; `schema-lint.sql` and `invariants.template.sql` executed on PostgreSQL 16 against a synthetic schema; transfer script in starter-kit README executed into an empty repo (50 files copied, no BizDocs identifiers found by grep) |

Self-review corrections applied: `06` §1 (logic location is an ADR), R-BL-02 / R-BL-04 wording, minimum viable enforcement in `16`, F-029 figure recounted, severity counts corrected, Part 2 of `18` excluded from transfer.
