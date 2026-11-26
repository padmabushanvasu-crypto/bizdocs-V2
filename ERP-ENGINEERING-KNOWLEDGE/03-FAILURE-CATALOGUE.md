# 03 — Failure Catalogue

Permanent IDs `BD-F-###`. Never renumber; retire with a note instead.
Root-cause classes `RC-##` are defined in `04`. Rules `R-*` are defined in `07`–`09`, `13`, `17` and in `NEW-ERP-STARTER-KIT/rules/engineering-rules.yaml`. Tests `T-*` are specified in `13`. Full chain in `19`.

**Type:** V = verified historical failure (evidence in git/docs) · I = inferred historical failure · U = existing unresolved risk · P = general preventive recommendation.
**Confidence:** H = commit body or governance doc states it with figures · M = commit subject only, or one source · L = inference.
Customer, vendor and staff names are deliberately omitted. Document numbers and item codes are kept only where needed as evidence.

## Summary

| ID | Title | Sev | Type | Conf | RC |
|---|---|---|---|---|---|
| BD-F-001 | Stock movements not ledgered in the first build | Critical | V | H | RC-07 |
| BD-F-002 | Client-generated document numbers raced | High | V | H | RC-02 |
| BD-F-003 | Document-number formatting broke at 1,000 and at FY rollover | High | V | H | RC-03 |
| BD-F-004 | Silent 1,000-row API truncation | High | V/U | H | RC-03 |
| BD-F-005 | Silent import failures | High | V | H | RC-03 |
| BD-F-006 | Fuzzy item resolution picked the wrong item | High | V | H | RC-11 |
| BD-F-007 | Authorization moved to the UI only | Critical | V/U | H | RC-08 |
| BD-F-008 | New-user provisioning and unknown-role fallback granted access | Critical | V | M | RC-08 |
| BD-F-009 | Database exposure findings from security advisors | Critical | U | H | RC-08 |
| BD-F-010 | PO edit deleted and re-inserted lines | High | V | H | RC-04 |
| BD-F-011 | DC edit deleted and re-inserted lines | High | V | H | RC-04 |
| BD-F-012 | DC edit double-posted stock from the client | Critical | V | H | RC-01 |
| BD-F-013 | GRN store-confirm double-posted receipts | Critical | V | H | RC-01 |
| BD-F-014 | Non-atomic DC issue loop posted 2–3× | Critical | V | H | RC-02 |
| BD-F-015 | Opening-stock double-apply and append semantics | High | V | H | RC-01 |
| BD-F-016 | Stored stock balance drifted from the ledger | Critical | V | H | RC-01 |
| BD-F-017 | Silent clamping created phantom stock; first fail-loud fix reverted | Critical | V | H | RC-03 |
| BD-F-018 | Invoice and dispatch both deducted stock | High | V | H | RC-07 |
| BD-F-019 | Stored running balance never correct; read/write flip-flop | Medium | V | H | RC-05 |
| BD-F-020 | GRN ordered-quantity snapshot went stale after PO edit | High | V | H | RC-05 |
| BD-F-021 | One flag ("Final GRN") carried two meanings and routed stock | Critical | V | H | RC-06 |
| BD-F-022 | Near-duplicate columns read instead of the live ones | High | V | H | RC-06 |
| BD-F-023 | Job card did not model a batch through stages | Critical | V | H | RC-07 |
| BD-F-024 | Client wrote derived status; auto-linking heuristics | High | V | H | RC-11 |
| BD-F-025 | Cutover / reconciliation scripts double-counted | Critical | V | H | RC-10 |
| BD-F-026 | Gate strictness oscillated (warn ↔ block) | Medium | V | M | RC-07 |
| BD-F-027 | Units of measure: alt unit lost, wrong default, wrong model built | High | V | H | RC-12 |
| BD-F-028 | Item master duplicates and unnormalised codes | High | V/U | H | RC-12 |
| BD-F-029 | Live database and repository schema drifted apart | High | V/U | H | RC-09 |
| BD-F-030 | Build does not type-check; strict mode off | Medium | U | H | RC-09 |
| BD-F-031 | No database-level tests, no CI; first regression test after ~6 months | High | V/U | H | RC-14 |
| BD-F-032 | Frontend state defects (cache mutation, key collision, focus refetch, runtime crashes) | Medium | V | H | RC-14 |
| BD-F-033 | Polling and notification floods | Low | V | M | RC-07 |
| BD-F-034 | Breadth-first build; modules later retired | Medium | V | M | RC-07 |
| BD-F-035 | Role access defined in three places | Medium | V | M | RC-08 |
| BD-F-036 | Scheduled jobs computed in UTC | Low | V | M | RC-03 |
| BD-F-037 | Ad-hoc backup/log tables in the exposed schema | Medium | U | H | RC-09 |
| BD-F-038 | Reverse paths built after forward paths | High | V | H | RC-13 |
| BD-F-039 | Go-live data imported with duplicates; early history unreconcilable | High | V | H | RC-10 |
| BD-F-040 | Material with processing left was consumed by assembly | High | V | H | RC-07 |
| BD-F-041 | Rounding and precision handled per screen | Medium | V/U | H | RC-03 |

