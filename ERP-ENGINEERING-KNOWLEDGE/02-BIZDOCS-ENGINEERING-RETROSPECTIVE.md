# 02 — BizDocs Engineering Retrospective

Scope: repository `bizdocs-V2`, 1,016 commits from 18 Mar to 26 Nov 2026, plus live migration metadata, governance documents and the owner's project notes. Facts are cited; interpretations are marked.

## 1. System at a glance

| Aspect | Reality |
|---|---|
| Purpose | Custom manufacturing ERP: procurement (PO, GRN), subcontract job work (DC, job cards), inventory (ledger, buckets, counts), production (BOM, work orders, raw-material conversion), QC, dispatch |
| Stack | React 18 / TypeScript / Vite / Tailwind / shadcn-ui; Supabase (Postgres, auth, edge functions); Vercel |
| Size | ~306 files in `src/`; ~200 live DB migrations; business logic increasingly in Postgres functions and triggers |
| Users | One manufacturer; storekeepers, QC, purchase, inward, finance, assembly, admin roles |
| Development mode | Owner as product lead, AI-assisted (chat for DB work, Claude Code for frontend), owner merges |

## 2. Timeline (commits per month)

| Month | Commits | What happened (verified) |
|---|---|---|
| Mar | 134 | Phases 1–10 built in two days (18–19 Mar); stock ledger wired 23 Mar (F-001); auth isolation fix (F-008) |
| Apr | 253 | Peak: imports, roles, prints, BOM, job cards, dark mode; RLS/role fixes; UI-only role enforcement (F-007); live migration history stops 3 Apr |
| May | 136 | Numbering moved to DB (F-002); PO edit upsert (F-010); ledger leaks plugged; balance_qty flip-flop (F-019) |
| Jun | 62 | Ledger-first material issue; notification cleanup |
| Jul | 100 | Display rounding sweep (F-041); assembly moved to RPCs; fail-loud attempt reverted (F-017); closing stock = free only; DC duplicate issue on edit (F-012) |
| Aug | 21 | Governance document written from ~6 months of incidents; live migration history resumes 18 Aug |
| Sep | 210 | Second peak: stock-ledger audit, store-gate redesign (F-021), DB posting functions, stage-ledger redesign and cutover (F-023, F-025), RM conversion, weldments, first regression tests |
| Oct | 59 | Atomic store confirm, dispatch as sale event (F-018), FG serials, jig custody |
| Nov | 41 | DC edit owned by DB (F-012 closed), multi-output conversion, route-aware draws (F-040) |

Interpretation: two peaks — April (breadth) and September (correction). September's work was largely undoing consequences of March–April decisions.

## 3. Architecture evolution (verified)

1. **Mar–Apr: client-centric.** Pages called the data API directly; stock posted per module from the browser; RLS for tenancy; roles in the UI.
2. **May–Jul: moving invariants into the DB.** Numbering triggers; trigger-owned PO received quantities; first atomic RPCs (`rpc_record_grn`, `rpc_confirm_mir`, AWO RPCs).
3. **Aug: governance.** `STOCK_LIFECYCLE_GOVERNANCE.md` and `STOCK_REGISTER_STANDARDS.md` codified ownership, states, reverse paths, known anomalies.
4. **Sep–Nov: DB as the system of record.** Every stock write routed through `rpc_post_stock_ledger_row`; balance caches made ledger-owned by trigger; stage ledger; drift views; atomic store confirm; DB-owned DC edit.

The direction of travel is clear and correct: **from "the browser orchestrates" to "the database enforces"**. The new ERP should start where BizDocs ended.

## 4. What went well (keep)

| Practice | Evidence | Why it worked |
|---|---|---|
| Governance documents as authoritative behaviour spec, amended with each change | `STOCK_LIFECYCLE_GOVERNANCE.md` §8 | Gave AI sessions a stable model; prevented repeat "helpful" fixes |
| Discovery before change; live DB wins | CLAUDE.md §3 | Caught many wrong assumptions in migration files |
| Dry-run in a transaction, then commit; inverse SQL first | CLAUDE.md §4, governance §5.9 | Made large corrections reversible |
| Compensating entries with `reverses_ledger_id`, correction log tables | live migrations Sep | Kept history auditable |
| Drift/invariant views that must return zero | `v_dc_ledger_drift`, `v_dispatch_ledger_check` | Turned "is stock right?" into a query |
| Root cause recorded in commit bodies with counts | e.g. `d405c7f`, `3c21398`, `19ffca3` | Made this retrospective possible |
| Single-concern commits, owner-controlled merges | CLAUDE.md §8 | Easy revert |
| "When the system and the floor disagree, suspect the system first" | project notes | Found real bugs instead of blaming users |
| Business decisions captured with date and owner | governance amendments "Vasu, 2026-09-19" | Traceable intent |

## 5. What went wrong (summary — details in `03`)

1. Stock model after documents (F-001) → multi-writer stock (F-012..016).
2. Client orchestration of multi-step writes (F-002, F-014).
3. Silent failure everywhere (F-004, F-005, F-017).
4. Model gaps discovered in production: batch through stages (F-023), the sale event (F-018), "finished" material (F-021, F-040), units (F-027).
5. Corrections that created new drift (F-025).
6. Security left to the UI and to ad-hoc DDL (F-007, F-009).
7. No reproducible schema, no DB tests, no CI, no type-check (F-029..031).

## 6. Problems by discovery condition

| Condition | Findings |
|---|---|
| Only after modules were integrated | F-012, F-013, F-018, F-021, F-024, F-038 |
| Only with realistic data / volume | F-003 (number 1,000), F-004 (1,000 rows), F-005, F-006, F-028, F-039 |
| After deployment, by users | F-002, F-013, F-020, F-023, F-032 (DC-return GRN crash), F-040 |
| Required architectural rework | F-001, F-014, F-016, F-023 |
| Caused data inconsistency | F-012..017, F-019..022, F-025 |
| Broke previously working functionality | F-017 (revert), F-024 (PR #97 after #95), F-032 (PR #100 after #99) |
| Repeatedly fixed without the root cause | F-004, F-012, F-017, F-019 (see `04`) |
| Preventable by planning | F-001, F-002, F-007, F-018, F-021, F-023, F-027, F-029, F-030 |

## 7. Honest assessment

BizDocs works in production and its current core (ledger, posting functions, governance) is sound. But a large share of the effort from July to November went into reconciling data that earlier design choices let drift. The single highest-value lesson for the next ERP: **define the movement ledger, its states, its single posting function, its reverse paths and its invariants before the first document screen, and enforce them in the database from day one.**
