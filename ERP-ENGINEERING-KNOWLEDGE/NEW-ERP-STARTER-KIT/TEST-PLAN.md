# Test Plan — <Customer> ERP

Strategy reference: playbook `13-TESTING-AND-REGRESSION-FRAMEWORK.md`. Edge cases: `14-EDGE-CASE-CATALOGUE.md`.

## Harness (ADR-010)
| Layer | Tool | Command | Runs in CI on |
|---|---|---|---|
| Type-check (strict) | | | every PR |
| Lint + custom rules | | | every PR |
| Unit | | | every PR |
| DB tests (fresh DB from migrations) | | | every PR |
| Permission matrix (generated) | | | every PR |
| E2E (top tasks per role) | | | nightly + release |
| Invariants | `rules/checks/invariants.template.sql` adapted | | every PR (seeded) + nightly prod read-only |
| Performance | | | before G-07/G-09 |

## Coverage requirements
- Every DB operation: success, each guard, idempotency (double submit), reversal, unauthorised role.
- Every BR: at least one test.
- Every edge case marked U in the catalogue: at least one test against each posting operation.
- Every defect: regression test in REGRESSION-REGISTER.

## Test data
Seed: masters at realistic volume; 3 years of synthetic transactions incl. exceptions; ≥ 2,500 rows in every list table (catches API page caps).

## Universal suite to implement first
T-INV-01..10, T-DB-01, 03..09, T-API-01, T-MIG-01..02, T-BL-01..03, 05..07, T-SEC-01..09, T-QA-01..02, T-FE-01..02.

## Domain suite (write against this project's model)
| Test | Flow | Status |
|---|---|---|

## Exit criteria per gate
G-04: module tests green · G-05: flow tests green · G-07: all green + invariants 0 at volume · G-09: PR-01..12.