Counts: 41 findings — 38 verified historical failures (6 of them still partly open: F-004, 007, 028, 029, 031, 041) and 3 existing unresolved risks with no historical incident (F-009, 030, 037). No inferred-only findings were admitted to the catalogue; inferences appear in `04` and `20`. Severity: 12 Critical, 19 High, 8 Medium, 2 Low.

---

## Findings

### BD-F-001 — Stock movements not ledgered in the first build
- **Layer:** Inventory / data model · **Sev:** Critical · **Recurrence risk:** High in any new build · **Type:** V · **Conf:** H
- **Original assumption:** Documents (GRN, DC, invoice) could be built first and stock wired in later.
- **What went wrong:** Five days after the initial build, GRN, invoice and DC did not update stock or create ledger rows; ledger posting was retrofitted across all document types.
- **Root cause:** RC-07 — modules built before the stock model and its invariants.
- **Conditions:** Rapid multi-module build (Phases 1–10 in two days).
- **Consequences:** Every later stock path was bolted on per module, producing the multi-writer pattern behind BD-F-012..017.
- **Identified by:** Developer testing.
- **Resolution:** `37c3ae6` (23 Mar) wired `grn_receipt`, `invoice_dispatch`, `dc_issue`, `dc_return`.
- **Root cause addressed?** No at the time — posting was per-module client code; addressed progressively Jul–Nov by moving posting into DB functions.
- **Still vulnerable?** Largely mitigated; WIP buckets were still delta-maintained in Sept (project notes).
- **Prevention:** Design the ledger, states and posting function before the first document screen.
- **Rule:** R-BL-01, R-PR-01 · **Test:** T-INV-01 · **Evidence:** `37c3ae6`, `533f61f`..`cf5755b`

### BD-F-002 — Client-generated document numbers raced
- **Layer:** Database / numbering · **Sev:** High · **Recurrence:** High · **Type:** V · **Conf:** H
- **Original assumption:** `SELECT MAX(num)+1` in the browser, prefetched when the form opens, is unique enough.
- **What went wrong:** 62 duplicate GRN numbers, 8 PO, 1 DC after FY rollover.
- **Root cause:** RC-02 — business-critical generation in the client with a multi-minute race window.
- **Conditions:** Two users with the same form open; FY rollover.
- **Consequences:** Duplicate legal document numbers.
- **Identified by:** Users / data audit.
- **Resolution:** `3c21398`, `f2e313e` — BEFORE INSERT triggers with `pg_advisory_xact_lock(company, prefix)` plus partial unique indexes; number field read-only.
- **Root cause addressed?** Yes. **Still vulnerable?** No for covered tables; any new numbered table must adopt the pattern.
- **Prevention:** Numbering is a DB concern from day one.
- **Rule:** R-DB-03 · **Test:** T-DB-03 (concurrent insert) · **Evidence:** `3c21398` body, governance §4 ownership map

### BD-F-003 — Document-number formatting broke at 1,000 and at FY rollover
- **Layer:** Database · **Sev:** High · **Recurrence:** Medium · **Type:** V · **Conf:** H
- **What went wrong:** (a) `LPAD(n, 3)` truncates rather than pads, so 1000 became `100` and collided — GRN creation crashed past /999. (b) FY label derived from the system clock rather than the company FY setting.
- **Root cause:** RC-03 — boundary values never exercised.
- **Identified by:** Production crash at GRN /1000.
- **Resolution:** `generate_doc_number` changed to `LPAD(..., GREATEST(pad, length(...)))` (PROGRESS.md, 02–03 Jul); `c04dad7` FY from `company_settings`.
- **Root cause addressed?** Yes. **Still vulnerable?** No.
- **Rule:** R-DB-03 · **Test:** T-DB-04 (boundary 999→1000→10000, FY rollover) · **Evidence:** `PROGRESS.md`, `c04dad7`, `9c446ab`

### BD-F-004 — Silent 1,000-row API truncation
- **Layer:** API / frontend · **Sev:** High · **Recurrence:** High · **Type:** V and U · **Conf:** H
- **Original assumption:** A list query returns all rows.
- **What went wrong:** The data API caps unscoped responses at 1,000 rows without error. Item pickers, BOM selectors, imports, cost master and the store receipt queue silently missed records.
- **Root cause:** RC-03.
- **Consequences:** Items "missing", wrong duplicate detection on import, incomplete queues — indistinguishable from missing stock.
- **Resolution:** `83e0905`, `13af698`, `c97684f`, `c5e8484`, `5df7a57`, `35e9b38`; batched fetch helper with loud abort guard.
- **Root cause addressed?** Partially — per call site. Governance §6 records the stock-alerts fallback path as still open.
- **Prevention:** One shared paginated fetch helper; lint rule banning raw list calls.
- **Rule:** R-DB-12 · **Test:** T-API-01 (seed 2,500 rows; every list returns 2,500 or errors) · **Evidence:** commits above; `STOCK_LIFECYCLE_GOVERNANCE.md` §6; `STOCK_REGISTER_STANDARDS.md` §1.4

