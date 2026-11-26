# 15 — Production Readiness and Long-Term Reliability

**A release is not production-ready because it worked in a demonstration.** It is ready when the measurable criteria below are met and evidenced.

## 1. Measurable criteria — first deployment (gate G-09)

| # | Criterion | Evidence | Threshold |
|---|---|---|---|
| PR-01 | CI green on release commit: strict type-check, lint, unit, DB, permission, E2E | CI run link | 100% pass |
| PR-02 | Invariant views on staging after simulation | query output | 0 rows each |
| PR-03 | Security checklist `09` §5 | checklist + advisor output | 0 ERROR |
| PR-04 | Fresh DB from migrations = staging schema | diff output | empty |
| PR-05 | Performance at 3-year volume | report | p95 list < 2 s, posting < 1 s (adjust in NFRs) |
| PR-06 | Backup configured + restore drill | restore log + invariants on restored DB | done, 0 violations |
| PR-07 | Data migration reconciliation | signed report | 0 unexplained differences |
| PR-08 | UAT sign-off | UAT log | 0 open Critical/High |
| PR-09 | Rollback plan for code and DB | runbook | written, rehearsed once |
| PR-10 | Monitoring: error tracking, uptime, nightly invariant alert | screenshots/config | active |
| PR-11 | Support: who users call, response times, incident procedure | support doc | agreed |
| PR-12 | Release notes + user guide per role | docs | published |

## 2. Before every subsequent release (gate G-10)

PR-01, PR-02 (on staging with production-like data), PR-03 (advisor), PR-04, plus: migration dry-run on a copy of production with inverse SQL ready · changelog entry · affected daily workflows listed and smoke-tested · feature flags default off for workflow changes · post-release invariant check within 1 hour.

## 3. Environments and deployment

- Environments: local → staging (production-like data, anonymised if required) → production. Each customer has its own production.
- Configuration per environment; secrets in a secret store; never in the repo.
- Deployment: tagged release; application deploy and DB migration as one runbook; migrations backward-compatible with the previous app version (expand → migrate → contract).

## 4. Database migration safety

Expand-contract for schema changes · data migrations in transactions with verification counts · inverse SQL written first · run on a copy of production first · lock-heavy operations scheduled outside shift hours · never edit applied migrations.

## 5. Rollback

| Change | Rollback |
|---|---|
| App only | redeploy previous build |
| Additive schema | leave in place; roll back app |
| Data migration | inverse script or compensating postings (ledger stays append-only) |
| Destructive schema | not allowed without a backup point and owner approval |

## 6. Monitoring

Error tracking with operation name and document id · uptime · slow queries · **data-integrity monitoring: nightly invariant views, alert on any row** · queue ages (receipts awaiting QC/store, overdue returns) · authentication anomalies.

## 7. Operations

Dependency updates monthly; security patches within 7 days for critical · version scheme (semver) per customer deployment · release documentation · incident management: severity levels, "daily-workflow break = restore first, diagnose after" (BizDocs CLAUDE.md §6), blameless review with a catalogue entry · maintenance windows agreed with the customer · data export in open formats on request (portability) · each customer deployment isolated (own DB, keys, backups).

## 8. Readiness anti-signals

"Build passes" · "worked in the demo" · "no errors in the console" · "users haven't complained" · "we'll add tests after go-live" · "we'll fix the migration files later" — each was true at some point for BizDocs and preceded a catalogued failure.
