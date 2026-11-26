# Production Readiness Checklist (gate G-09)

Every row needs an evidence link. "Worked in demo" is not evidence. Criteria from playbook `15`.

| # | Criterion | Threshold | Evidence | ✔ |
|---|---|---|---|---|
| PR-01 | CI green: strict typecheck, lint, unit, DB, permission, E2E | 100% | | |
| PR-02 | Invariant views on staging after simulation | 0 rows each | | |
| PR-03 | Security checklist (`09` §5) + advisor | 0 ERROR | | |
| PR-04 | Fresh DB from migrations = staging schema | empty diff | | |
| PR-05 | Performance at 3-year volume | NFR targets | | |
| PR-06 | Backups + restore drill with invariants on restored DB | done, 0 rows | | |
| PR-07 | Data migration reconciliation signed by owner | 0 unexplained | | |
| PR-08 | UAT sign-off | 0 open Critical/High | | |
| PR-09 | Rollback plan (code + DB) rehearsed | rehearsed once | | |
| PR-10 | Monitoring: errors, uptime, nightly invariants alert | active | | |
| PR-11 | Support model and incident procedure agreed | signed | | |
| PR-12 | Release notes and role guides published | published | | |

Additional checks for first go-live:
- [ ] Opening balances posted once at the baseline date; second import run posts zero
- [ ] Sign-up disabled at the auth provider; unknown role = no access
- [ ] Secrets only server-side; repository private
- [ ] Customer deployment isolated (own DB, keys, backups)

Go / No-go: ______ Owner: ______ Date: ______