### BD-F-005 — Silent import failures
- **Layer:** Data import · **Sev:** High · **Recurrence:** High · **Type:** V · **Conf:** H
- **What went wrong:** (a) inserts without explicit tenant id silently rejected by row-level security (`087f518`); (b) codes containing `(` `)` broke the API `in.(...)` filter and 100 items silently vanished (`dece153`); (c) selecting a non-existent column silently broke vendor lookup (`4660d66`); (d) type normaliser turned `bought_out` into `boughtout` (`229290d`); (e) column-ordering bug in header resolution (`fc2fe40`).
- **Root cause:** RC-03 — errors and empty results treated as "nothing to do".
- **Consequences:** Incomplete masters at go-live → downstream BOM and stock defects.
- **Resolution:** explicit tenant id, client-side exact lookup, post-import verification counts, fail-loud on shortfall (`5df7a57`).
- **Root cause addressed?** Mostly. **Still vulnerable?** Pattern recurs wherever a new import is written without the verification step.
- **Rule:** R-MIG-02, R-BL-06 · **Test:** T-MIG-01 (import reconciliation: rows in = rows created + rows rejected with reasons) · **Evidence:** commits above

### BD-F-006 — Fuzzy item resolution picked the wrong item
- **Layer:** Business logic / master data · **Sev:** High · **Recurrence:** High · **Type:** V · **Conf:** H
- **Original assumption:** A three-level match (exact → strip spaces/periods → drawing number) is a safe way to find an item.
- **What went wrong:** Ambiguous matches on drawing revision silently resolved to one item; DC and GRN stock posted against the wrong or no item.
- **Root cause:** RC-11 — heuristic matching committing a stock write.
- **Resolution:** `772ca60`, `6cd1879` — fail loud on ambiguous lookups; `0c244e9` hard-block saves with NULL item id; `1f026a2` block store-confirm of unlinked lines.
- **Root cause addressed?** Yes for those paths. Heuristic lookup still exists for imports.
- **Rule:** R-BL-05, R-BL-06 · **Test:** T-BL-05 · **Evidence:** commits above, `dece153` body (three-level matcher)

### BD-F-007 — Authorization moved to the UI only
- **Layer:** Security · **Sev:** Critical · **Recurrence:** High · **Type:** V and U · **Conf:** H
- **Original assumption:** Hiding buttons by role is access control.
- **What went wrong:** A failing server-side role check on PO approval and DC approve/reject was removed and "role enforced at UI layer" (`65e7dab`, `61cd1d3`). A code TODO still records that DC approval columns are not protected server-side (`src/lib/delivery-challans-api.ts`, `approveDC`).
- **Root cause:** RC-08 — a broken server check was deleted instead of fixed.
- **Consequences:** Any authenticated user with the public API key and a session can call the same updates directly.
- **Resolution:** Partial — later DB gates exist for specific actions (e.g. stock-count approver function, project notes Sept 22). Not verified for PO/DC approval.
- **Root cause addressed?** No (as far as the repository shows). **Still vulnerable?** Presumed yes — needs verification.
- **Rule:** R-SEC-01, R-SEC-06 · **Test:** T-SEC-01 (direct API call as each role for every privileged action) · **Evidence:** `65e7dab`, `61cd1d3`, `delivery-challans-api.ts` TODO

### BD-F-008 — New-user provisioning and unknown-role fallback granted access
- **Layer:** Security / auth · **Sev:** Critical · **Type:** V · **Conf:** M
- **What went wrong:** OAuth sign-up isolation required a "critical security fix" and trigger rewrite (`7685ec5`); users with no role fell back to admin until `f91434c` ("now get NO_ACCESS instead of admin"); new-user trigger auto-created companies (`a43e118`, `00c7dfb`).
- **Root cause:** RC-08 — permissive defaults.
- **Resolution:** Default deny on unknown role; sign-ups disabled in UI (`134799a`).
- **Still vulnerable?** UI-hidden sign-up is not proof that sign-up is disabled at the auth provider — verify.
- **Rule:** R-SEC-05 · **Test:** T-SEC-02 · **Evidence:** commits above

### BD-F-009 — Database exposure findings from security advisors
- **Layer:** Security / database · **Sev:** Critical · **Type:** U · **Conf:** H (advisor output, 26 Nov 2026; not exploit-tested)
- **Finding (class level only):** The platform's security advisor reports tables in the API-exposed schema without row-level security (including some operational tables, not only backups), views running with definer rights, a large number of definer-rights functions executable by the anonymous role, functions without a fixed `search_path`, and leaked-password protection disabled.
- **Why withheld:** This repository is public. The table and function list was given to the owner privately and is not reproduced here.
- **Root cause:** RC-08 + RC-09 — tables created ad hoc in live SQL sessions without a "RLS on creation" check; no automated advisor gate.
- **Consequences:** Potential read/write of tenant data with only the public client key, depending on grants.
- **Resolution:** None yet. **Still vulnerable?** Yes until verified.
- **Rule:** R-SEC-02, R-SEC-03, R-SEC-04, R-DB-13 · **Test:** T-SEC-03 (advisor = zero ERROR in CI), T-SEC-04 (anon role cannot select/insert any business table) · **Evidence:** security advisor run 26 Nov 2026 (owner has the detail)

