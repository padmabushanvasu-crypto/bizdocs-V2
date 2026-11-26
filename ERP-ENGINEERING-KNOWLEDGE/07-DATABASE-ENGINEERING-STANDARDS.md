# 07 — Database Engineering Standards

Each rule: statement → enforcement → test → origin. "DB-level" means it must be enforced in the database, not only in the application.

## Rules

| Rule | Standard | DB-level? | Enforcement | Test | Origin |
|---|---|---|---|---|---|
| R-DB-01 | **Single writer.** Every derived/cached value (balances, received qty, status) has exactly one writer, named in the data dictionary. Caches are maintained by trigger from the ledger, never by callers. A drift view per cache must return zero rows. | Yes | trigger ownership; revoke direct UPDATE on cache columns from app roles; nightly drift check | T-INV-06 | F-012, 013, 015, 016 |
| R-DB-02 | **One transaction per business operation.** Multi-row writes happen in one server-side function. Clients never loop writes. | Yes | code review + grep check for awaited writes in loops in client code | T-INV-04 | F-002, 014, 017 |
| R-DB-03 | **Numbering in the DB** under a lock scoped to (company, series, FY), unique index on the number (partial on non-deleted), padding that never truncates, FY from document date and company FY setting. | Yes | trigger + unique index | T-DB-03, T-DB-04 | F-002, 003 |
| R-DB-04 | **No silent clamp.** Non-negative CHECK constraints on balances; functions RAISE on shortage. Allowed negatives are explicit per transaction type in settings, recorded as a business rule. | Yes | CHECK; grep for `GREATEST(0`/`Math.max(0` near writes | T-DB-01 | F-017 |
| R-DB-05 | **Edit in place.** Child rows keep their ids on edit (upsert by stable key). Business FKs are `ON DELETE RESTRICT`; deleting a referenced row must fail. | Yes | FK policy review at G-03 | T-BL-02 | F-010, 011 |
| R-DB-06 | **Compute, don't store, derived values.** A stored derived value needs an ADR naming why, its owner and its refresh rule. Snapshots that are legally required (price on an issued invoice) are labelled `*_at_issue`. | Partly | dictionary review | T-BL-03 | F-019, 020 |
| R-DB-07 | **One meaning per field.** No flag consulted by unrelated decisions; no near-duplicate column names; deprecated columns renamed `legacy_*` then dropped. | Partly | schema lint (name similarity) | T-DB-05 | F-021, 022 |
| R-DB-08 | **Master-data identity.** Natural codes normalised (trim, collapse whitespace, upper) and unique by functional index. Unit of measure required, no default. Inactive masters cannot be added to active documents/recipes. | Yes | functional unique index; NOT NULL; guard trigger | T-DB-06 | F-027, 028 |
| R-DB-09 | **Schema as code.** Every DDL change is a migration file in the repo, applied by one tool. A CI job builds a fresh DB from migrations and diffs it against production schema; any diff fails. | — | CI drift job | T-DB-07 | F-029 |
| R-DB-10 | **Idempotent postings.** Every posting carries a deterministic source key (document line id + event type [+ sequence]); unique index rejects a duplicate. Re-submit returns the existing result. | Yes | unique index | T-INV-02 | F-013, 014 |
| R-DB-11 | **Append-only ledger.** No UPDATE/DELETE on ledger rows (revoke + trigger). Reversals reference the original row; total reversed ≤ original (trigger). | Yes | revoke; trigger | T-INV-09 | governance §1.2 |
| R-DB-12 | **Complete reads.** Every list read paginates or has an explicit limit with a "more" indicator; a truncation guard fails loudly. | — | shared helper; lint | T-API-01 | F-004 |
| R-DB-13 | **Operational tables isolated.** Backups, correction logs, archives go to a non-exposed schema with RLS and a retention date. | Yes | schema grants; advisor | T-SEC-03 | F-037 |
| R-DB-14 | **Precision.** Quantities `numeric(p,s)` sized per business (e.g. 18,4); money `numeric(18,2)` or minor units; never float. Discrete units integer-checked at entry. Round only for display, via one formatter. | Yes | column types; CHECK for discrete units | T-DB-09 | F-041 |
| R-DB-15 | **Time.** Store `timestamptz` (UTC). Business date (`document_date`) is a `date` in the company time zone, entered or defaulted explicitly. Period logic uses business date. Scheduled jobs run in company TZ. | Partly | column types; job config | T-DB-08 | F-036 |
| R-DB-16 | **Concurrency.** Stock postings lock per item (row lock or advisory lock) in a fixed order (sorted item ids) to avoid deadlocks. | Yes | function code review | T-INV-10 | governance §4 |
| R-DB-17 | **Definer-rights hygiene.** Functions with elevated rights set `search_path`, check caller role and tenant inside, and are not executable by anonymous roles. | Yes | advisor gate | T-SEC-03 | F-009 |

## Data-modelling checklist (per table, at G-03)

Primary key (UUID or bigint identity) · owning module · tenant key if multi-tenant · FKs with explicit ON DELETE · unique business keys · CHECKs (non-negative, enums or reference tables) · audit columns (`created_at/by`, `updated_at/by`) · soft-delete policy · RLS policy · indexes for every FK and every list filter · entry in data dictionary with single writer per derived column.

## Soft delete vs permanent delete

| Object | Policy |
|---|---|
| Issued/posted documents | Never deleted. Cancel or reverse via compensating postings; status `cancelled`. |
| Draft documents | Soft delete (`deleted_at`); all lists and stats filter it (F: `1e4f26d`, `9e0e4e3`, `c8a6297` — missing filters were repeated bugs) |
| Masters with history | Deactivate; block new use; never delete |
| Ledger rows | Never |
| Operational logs | Retention policy, then archive |

Prefer a view `active_<table>` that applies the soft-delete filter, so every read is filtered by default.

## Migrations

1. One concern per migration; forward and inverse SQL written before applying.
2. Data migrations separate from schema migrations.
3. Destructive or data-changing migrations: count → dry-run in a transaction with verification → commit → verify; logged with before/after table.
4. Never edit an applied migration; add a new one.
5. Exports of functions/views kept in the repo so the DB can be rebuilt.

## Indexing and performance

Index every FK and every filter used by a list; partial indexes for "open" documents; avoid N+1 by views returning what a page needs; measure with realistic volumes (≥ 3 years of projected transactions) before go-live (T-PERF-01).

## Backup and restoration

Daily automated backups + point-in-time recovery where available; quarterly restore drill to a separate environment with invariant checks run on the restored DB (T-OPS-01). A backup never restored is not a backup.

## Safeguards that must exist in the database (not only the UI)

Uniqueness of documents and masters · non-negative balances (unless explicitly allowed) · over-receipt ceilings · single posting function · ledger immutability · reversal caps · referential integrity · tenant isolation and role authorization · numbering · status transitions (allowed from→to enforced by trigger or function).
