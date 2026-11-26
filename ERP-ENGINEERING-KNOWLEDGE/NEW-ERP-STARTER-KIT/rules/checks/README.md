# Checks

Reference implementations and specifications for the CI job names used in `quality-gates.yaml`. Scripts here are starting points: adapt to the stack chosen in ADR-001 and test them before relying on them.

| Job | What it must do | Starting point |
|---|---|---|
| `typecheck` | strict type-check of all app code (e.g. `tsc --noEmit` with `strict: true`) | build script |
| `lint` | standard lint + custom rules below | — |
| `lint:no-client-write-loops` | fail if client code awaits an insert/update/delete/rpc inside a loop over lines | `check-client-write-loops.sh` |
| `lint:no-clamp-before-write` | fail on `Math.max(0,` / `GREATEST(0,` in code that writes quantities | `check-clamps.sh` |
| `lint:list-calls-use-helper` | fail on list queries not using the shared paginated helper | adapt grep to the data client |
| `lint:todo-requires-id` | new TODO/FIXME must contain a ticket id `[#123]` or `Q-###` | `check-todos.sh` |
| `test:unit` / `test:e2e` | app test runner / browser runner | — |
| `test:db` | SQL tests in a fresh DB built from migrations | e.g. pgTAP |
| `test:permissions` | generated role × operation tests from PERMISSION-MATRIX | — |
| `migrations:fresh-build` | create empty DB, apply all migrations in order | DB CLI |
| `schema:diff` | diff fresh DB vs staging/production schema (schema only, no data) | DB diff tool |
| `schema:lint` | RLS on every exposed table; explicit ON DELETE on FKs; no float qty/money; near-duplicate column names | `schema-lint.sql` |
| `security:advisor` | platform advisor / linter; fail on ERROR | platform CLI |
| `secrets:scan` | secret scanner on repo and built assets | e.g. gitleaks |
| `invariants:check` | run every `inv_*` view; fail on any row | `invariants.template.sql` |
| `evidence:pr-template` | PR body contains filled sections: Requirement IDs, Behaviour changes, Blast radius, Tests run (output), Unverified | `check-pr-body.sh` |
| `tests:changed-require-id` | if test files changed, commit messages cite FR/BR/BD-F id | `check-test-changes.sh` |
| `perf:smoke` | top lists/postings at seeded volume within targets | — |

## Verification status (26 Nov 2026)

- `schema-lint.sql` and `invariants.template.sql`: executed on PostgreSQL 16 against a synthetic schema; each query detected its planted violation.
- `block-destructive-sql.sh`, `check-pr-body.sh`: exercised with sample inputs (block / allow / approval marker).
- `check-clamps.sh`, `check-client-write-loops.sh`: run against the BizDocs `src/`. Both are **heuristics** and produced expected hits plus false positives (display-only `Math.max(0, …)` shortage calculations; chunked import inserts). Annotate legitimate cases with `allow-clamp:` / `allow-loop-write:` and a reason.
- Hook JSON format: confirm against current Claude Code documentation before enabling.
