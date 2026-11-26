# 16 — Engineering Quality Gates

Machine-readable form: `NEW-ERP-STARTER-KIT/rules/quality-gates.yaml`.
**Auto** = enforceable by CI/scripts · **Human** = requires named reviewer. Critical failures block. An unresolved Critical issue may not be reclassified as a "future improvement" without the owner's written risk acceptance in the RISK-REGISTER.

| Gate | Entry | Required evidence | Validation | Pass | Fail / blocking | Approver | Docs | Auto/Human |
|---|---|---|---|---|---|---|---|---|
| **G-01 Requirements** | discovery done | registers (FR/NFR/BR/Q), process maps, exception catalogue, charter | read-back with each department | all §11.4 questions answered; every BR has owner+date | open Q touching stock/money/security | Owner + customer sponsor | REQUIREMENTS-REGISTER, BUSINESS-RULES-REGISTER, PROJECT-CHARTER | Human |
| **G-02 Architecture** | G-01 passed | architecture doc, ADRs, domain model, state machines, movement table, operation list with reverses, walk-through record | review vs `06` §10 and `05` checklist | every movement has one document; every operation has a reverse | any Category D/E/F item inherited; missing reverse | Owner + reviewer | ADRs | Human |
| **G-03 Schema** | G-02 | migrations, data dictionary with single-writer map, invariant views | schema lint; fresh-DB build; review `07` checklist | lint clean; every derived column has one writer; RLS on all tables | delete+reinsert, overloaded flag, missing FK policy, no RLS | Reviewer | DATA-DICTIONARY | Auto (lint, build) + Human |
| **G-04 Module** | schema for module merged | module spec, operations, DB tests (forward+reverse+idempotency+permission), UI, acceptance criteria results | CI; demo of reverse paths | all tests pass; invariants 0; AC met | any reverse path missing; placeholder logic; test edited without BR change | Reviewer | MODULE-SPECIFICATION, ACCEPTANCE-CRITERIA | Auto + Human |
| **G-05 Integration** | dependent modules at G-04 | end-to-end flow tests incl. reverse at seams | CI | each flow nets correctly | double effect at a seam | Reviewer | DEPENDENCY-MATRIX | Auto |
| **G-06 Security** | design (a) at G-02; validation (b) before G-08 | `09` §5 checklist, advisor output, permission test results | CI + manual review | 0 ERROR; matrix tests pass | any ERROR; any direct-API bypass | Owner + security reviewer | PERMISSION-MATRIX | Auto + Human |
| **G-07 Regression & simulation** | G-05 | full test suite, simulation report | CI + simulation run | 100% pass; invariants 0 at volume; perf targets | any invariant row; perf miss without ADR | Reviewer | TEST-PLAN, REGRESSION-REGISTER | Auto |
| **G-08 UAT** | G-06b, G-07 | UAT log per role | users execute scripts | no open Critical/High; usability criteria | open Critical/High | Customer sponsor | UAT log | Human |
| **G-09 Production deployment** | G-08, migration reconciled | PRODUCTION-READINESS-CHECKLIST (PR-01..12) | checklist review | all items evidenced | any item without evidence | Owner | RELEASE-CHECKLIST | Human (with auto items) |
| **G-10 Subsequent release** | change merged to release branch | CI, migration dry-run on prod copy, changelog, workflow smoke test, post-release invariant check | CI + checklist | all pass | invariant ≠ 0; no inverse SQL for data change | Owner | CHANGELOG, RELEASE-CHECKLIST | Auto + Human |

## Automatable checks (implement in CI from stage 9)

| Check | Gate(s) | Fails when |
|---|---|---|
| `typecheck` (strict) | G-04..G-10 | any type error |
| `lint` incl. custom rules (no client write loops, no unbounded list, no `Math.max(0` before write) | G-04..G-10 | any violation |
| `test:unit`, `test:db`, `test:permissions`, `test:e2e` | G-04..G-10 | any failure |
| `migrations:fresh-build` + `schema:diff` | G-03, G-10 | build fails or diff non-empty |
| `schema:lint` (RLS on, FK policy, near-duplicate names, no `float` money/qty) | G-03, G-10 | violation |
| `security:advisor` | G-06, G-10 | any ERROR |
| `secrets:scan` | all | finding |
| `invariants:check` (staging/prod read-only) | G-07, G-10, nightly | any row |
| `evidence:pr-template` (PR body has requirement ID, tests run, evidence) | G-04, G-10 | missing section |

## Human-only checks

Model and reverse-path reasoning (G-02) · business-rule correctness (G-01) · usability (G-08) · risk acceptance (any) · go-live decision (G-09).

## Minimum viable enforcement (for a small team, from stage 9)

The full set above is the target. If setup time is limited, these ten checks catch the failure classes that cost BizDocs the most, and must exist before the first module is merged:

1. `typecheck` (strict) — F-030, F-032
2. `migrations:fresh-build` + `schema:diff` — F-029
3. `schema:lint` (RLS, FK policy, near-duplicate names, float) — F-009, F-010, F-022
4. `security:advisor` — F-009
5. `test:db` for the posting function: post, double-submit, reverse, shortage — F-012..017
6. `invariants:check` on seeded data — F-016
7. `test:permissions` for privileged operations — F-007
8. `lint:no-clamp-before-write` — F-017
9. `evidence:pr-template` — AI-01, AI-06
10. `secrets:scan` — R-SEC-07

Add the rest as the corresponding modules arrive.
