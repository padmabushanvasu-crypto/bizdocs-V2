# Release Checklist (gate G-10)

Release: v<x.y.z> · Date: · Customer deployment: · Approver:

## Before
- [ ] CI green on release commit (typecheck, lint, unit, DB, permissions, schema diff, advisor, secrets) — link
- [ ] Migrations dry-run on a copy of production; verification counts recorded
- [ ] Inverse SQL / rollback plan for every data-changing migration
- [ ] Daily workflows affected listed; smoke-test script ready
- [ ] Workflow-changing features behind default-off flags
- [ ] CHANGELOG entry with behaviour changes in user language
- [ ] Users informed of visible changes (who, how)
- [ ] Backup point confirmed

## Deploy
- [ ] Migrations applied (expand step) — output
- [ ] App deployed — build id
- [ ] Contract step (if any) scheduled separately

## After (within 1 hour)
- [ ] Smoke test of daily workflows per role
- [ ] Invariant views: 0 rows — output
- [ ] Error tracking: no new error class
- [ ] PROJECT-STATE updated

## Rollback trigger
Any daily-workflow break or invariant row → roll back first, diagnose after.