### BD-F-010 — PO edit deleted and re-inserted lines
- **Layer:** Business logic / data integrity · **Sev:** High · **Type:** V · **Conf:** H
- **What went wrong:** PO edit (`replace_po_line_items`) deleted and re-inserted lines. GRN links were set NULL, received quantities broke, column defaults (e.g. rate basis) reset, edits reset approval to pending.
- **Root cause:** RC-04.
- **Resolution:** `6b4ee93` upsert instead of delete+insert; `9b626a2` preserve received qty; `4ead7e5` preserve approval/receiving state; live migrations `fix_replace_po_line_items_received_qty_race` (Aug).
- **Root cause addressed?** Yes for PO. **Still vulnerable?** Any new "replace lines" function.
- **Rule:** R-DB-05 · **Test:** T-BL-02 (edit a received PO; every GRN link and received figure unchanged) · **Evidence:** governance §3.1, commits above

### BD-F-011 — DC edit deleted and re-inserted lines
- **Layer:** Business logic · **Sev:** High · **Type:** V · **Conf:** H
- **What went wrong:** DC edit gave lines new IDs; 120 GRN lines across 38 DCs pointed at nothing (no FK at the time). Later, with an FK, the delete failed but the error was swallowed and the re-insert ran — one DC ended with 5 copies of a line.
- **Root cause:** RC-04 + RC-03.
- **Resolution:** read-time key (`c3ee67d`), real FK (live `phase1_grn_dc_line_item_real_fk`), in-place update of referenced lines, throw on delete error (`13bc245`, `20e1c02`).
- **Root cause addressed?** Yes. **Still vulnerable?** No for DC.
- **Rule:** R-DB-05, R-BL-06 · **Test:** T-BL-02 · **Evidence:** `docs/DC_STAGE_FLOW_REDESIGN.md` §2.4, `13bc245` body

### BD-F-012 — DC edit double-posted stock from the client
- **Layer:** Inventory · **Sev:** Critical · **Type:** V · **Conf:** H
- **What went wrong:** Editing an issued DC posted both a client `manual_adjustment` delta and a full re-issue. After a July fix, the DB later gained its own reconciliation; the client delta remained and became a second movement again (Jul and Oct incidents). Separately, 462 lines across 268 DCs were off versus the ledger because edits after issue were never reposted (project notes, 18 Sept).
- **Root cause:** RC-01 — two writers for one effect.
- **Resolution:** `d764b9e` (Jul), DB trigger `trg_dc_line_stock_sync` (Sept), client delta removed and DB nets re-approved DC to current lines (19 Nov, governance §3.8).
- **Root cause addressed?** Yes from 19 Nov: the DB owns the effect and the client posts nothing.
- **Rule:** R-DB-01, R-BL-01 · **Test:** T-INV-03 (edit issued DC qty/item/remove line; ledger net = document) · **Evidence:** governance §3.8, `d764b9e`, live migrations `dc_line_stock_sync_trigger_and_delete_stage_reversal`, `dc_reissue_nets_items_no_longer_on_dc`

### BD-F-013 — GRN store-confirm double-posted receipts
- **Layer:** Inventory · **Sev:** Critical · **Type:** V · **Conf:** H
- **What went wrong:** 630 duplicate `grn_receipt` pairs (8 Jun – 7 Sep): receipt-time credit plus store-confirm credit for the same line. A `stock_posted_at` flag existed for exactly this but one path ignored it. A repeated partial confirm also double-posted. An older trigger (`trg_grn_stage_update`) is disabled because it double-posts.
- **Root cause:** RC-01.
- **Resolution:** `d405c7f`, `465dd50`; atomic DB function `rpc_store_confirm_plain_lines` (`90c48e5`); store gate in `rpc_credit_partial_stock`.
- **Root cause addressed?** Yes (single posting point). Historical duplicates handled separately; project notes (24 Sept) record 344 historical lines still double-credited pending review.
- **Rule:** R-DB-01, R-DB-10 · **Test:** T-INV-02 (confirm same line twice / two partials; one credit each) · **Evidence:** `d405c7f` body, `PROGRESS.md`, project notes

### BD-F-014 — Non-atomic DC issue loop posted 2–3×
- **Layer:** Inventory / transactions · **Sev:** Critical · **Type:** V · **Conf:** H
- **What went wrong:** No server-side DC issue; the browser wrote ledger rows and bucket updates in a loop. Retries and partial failures posted some DCs 2–3 times and left others half-issued.
- **Root cause:** RC-02.
- **Resolution:** `f3cc382` route through `rpc_issue_dc_plain_lines`; `block_duplicate_dc_issue` trigger; idempotent re-issue (`dc_reissue_nets_to_posted_not_full_qty`).
- **Root cause addressed?** Yes. **Rule:** R-DB-02, R-DB-10 · **Test:** T-INV-04 (kill connection mid-issue; zero or all lines posted) · **Evidence:** `DC_STAGE_FLOW_REDESIGN.md` §2.4, governance Stage C.1

