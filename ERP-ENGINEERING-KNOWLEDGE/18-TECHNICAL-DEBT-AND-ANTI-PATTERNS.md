# 18 — Technical Debt and Anti-Patterns

## Part 1 — Anti-pattern catalogue (universal)

Each anti-pattern has a detection signal so a reviewer or an automated check can find it.

| ID | Anti-pattern | Detection signal | Do instead | Seen in |
|---|---|---|---|---|
| AP-01 | Two writers for one value | `grep` for writes to a derived column outside its owner; a cache with no trigger owner | Name a sole owner in the data dictionary; DB trigger maintains | F-012, F-013, F-016 |
| AP-02 | Client loop of business writes | `for`/`map` with awaited inserts/updates to business tables in frontend code | One DB function per operation | F-014 |
| AP-03 | Silent clamp | `GREATEST(0`, `Math.max(0`, `?? 0` on a quantity before a write | Raise; let the user decide | F-017 |
| AP-04 | Swallowed error | `if (error) console.*` without throw; `catch {}`; `.maybeSingle()` where >1 is possible | Throw; surface | F-011 |
| AP-05 | Unbounded list read | list query without `.range()`/limit-and-loop | Shared paginated fetch with truncation guard | F-004 |
| AP-06 | Delete + re-insert on edit | edit function that deletes child rows then inserts | Upsert by stable key; restrict delete of referenced rows | F-010, F-011 |
| AP-07 | Stored derived snapshot | column copied from another document at create time | Live join / view | F-020 |
| AP-08 | Overloaded flag | one boolean consulted by unrelated decisions | One field per meaning | F-021 |
| AP-09 | Legacy twin column | two columns with near-identical names on a table | Drop or rename `legacy_*` | F-022 |
| AP-10 | Auto-magic commit | code that auto-selects a record (first match, fuzzy match) and writes | Suggest; require explicit choice or exact key | F-006, F-024 |
| AP-11 | UI-only authorization | role checks only in components/route guards | RLS + function-level checks | F-007 |
| AP-12 | Permissive default | `role ?? 'admin'`, sign-up creates tenant | Deny by default | F-008 |
| AP-13 | Live-only DDL | function/trigger in DB with no file in repo | Migration file before or with apply; drift check | F-029 |
| AP-14 | Warn-and-proceed on an integrity gate | "WARNING" in a posting function followed by the write | Block, or record the business rule that allows it | F-025, F-026 |
| AP-15 | Correction script without baseline | backfill that re-reads history already covered by an earlier correction | Baseline date; key corrections to source docs; run twice | F-025 |
| AP-16 | Forward-only feature | document with create but untested edit/cancel/delete | Reverse paths in the same change | F-038 |
| AP-17 | Display rounding per screen | `toFixed` scattered in components | One formatter per quantity/money type | F-041 |
| AP-18 | Shared query key, different shapes | same key in two hooks with different `select` | Key includes shape; typed hooks | F-032 |
| AP-19 | Mutating cached objects | editing objects returned by the cache | Copy into form state | F-032 |
| AP-20 | Build-passes = done | completion claimed on build output alone | Evidence: tests, invariants, runtime check | F-030, F-031 |
| AP-21 | Incident tables in exposed schema | `*_backup_*`, `*_log_YYYYMMDD`, `z_*` in public | `ops` schema, RLS, retention date | F-037 |
| AP-22 | Breadth before depth | many modules, none exercised end-to-end with real data | Vertical slice with reverse paths first | F-034 |

## Part 2 — BizDocs debt register (specific; do not inherit)

| ID | Debt | Where (as of 26 Nov 2026) | Risk | Suggested direction |
|---|---|---|---|---|
| TD-01 | Schema not reproducible from repo | `supabase/migrations` vs live history | DR, new environments | Export live functions/migrations; drift check |
| TD-02 | ~~Security advisor findings~~ — fixed 26 Nov 2026 | live DB | — | Keep advisor = 0 ERROR as a release gate |
| TD-03 | ~~UI-only approvals~~ — PO/DC enforced in DB 26 Nov 2026 | guard triggers | — | Audit other privileged RPCs for internal role checks |
| TD-04 | Type-check absent, strict off | `package.json`, `tsconfig*` | Runtime crashes | `tsc --noEmit` in build; strict incrementally |
| TD-05 | No DB tests, no CI | — | Regressions | pgTAP or SQL test harness on a branch DB |
| TD-06 | WIP buckets delta-maintained | items WIP columns | Drift | Make ledger-owned like free/in-process |
| TD-07 | Stored running balance | `stock_ledger.balance_qty` | Concurrency errors | Compute at read |
| TD-08 | Legacy twin columns | GRN line accepted/rejected pairs | Wrong reads | Drop after usage check |
| TD-09 | Unique normalised item code index | items | Duplicates | Apply after dedup |
| TD-10 | Known parked anomalies | governance §7 | Data correctness | Dedicated sessions with counts |
| TD-11 | Clamp in unused RM-conversion branch | `rpc_post_rm_conversion` allocation branch | Silent drift if used | Remove branch |
| TD-12 | Disabled trigger kept in DB | `trg_grn_stage_update` | Accidental re-enable double-posts | Drop |
| TD-13 | Loose SQL files in repo root | `*.sql` at root | Confusion about truth | Move to migrations or archive |
| TD-14 | Pagination not enforced | list call sites | F-004 recurrence | Lint rule |
| TD-16 | OLTC Dashboard reads 7 tables with the anon key | anon RLS policies | Public data exposure | Dashboard signs in with a read-only account, then drop anon policies |
| TD-15 | 344 historical double-credited GRN lines | project notes 24 Sept | Overstated stock | Reviewed reversal |
