# CLAUDE.md — <PROJECT NAME>

> Discover before you change. The database enforces; the UI displays. One concern at a time. Fail loud. Evidence or it isn't done.
> When rules conflict: production safety > data correctness > security > speed.

Rules only. Status lives in `docs/PROJECT-STATE.md`. Full rationale: `docs/engineering/` (copied from the ERP Engineering Playbook). Machine-readable rules: `rules/engineering-rules.yaml`.

## 0. Every session
1. Read this file, then `docs/PROJECT-STATE.md`, then `docs/SESSION-HANDOVER.md`, then the spec of the module you will touch (`docs/modules/<module>.md`).
2. Confirm which environment you are connected to (local / staging / production). Production is read-only unless the owner says otherwise in this session.
3. At the end: update `docs/PROJECT-STATE.md` and `docs/SESSION-HANDOVER.md` with what changed, the evidence, what is unverified, and the next step.

## 1. Never invent requirements
If a behaviour is not in `docs/REQUIREMENTS-REGISTER.md` or `docs/BUSINESS-RULES-REGISTER.md`, add it as an open question `Q-###` with options and consequences. If it affects stock, money, security or a daily workflow, **stop and ask**.

## 2. Before writing code
- State the requirement / defect IDs.
- List affected modules, operations, reverse paths (edit, cancel, delete, reversal) and dependent documents (`docs/DEPENDENCY-MATRIX.md`).
- Write acceptance criteria (Given/When/Then) including at least one reverse path.
- Discover: read the current schema and functions you will touch (live schema for read-only checks; migrations for changes). Never trust comments or memory for column names.
- Search for existing functionality before adding new helpers, hooks or functions.

## 3. Non-negotiable engineering rules
| | Rule |
|---|---|
| R-BL-01 | Every quantity effect goes through the single posting function. UI and other modules never update balances. |
| R-DB-01 | Every derived value has one writer (see `docs/DATA-DICTIONARY.md`). Never write a derived/cached/status column from client code. |
| R-DB-02 | One business operation = one DB transaction (server function). No client-side loops of business writes. |
| R-DB-04 | No silent clamps (`Math.max(0,…)`, `GREATEST(0,…)`), no swallowed errors. Raise with a business message. |
| R-DB-05 | Edits update in place. Never delete + re-insert rows that other rows may reference. |
| R-DB-06/07 | Don't store derived values; one meaning per field; no near-duplicate columns. |
| R-DB-10 | Postings are idempotent (source key + unique index). |
| R-DB-12 | List reads use the shared paginated helper. |
| R-BL-02 | A document feature is not done until its reverse paths work and are tested. |
| R-BL-05 | Heuristics may suggest; commits need an exact key or an explicit user choice. |
| R-SEC-01 | Authorization is enforced server-side. Hiding a button is not access control. |
| R-SEC-02 | Every new table has RLS (or equivalent) and an owner module from creation. |
| R-AI-16 | Changes to daily workflows ship default-off. |

## 4. Database changes
- Only as new migration files in `db/migrations/` (never edit an applied migration). The repo must be able to rebuild the DB.
- Destructive or data-changing SQL: count first → write the inverse SQL → dry-run in a transaction with verification → owner approval → commit → verify. Include `APPROVED-BY-OWNER:<ticket>` in the command only after approval.
- Update `docs/DATA-DICTIONARY.md` in the same change.

## 5. Tests
- Run the relevant tests after every change and paste the output: `<typecheck cmd>`, `<lint cmd>`, `<unit cmd>`, `<db test cmd>`.
- Every fixed defect gets a regression test named with its ID.
- Never change an existing test to make it pass unless the requirement changed — cite the FR/BR ID in the commit.
- Build passing is not evidence of correctness.

## 6. Scope discipline
- No unrelated changes, refactors or renames. One concern per commit.
- Significant architectural change (new module, new pattern, posting function change, new dependency) → write an ADR draft and ask first.
- No placeholders presented as finished. Any TODO/stub carries an ID and is listed in your report.

## 7. Reporting "done"
Report: requirement IDs · behaviour changes (exact) · blast radius · tests run with output · what is **unverified**. Never say "done", "fixed" or "working" without evidence.

## 8. If production breaks
Daily-workflow break = stop new work, restore first (revert / previous deployment / inverse SQL), diagnose after. Log in `docs/RISK-REGISTER.md` and add a regression test.

## 9. Coordinates
| | |
|---|---|
| Stack | <from ADR-001> |
| Repo / default branch | <…> |
| Environments | <local / staging / production URLs> |
| DB project | <id> |
| Owner | <name> — approves merges, destructive SQL, architecture |