### BD-F-015 — Opening-stock double-apply and append semantics
- **Layer:** Inventory · **Sev:** High · **Type:** V · **Conf:** H
- **What went wrong:** Opening stock called the ledger function (which already syncs the balance) and then a bucket update on top → drift. Each opening-stock correction appended a full new row, inflating ledger sums.
- **Root cause:** RC-01 + RC-07 (no defined semantics for "opening balance").
- **Resolution:** bucket update made ledger-authoritative (live `rpc_update_stock_bucket_free_ledger_authoritative`); opening stock blocked for items with history and routed to Physical Count (`9ada087`, live `block_manual_opening_stock_reassert`).
- **Root cause addressed?** Yes going forward; historical noise documented, not rewritten.
- **Rule:** R-MIG-03, R-DB-01 · **Test:** T-INV-05 · **Evidence:** governance §3.3, standards §5.1, `9ada087`

### BD-F-016 — Stored stock balance drifted from the ledger
- **Layer:** Inventory · **Sev:** Critical · **Type:** V · **Conf:** H
- **What went wrong:** Item balance columns are a cache of the ledger, but audit corrections posted to the ledger never reached the cache; 217 items were bulk-synced. Reconciliation rose ~87% → 95% only after the fix.
- **Root cause:** RC-01 — cache maintained by callers instead of by the ledger itself.
- **Resolution:** live `sync_stock_free_on_ledger_post` (12 Sept), ledger-owned triggers (`stock_free_ledger_owned_triggers`, `stock_in_process_ledger_owned...`), drift monitor (`stock_drift_monitor`).
- **Root cause addressed?** Yes for free and in-process. Project notes (Sept) record WIP buckets as still delta-maintained.
- **Rule:** R-DB-01, R-QA-03 · **Test:** T-INV-06 (per item per bucket: ledger net = cache, nightly) · **Evidence:** project notes; live migration names; standards §1.2

### BD-F-017 — Silent clamping created phantom stock; first fail-loud fix reverted
- **Layer:** Inventory / guards · **Sev:** Critical · **Type:** V · **Conf:** H
- **What went wrong:** `GREATEST(0, …)` / `Math.max(0, …)` floors hid over-issue; 78 items / 4,575 phantom units. A fail-loud change (`dd91e37`) shipped app-wide without reviewing callers and was reverted (`19ffca3`) because it could half-issue documents mid-loop and had no opt-in for legitimate corrections.
- **Root cause:** RC-03 (silent clamp) compounded by RC-02 (non-atomic loops made fail-loud unsafe).
- **Resolution:** fail loud at the DB posting function (live `rpc_post_stock_ledger_row_fail_loud_on_negative_free`, 15 Sept), after posting became atomic; explicit business decision that sub-assembly issue may go negative (`allow_subassembly_over_issue`). One known clamp remains in an unused RM-conversion branch (governance §7).
- **Root cause addressed?** Yes, in the correct order: atomicity first, then fail loud.
- **Rule:** R-DB-04, R-QA-05, R-BL-08 · **Test:** T-DB-01 · **Evidence:** `19ffca3` body, governance §1.1 rule 3, §7

### BD-F-018 — Invoice and dispatch both deducted stock
- **Layer:** Sales / inventory · **Sev:** High · **Type:** V · **Conf:** H
- **What went wrong:** Invoice issue and dispatch confirmation each wrote `invoice_dispatch` for the same shipment. The "sale event" was redefined several times (invoice → "Sale complete" → dispatch record).
- **Root cause:** RC-07 — the business event that consumes goods was not decided before building.
- **Resolution:** `bda2132` — dispatch record is the only goods-leave event; atomic confirm/revert (`557cc31`), reconciliation view must return zero rows.
- **Rule:** R-BL-03 · **Test:** T-INV-07 · **Evidence:** governance Stage E.3, project notes (16 Sept, 3 Oct)

### BD-F-019 — Stored running balance never correct; read/write flip-flop
- **Layer:** Ledger · **Sev:** Medium · **Type:** V · **Conf:** H
- **What went wrong:** Of ~37 callers, ~24 wrote `balance_qty: 0`. Fixed by computing at read time (`7e219b2`), then five days later switched to computing at write time from the previous row (`687f39b`) — which is race-prone under concurrency.
- **Root cause:** RC-05 + RC-01. **Root cause addressed?** Partially — single helper, but a stored running balance remains.
- **Rule:** R-DB-06 · **Test:** T-INV-08 (concurrent postings: running balance = window sum) · **Evidence:** both commit bodies

### BD-F-020 — GRN ordered-quantity snapshot went stale after PO edit
- **Layer:** Procurement · **Sev:** High · **Type:** V · **Conf:** H
- **What went wrong:** GRN lines snapshot ordered/pending quantity at creation; PO edits never refreshed them. The stale figure drove the over-receipt tolerance gate, finance "excess" approvals and the NC flag.
- **Root cause:** RC-05.
- **Resolution:** read live PO figures at every read site (Sept 21 branch, project notes); governance §3.2 rule "justify any stored derived value and name its single owner".
- **Rule:** R-DB-06 · **Test:** T-BL-03 · **Evidence:** governance §3.2; `PROGRESS.md` (snapshot-staleness class); project notes

