# 19 — Evidence and Traceability Register

Chain: **Failure → Root cause → Rule → Preventive control → Regression test → Quality gate → Evidence**.
IDs are permanent. Rules are defined in `NEW-ERP-STARTER-KIT/rules/engineering-rules.yaml`; tests in `13`; gates in `16`.

| Failure | RC | Rule(s) | Preventive control | Test | Gate | Evidence |
|---|---|---|---|---|---|---|
| BD-F-001 | RC-07 | R-BL-01, R-PR-01 | posting function built in stage 9 before documents | T-INV-01 | G-02, G-03 | `37c3ae6` |
| BD-F-002 | RC-02 | R-DB-03 | DB numbering trigger + unique index | T-DB-03 | G-03 | `3c21398` |
| BD-F-003 | RC-03 | R-DB-03 | boundary test in numbering suite | T-DB-04 | G-04 | PROGRESS.md; `c04dad7` |
| BD-F-004 | RC-03 | R-DB-12 | shared paginated fetch; lint | T-API-01 | G-04 | `83e0905`, `13af698`, `c97684f`, `c5e8484`, `5df7a57`, `35e9b38`; governance §6 |
| BD-F-005 | RC-03 | R-MIG-02, R-BL-06 | import pipeline stage→validate→report | T-MIG-01 | G-04 | `087f518`, `dece153`, `4660d66`, `229290d`, `fc2fe40` |
| BD-F-006 | RC-11 | R-BL-05, R-BL-06 | exact-key commit; ambiguity raises | T-BL-05 | G-04 | `772ca60`, `6cd1879`, `0c244e9`, `1f026a2` |
| BD-F-007 | RC-08 | R-SEC-01, R-SEC-06 | role checks inside operations; permission tests | T-SEC-01 | G-06 | `65e7dab`, `61cd1d3`, `delivery-challans-api.ts` TODO |
| BD-F-008 | RC-08 | R-SEC-05 | default deny; provider sign-up off | T-SEC-02 | G-06 | `7685ec5`, `f91434c`, `134799a` |
| BD-F-009 | RC-08, RC-09 | R-SEC-02..04, R-DB-17, R-DB-13 | advisor gate in CI | T-SEC-03, T-SEC-04 | G-06, G-10 | advisor run 26 Nov 2026 (private to owner) |
| BD-F-010 | RC-04 | R-DB-05 | upsert by stable key; RESTRICT FKs | T-BL-02 | G-03 | `6b4ee93`, `9b626a2`, `4ead7e5`; governance §3.1 |
| BD-F-011 | RC-04, RC-03 | R-DB-05, R-BL-06 | same + throw on error | T-BL-02 | G-03 | `c3ee67d`, `13bc245`, `20e1c02`; redesign §2.4 |
| BD-F-012 | RC-01 | R-DB-01, R-BL-01 | DB owns edit netting; client grants denied | T-INV-03 | G-05 | `d764b9e`; governance §3.8; live `dc_reissue_nets_items_no_longer_on_dc` |
| BD-F-013 | RC-01 | R-DB-01, R-DB-10 | single posting point + idempotency key | T-INV-02 | G-05 | `d405c7f`, `465dd50`, `90c48e5` |
| BD-F-014 | RC-02 | R-DB-02, R-DB-10 | atomic DB operation | T-INV-04 | G-04 | `f3cc382`; redesign §2.4 |
| BD-F-015 | RC-01 | R-MIG-03, R-DB-01 | opening balance once; counts after | T-INV-05 | G-04 | `9ada087`; governance §3.3 |
| BD-F-016 | RC-01 | R-DB-01, R-QA-03 | trigger-maintained caches; nightly drift | T-INV-06 | G-07, G-10 | live `sync_stock_free_on_ledger_post`, `stock_free_ledger_owned_triggers`; project notes |
| BD-F-017 | RC-03, RC-02 | R-DB-04, R-QA-05, R-BL-08 | CHECK ≥ 0; raise; allow-negative setting | T-DB-01 | G-03, G-04 | `19ffca3`; live `rpc_post_stock_ledger_row_fail_loud_on_negative_free`; governance §1.1 |
| BD-F-018 | RC-07 | R-BL-03 | one goods-leave document per flow (ADR) | T-INV-07 | G-02, G-05 | `bda2132`, `557cc31`; governance Stage E |
| BD-F-019 | RC-05 | R-DB-06 | compute running balance at read | T-INV-08 | G-03 | `7e219b2`, `687f39b` |
| BD-F-020 | RC-05 | R-DB-06 | live reads; snapshot ADR | T-BL-03 | G-03 | governance §3.2; project notes 21 Sept |
| BD-F-021 | RC-06 | R-DB-07, R-BL-04, R-BL-10 | one field per meaning; derived route position | T-BL-04 | G-03 | governance B2; `954d412`; PR #91 |
| BD-F-022 | RC-06 | R-DB-07 | schema lint; legacy rename/drop | T-DB-05 | G-03 | live `confirm_grn_store_reads_rejected_qty`; `2cee62d`, `e2f99fd` |
| BD-F-023 | RC-07 | R-BL-07, R-PR-01 | operation ledger in domain model; walk-through | T-MFG-01..03 | G-02 | `docs/DC_STAGE_FLOW_REDESIGN.md` |
| BD-F-024 | RC-11, RC-01 | R-BL-04, R-BL-05 | derived status; explicit link operation | T-MFG-04 | G-04 | `21678cf`, `3ba38be`, `4b5f109`, `bf1821d` |
| BD-F-025 | RC-10 | R-MIG-01 | baseline + keyed corrections + run-twice | T-MIG-02 | G-09 (migration), G-10 | live `dc_reconcile_freeze_pre_baseline_dcs`, `reverse_precutover_double_counted_stage_rows` |
| BD-F-026 | RC-07 | R-BL-08 | gate policy in BR register + setting | T-BL-06 | G-01 | live `*_warn_not_block`, `stage_issue_fail_loud_and_dc_hint` |
| BD-F-027 | RC-12, RC-07 | R-DB-08, R-BL-11 | UOM required; actuals model decided at discovery | T-UOM-01..02 | G-01, G-03 | `dcc68a0`, `38c3db2`, `c26783d`, `a874b57` |
| BD-F-028 | RC-12 | R-DB-08 | normalised unique index | T-DB-06 | G-03 | governance §3.7, §7 |
| BD-F-029 | RC-09 | R-DB-09, R-AI-08 | fresh-build + schema diff in CI | T-DB-07 | G-03, G-10 | migration file list vs live list |
| BD-F-030 | RC-09 | R-QA-01 | strict tsc in build | T-QA-01 | G-04 | `package.json`, `tsconfig*.json` |
| BD-F-031 | RC-14 | R-QA-02..04 | DB test harness + CI | T-QA-02 | G-04, G-07 | test history; no `.github/` |
| BD-F-032 | RC-14 | R-FE-01, R-FE-02 | form copies; typed unique keys; render tests | T-FE-01, T-FE-02 | G-04 | `b017568`, `7a4f7d6`, `81d9177`, `dc9f78f` |
| BD-F-033 | RC-07 | R-FE-03 | request budget | T-FE-03 | G-07 | `5a880f3`, `f6f25d0` |
| BD-F-034 | RC-07 | R-PR-01, R-PR-02 | vertical slices; scope gate | — | G-01 | `533f61f`..`cf5755b` |
| BD-F-035 | RC-08 | R-SEC-06 | one permission source | T-SEC-05 | G-06 | `115f795`, `bd208e2`; project notes 22 Sept |
| BD-F-036 | RC-03 | R-DB-15 | company TZ in jobs | T-DB-08 | G-04 | `8f14fbe` |
| BD-F-037 | RC-09 | R-DB-13 | `ops` schema + retention | T-SEC-03 | G-06 | advisor run |
| BD-F-038 | RC-13 | R-BL-02, R-BL-09 | reverse paths in module DoD | T-BL-01, T-BL-07 | G-04 | `b21d9b6`, `28bb2ed`, `891e9c9`; governance §3.5 |
| BD-F-039 | RC-10 | R-MIG-02, R-MIG-03 | master cleanup before go-live; reconciliation | T-MIG-01 | G-09 | project notes Sept |
| BD-F-040 | RC-07 | R-BL-10 | state-permitted consumption | T-MFG-05 | G-02, G-04 | governance B2.4; live `awo_draws_only_finished_parts_route_aware` |
| BD-F-041 | RC-03 | R-DB-14 | one formatter; numeric types; discrete check | T-DB-09 | G-03 | 15 Jul commits; standards §2 |

## Coverage check

- Every finding maps to ≥ 1 rule and ≥ 1 gate. BD-F-034 has no automated test by nature (process); it is controlled by G-01/G-02.
- Every rule in the YAML lists its origin finding(s) or is marked `origin: preventive`.

## Evidence index

| Evidence type | Location |
|---|---|
| Commits | `git show <hash>` in `bizdocs-V2` |
| Governance | `STOCK_LIFECYCLE_GOVERNANCE.md`, `STOCK_REGISTER_STANDARDS.md`, `docs/DC_STAGE_FLOW_REDESIGN.md`, `PROGRESS.md`, `CLAUDE.md` |
| Live migrations | `supabase_migrations.schema_migrations` (names cited; bodies not read in this exercise) |
| Security advisor | Supabase advisor, 26 Nov 2026 (detail withheld from this public repo) |
| Project notes | owner's session notes (secondary source) |
