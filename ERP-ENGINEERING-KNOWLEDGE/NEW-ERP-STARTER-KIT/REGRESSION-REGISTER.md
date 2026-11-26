# Regression Register

One row per defect. The fix is not merged without its test.

| Defect ID | Title | Found by / when | Root-cause class (RC-##) | Fix commit/PR | Regression test | Rule added/updated | Status |
|---|---|---|---|---|---|---|---|
| DEF-001 | | | | | T- | R- | open |

## Inherited from the BizDocs playbook (pre-loaded preventive tests)
These are not defects of this project; they are tests that prevent known ERP failure classes. Keep them in the suite.

| Playbook failure | Test |
|---|---|
| BD-F-002/003 numbering race and boundaries | T-DB-03, T-DB-04 |
| BD-F-004 silent list truncation | T-API-01 |
| BD-F-010/011 destructive edits | T-BL-02 |
| BD-F-012..016 double posting / cache drift | T-INV-02, 03, 04, 06 |
| BD-F-017 silent clamp | T-DB-01 |
| BD-F-025 non-idempotent backfill | T-MIG-02 |
| BD-F-038 missing reverse paths | T-BL-01 |
| BD-F-007/009 server-side authorization | T-SEC-01, 03, 04 |
