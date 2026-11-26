# Quality Gate Checklist

Machine-readable: `rules/quality-gates.yaml`. Copy the section for the gate being passed into the PR or gate record, fill evidence links, and get the named approver.

## G-01 Requirements — approver: owner + sponsor
- [ ] All ★ questions in the discovery questionnaire answered (link)
- [ ] FR/NFR/BR registers populated; every BR has owner + date
- [ ] Open Qs: none touching stock, money, security
- [ ] Charter in/out scope signed; accounting boundary chosen

## G-02 Architecture — approver: owner + reviewer
- [ ] Domain model, state machines, movement table (one recording document per movement)
- [ ] Operation list; every operation has a reverse
- [ ] Walk-through with realistic data recorded (≥ 3 scenarios per flow incl. one reverse)
- [ ] ADRs for stack, tenancy, ledger, UOM, numbering, authz, tests
- [ ] Inheritance check (playbook `05`): no BizDocs D/E/F items

## G-03 Schema — approver: reviewer
- [ ] `migrations:fresh-build` ✔ · `schema:lint` ✔ (output linked)
- [ ] DATA-DICTIONARY updated; every derived column has one writer
- [ ] FK ON DELETE explicit; RLS on all tables; numeric types for qty/money

## G-04 Module — approver: reviewer
- [ ] Module spec complete incl. reverse paths
- [ ] DB tests: success / guards / idempotency / reversal / permissions (output linked)
- [ ] AC results; invariants 0
- [ ] No untracked TODO/stub; no tests edited without ID

## G-05 Integration
- [ ] End-to-end flows incl. reverse at every seam; invariants 0

## G-06 Security — approver: owner + security reviewer
- [ ] Playbook `09` §5 checklist complete; advisor 0 ERROR; permission matrix tests ✔

## G-07 Regression & simulation
- [ ] Full suite ✔; simulation at 3-year volume: invariants 0; perf targets met

## G-08 UAT — approver: sponsor
- [ ] Each role ran scripts incl. exceptions; 0 open Critical/High; usability criteria met

## G-09 Production — approver: owner
- [ ] PRODUCTION-READINESS-CHECKLIST PR-01..PR-12 all evidenced

## G-10 Release — approver: owner
- [ ] RELEASE-CHECKLIST complete

**Risk acceptance:** a failing Critical item can only proceed with a RISK-REGISTER entry signed by the owner, with a dated remediation. "Future improvement" is not an acceptable disposition for a Critical item.