### BD-F-021 — One flag ("Final GRN") carried two meanings and routed stock
- **Layer:** Business logic · **Sev:** Critical · **Type:** V · **Conf:** H
- **What went wrong:** `is_final_grn` meant both "material finished processing" and "last delivery against the PO". Stock routing depended on it: non-final lines skipped the store gate and were credited at QC or at receipt (~190,000 units historically). It was also auto-ticked.
- **Root cause:** RC-06.
- **Resolution:** all lines route through store confirmation (PR #91, 16 Sept); auto-tick removed (`954d412`); "finished" now derived from the item's processing route, never from the flag (governance B2.2–B2.3, 26 Nov).
- **Rule:** R-DB-07, R-BL-04, R-BL-10 · **Test:** T-BL-04 · **Evidence:** governance Stage B2; `66d9226`, `24d4100`; project notes

### BD-F-022 — Near-duplicate columns read instead of the live ones
- **Layer:** Data model · **Sev:** High · **Type:** V · **Conf:** H
- **What went wrong:** The store-confirm function read the dead `rejected_quantity` while the screen wrote `rejected_qty` → no rejection events ever posted. `accepted_quantity` (stage-1 mirror, includes rejects) was used where `accepted_qty` (QC truth) was meant. `qty_matched` boolean vs numeric confusion (`e2f99fd`, `01a9547`).
- **Root cause:** RC-06 — legacy columns kept alongside replacements with near-identical names.
- **Resolution:** live `confirm_grn_store_reads_rejected_qty`, `grn_store_confirm_qc_accepted_and_auto_disposition`, data correction of stage returns (24 Sept); `2cee62d`.
- **Still vulnerable?** Yes — the legacy columns still exist.
- **Rule:** R-DB-07 · **Test:** T-DB-05 (schema lint: no two columns on a table within edit distance 3 unless whitelisted) · **Evidence:** live migration names; project notes 24 Sept

### BD-F-023 — Job card did not model a batch through stages
- **Layer:** Manufacturing model · **Sev:** Critical · **Type:** V · **Conf:** H
- **What went wrong:** Five overlapping stage models (three dead). 323/334 job cards stuck in progress; 0 of 2,639 steps ever recorded a return; 110 cards had more sent at a stage than the card's quantity; free-text stage names; returns went back to free stock indistinguishable from raw material.
- **Root cause:** RC-07 — "how many units have finished stage N" was never modelled.
- **Resolution:** stage ledger redesign (5–24 Sept; ~40 live migrations), cutover, PR #95/#97.
- **Root cause addressed?** Yes, by redesign — at high cost and with cutover defects (BD-F-025).
- **Rule:** R-BL-07, R-PR-01 · **Test:** T-MFG-01..03 · **Evidence:** `docs/DC_STAGE_FLOW_REDESIGN.md` §1–2

### BD-F-024 — Client wrote derived status; auto-linking heuristics
- **Layer:** Business logic / frontend · **Sev:** High · **Type:** V · **Conf:** H
- **What went wrong:** QC save and job-card creation wrote step status; the DC form auto-linked job cards and struck off stages; a dialog picked a legacy card by item with no ordering. Strike-offs persisted even when the user chose "create new".
- **Root cause:** RC-11 + RC-01.
- **Resolution:** status derived from the stage ledger by trigger (19 Sept); auto-link removed (`21678cf`, `3ba38be`, `4b5f109`, `bf1821d`). Note: a live migration two days later re-added DB-side auto-linking for the unambiguous case (`dc_issue_auto_links_unambiguous_job_card`) — whether that is still active is unverified.
- **Rule:** R-BL-04, R-BL-05 · **Test:** T-MFG-04 · **Evidence:** commits above; project notes 19–21 Sept

### BD-F-025 — Cutover / reconciliation scripts double-counted
- **Layer:** Data migration · **Sev:** Critical · **Type:** V · **Conf:** H
- **What went wrong:** (a) A DC ledger reconciler re-reversed DCs already covered by an earlier lump correction keyed differently: 383 rows, 34,433 units moved wrongly, reversed same day. (b) Job cards reconstructed in-flight quantities at cutover; later linking and backfill re-posted the same pre-cutover DCs/GRNs → 1,095 reversal rows on 96 cards. (c) 187 audit corrections reversed receipts that pre-dated a stock assert.
- **Root cause:** RC-10 — no recorded baseline; corrections not keyed to the documents they covered; warnings ("STAGE MISMATCH") allowed to proceed.
- **Resolution:** baseline function `_dc_reconcile_baseline()`, compensating reversals with logs, fail-loud stage issue.
- **Rule:** R-MIG-01 · **Test:** T-MIG-02 (run every backfill twice; second run posts zero) · **Evidence:** live migrations `dc_reconcile_freeze_pre_baseline_dcs`, `reverse_precutover_double_counted_stage_rows`, `reverse_post_assert_audit_corrections`; project notes

### BD-F-026 — Gate strictness oscillated (warn ↔ block)
- **Layer:** Business rules · **Sev:** Medium · **Type:** V · **Conf:** M
- **What went wrong:** Stage-eligibility on DC issue changed to "warn, not block" (21 Sept, two migrations) and back to fail-loud (24 Sept) after warnings let over-issues through (BD-F-025b).
- **Root cause:** RC-07 — gate policy decided under operational pressure, not recorded as a business rule.
- **Rule:** R-BL-08 · **Test:** T-BL-06 · **Evidence:** live migrations `dc_issue_stage_eligibility_warn_not_block`, `dc_sync_stage_line_eligibility_warn_not_block`, `stage_issue_fail_loud_and_dc_hint`

### BD-F-027 — Units of measure: alt unit lost, wrong default, wrong model built
- **Layer:** Master data / UOM · **Sev:** High · **Type:** V · **Conf:** H
- **What went wrong:** PO and DC forms saved alternate quantity without its unit (452 DC lines). `items.unit` defaulted to NOS; 93 items were really KGS. A conversion-factor reconcile flow was built and then rejected — the business records conversion actuals after the fact.
- **Root cause:** RC-12 + RC-07.
- **Resolution:** `dcc68a0`, `38c3db2`; unit corrections with reversible before/after table; factor UI removed (PR #94); UOM rule in governance §1.3.
- **Rule:** R-DB-08, R-BL-07 · **Test:** T-UOM-01..02 · **Evidence:** `PROGRESS.md`, governance §1.3, project notes 19 Sept

### BD-F-028 — Item master duplicates and unnormalised codes
- **Layer:** Master data · **Sev:** High · **Type:** V and U · **Conf:** H
- **What went wrong:** Duplicate items with conflicting stock; codes with trailing spaces; BOM lines pointing at inactive duplicates created phantom shortages; merges must repoint ~25 tables. The unique normalised-code index is designed but not applied.
- **Root cause:** RC-12.
- **Resolution:** manual merges, `~MERGED` suffixes, guard on inactive items in active recipes (live, 26 Oct).
- **Still vulnerable?** Yes.
- **Rule:** R-DB-08 · **Test:** T-DB-06 · **Evidence:** governance §3.7, §7

### BD-F-029 — Live database and repository schema drifted apart
- **Layer:** Engineering process · **Sev:** High · **Type:** V and U · **Conf:** H
- **What went wrong:** Repository: 126 migration files, 2 for September. Live history: no entries between 3 Apr and 18 Aug, while repo files exist for May–Aug (applied by hand in the SQL editor); ~120 live migrations in September with no repo file. Functions exist only live (`recompute_po_line_received_quantity`); a disabled trigger lives only in the DB; loose `.sql` files sit in the repo root. The rule "Vasu runs all SQL manually" (CLAUDE.md §4) conflicts with practice (MCP `apply_migration`).
- **Root cause:** RC-09.
- **Consequences:** The system cannot be rebuilt from the repository; a new environment or disaster recovery depends on the live database.
- **Resolution:** partial — `supabase/migrations/LIVE_APPLIED_2026-11-25_26.md` records an export query.
- **Still vulnerable?** Yes.
- **Rule:** R-DB-09 · **Test:** T-DB-07 (fresh DB from repo migrations; schema diff vs production = empty) · **Evidence:** `ls supabase/migrations`; live migration list; CLAUDE.md §4, §10

### BD-F-030 — Build does not type-check; strict mode off
- **Layer:** Tooling · **Sev:** Medium · **Type:** U · **Conf:** H
- **What went wrong:** `package.json` `build` is `vite build` (no `tsc`), while CLAUDE.md §5 states the build "runs tsc then vite build". `strict: false`, `noImplicitAny: false`, `strictNullChecks: false`. Many casts to `any` at API boundaries.
- **Consequences:** Runtime crashes that a type-checker would catch (BD-F-032); "build passes" used as completion evidence.
- **Rule:** R-QA-01 · **Test:** T-QA-01 · **Evidence:** `package.json`, `tsconfig.app.json`, `tsconfig.json`, CLAUDE.md §5

### BD-F-031 — No database-level tests, no CI; first regression test after ~6 months
- **Layer:** Quality · **Sev:** High · **Type:** V and U · **Conf:** H
- **What went wrong:** The first regression test file dates from 8 Sept. ~26 test files exist, all mocking the database client (contract tests). The business logic lives in ~200 database functions and triggers with no automated tests; verification is manual `BEGIN … ROLLBACK` dry-runs. No CI workflow in the repository. Playwright is unused scaffolding.
- **Root cause:** RC-14.
- **Rule:** R-QA-02, R-QA-03, R-QA-04 · **Test:** T-QA-02 · **Evidence:** `git log -- 'src/**/*.test.*'`; `src/lib/__tests__/*`; no `.github/`

### BD-F-032 — Frontend state defects
- **Layer:** Frontend · **Sev:** Medium · **Type:** V · **Conf:** H
- **What went wrong:** Mutating objects shared with the query cache (`b017568`); edit-hydration effect re-running and overwriting edits (`7a4f7d6`); refetch-on-focus and auth re-emit remounting forms and losing input (`81d9177`, `2a8e292`, `10c26b4`); two components sharing a query key with different data shapes crashed every DC-return GRN page in production (`dc9f78f`, PR #100); missing imports / TDZ crashes (`777cea3`, `c57d34d`, `f8b6da4`, `cb72a6d`).
- **Root cause:** RC-14 (no type-check, no render tests).
- **Rule:** R-FE-01, R-FE-02, R-QA-01 · **Test:** T-FE-01..02 · **Evidence:** commits above

### BD-F-033 — Polling and notification floods
- **Sev:** Low · **Type:** V · **Conf:** M · **What:** aggressive polling and per-load notifications (`5a880f3`, `f6f25d0`). · **Rule:** R-FE-03 · **Test:** T-FE-03

### BD-F-034 — Breadth-first build; modules later retired
- **Layer:** Delivery process · **Sev:** Medium · **Type:** V · **Conf:** M
- **What went wrong:** Phases 1–10 (BOM, assembly, FAT, sales orders, reorder, scrap…) built 18–19 Mar. Later retired or rebuilt: Component Work Orders, Opening Stock page, invoice testing parts, three dead stage tables, job-card step model.
- **Root cause:** RC-07.
- **Rule:** R-PR-01, R-PR-02 · **Test:** n/a (process gate G-01/G-02) · **Evidence:** `533f61f`..`cf5755b`; governance; `DC_STAGE_FLOW_REDESIGN.md` §2.1; project notes (20 Sept retirements)

### BD-F-035 — Role access defined in three places
- **Sev:** Medium · **Type:** V · **Conf:** M · **What:** route guard map, a hardcoded sidebar list and an unfiltered mobile menu each defined access; a new permission needed three edits and the mobile menu missed one (project notes, 22 Sept; `115f795`, `bd208e2`). · **Rule:** R-SEC-06 · **Test:** T-SEC-05

### BD-F-036 — Scheduled jobs computed in UTC
- **Sev:** Low · **Type:** V · **Conf:** M · **What:** weekly email weekday computed in UTC (`8f14fbe`); a dedicated date utility and test followed (`src/lib/date-ist.test.ts`). · **Rule:** R-DB-15 · **Test:** T-DB-08

### BD-F-037 — Ad-hoc backup/log tables in the exposed schema
- **Sev:** Medium · **Type:** U · **Conf:** H · **What:** dated backup, correction-log and archive tables created during incidents remain in the API-exposed schema; several have no row-level security (see BD-F-009). · **Rule:** R-DB-13 · **Test:** T-SEC-03

### BD-F-038 — Reverse paths built after forward paths
- **Layer:** Business logic · **Sev:** High · **Type:** V · **Conf:** H
- **What went wrong:** GRN delete did not rewind PO received qty (`b21d9b6`); soft delete skipped Stage-1 reversal (`28bb2ed`); DC delete did not reverse job-card stage issues (Sept 18); AWO delete left orphaned issue requests (`891e9c9`); the +4 lesson — reversing a document already compensated manually (governance §3.5).
- **Root cause:** RC-13.
- **Rule:** R-BL-02, R-BL-09 · **Test:** T-BL-01 (forward → reverse → net zero, for every document type) · **Evidence:** commits above; governance §3

### BD-F-039 — Go-live data imported with duplicates; early history unreconcilable
- **Sev:** High · **Type:** V · **Conf:** H · **What:** 38 items with duplicate import lines (79,076 units) corrected in September; records before mid-Sept judged not reconcilable line by line (project notes). · **Root cause:** RC-10 · **Rule:** R-MIG-02, R-MIG-03 · **Test:** T-MIG-01

### BD-F-040 — Material with processing left was consumed by assembly
- **Sev:** High · **Type:** V · **Conf:** H · **What:** every work-order draw of GRN-held material to 26 Nov took parts that still needed further processing (plating, welding). Fixed by route-aware draw (governance B2.4, 26 Nov). Three completed orders left a physical question. · **Root cause:** RC-07 (state "finished" not modelled) · **Rule:** R-BL-10 · **Test:** T-MFG-05

### BD-F-041 — Rounding and precision handled per screen
- **Sev:** Medium · **Type:** V and U · **Conf:** H · **What:** ~15 commits on 15 Jul alone fixed 2-dp display per screen; 113 discrete-unit items carry fractional balances. · **Root cause:** RC-03 (no single formatting/precision policy). · **Rule:** R-DB-14 · **Test:** T-DB-09 · **Evidence:** commits 15 Jul; standards §2

---

## Patterns visible across the catalogue

1. **One effect, two writers** (F-012, 013, 015, 016, 018, 019, 024) is the most expensive class.
2. **Silence** (F-004, 005, 006, 011, 017, 036, 041) turned small defects into months of drift.
3. **Model before modules** (F-001, 018, 021, 023, 027, 034, 040): each forced a redesign with a cutover.
4. **Corrections caused new defects** (F-017 revert, F-025) — data-fix scripts need the same rigour as features.
5. **Process gaps let the rest through** (F-029, 030, 031).
