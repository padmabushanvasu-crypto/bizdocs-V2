# 14 — Edge-Case Catalogue

Scope: **U** = universal (every ERP) · **A** = adapt to the domain. Invariants refer to `13` §2. Run every U case against every posting operation.

| ID | Scenario | Scope | Prerequisites | Action | Expected outcome | Invariants |
|---|---|---|---|---|---|---|
| EC-01 | Duplicate submission | U | draft doc ready to post | submit twice in parallel | one posting; second returns same result | INV-03 |
| EC-02 | Repeated button clicks | U | form | click Save 5× fast | one document; button disabled while posting | INV-03 |
| EC-03 | Simultaneous users, same item | U | balance 10 | A issues 7, B issues 7 concurrently | one succeeds, other fails with shortage | INV-01, 02 |
| EC-04 | Simultaneous users, same document | U | doc open in two tabs | both edit and save | second save rejected (version check) or merged explicitly; never silent overwrite | INV-05 |
| EC-05 | Interrupted network | U | multi-line post | drop connection after request sent | server completes or rolls back atomically; client retry is idempotent | INV-03, 06 |
| EC-06 | Partial transaction failure | U | line 3 of 5 invalid | post | nothing posted; error names line 3 | INV-06 |
| EC-07 | Incorrect permissions | U | role without permission | call operation directly via API | denied server-side; audit row | — |
| EC-08 | Missing/invalid data | U | line without item / qty 0 / negative | save | rejected with field-level message | — |
| EC-09 | Unexpected document sequence | U | return before issue; QC before inward | attempt | rejected; message names required prior step | — |
| EC-10 | Number boundaries | U | series at 999, 9999; FY end | create | correct padding; new FY series | unique |
| EC-11 | Partial quantities | U | order 100 | receive 30, 30, 40, then 1 | open qty 70/40/0; 1 rejected or tolerance rule | INV-05 |
| EC-12 | Over-receipt within/over tolerance | A | tolerance 5% | receive 104 / 106 | accept / require approval | INV-05 |
| EC-13 | Negative stock | U | balance 0 | issue 1 | blocked unless transaction type allowed by setting; then logged | INV-02 |
| EC-14 | Incorrect unit conversion | A | primary KGS, alt NOS | enter only alt | primary required; no silent conversion | — |
| EC-15 | Fractional discrete units | U | NOS item | 2.5 | rejected | — |
| EC-16 | Cancelled transactions | U | issued doc partly returned | cancel | reverses only un-returned balance; downstream docs handled | INV-01, 04 |
| EC-17 | Reversed transactions | U | posted doc | reverse twice | second reversal rejected | INV-04 |
| EC-18 | Reverse after manual compensation | U | doc + adjustment already made | reverse | nets compensation (or blocks for review) | INV-01 |
| EC-19 | Backdated entries | U | open period, closed period | post with old date | allowed in open period within limit; rejected in closed | — |
| EC-20 | Change to approved record | U | approved PO | change qty/price | returns to approval; history kept | — |
| EC-21 | Edit after downstream documents | U | PO with receipts | delete a received line | blocked; edit allowed in place | INV-05 |
| EC-22 | Historical master-data change | U | item renamed / price changed | view old document | old document shows values as issued | — |
| EC-23 | Deleted/inactive master | U | inactive item | add to new document/recipe | blocked; existing documents still readable | — |
| EC-24 | Duplicate master by spacing/case | U | "AB-1" exists | create "ab-1 " | rejected | unique |
| EC-25 | Large datasets | U | 50k items, 1M ledger rows | list, search, report | complete results, p95 within target | — |
| EC-26 | Lists > API page size | U | 2,500 rows | open every list/picker | all reachable; no silent truncation | — |
| EC-27 | Failed import | U | file with bad rows | import | report of rejected rows; nothing partial unless chosen; re-import idempotent | — |
| EC-28 | Failed integration | U | external system down | send | outbox retries; business posting unaffected | — |
| EC-29 | Interrupted migration | U | backfill stopped midway | re-run | completes once; no duplicates | INV-03 |
| EC-30 | Unexpected shutdown | U | crash during post | restart | each operation fully applied or not at all | INV-01..06 |
| EC-31 | Time zone boundaries | U | 23:30 local = next day UTC | post, report daily | document on local business date | — |
| EC-32 | Same item twice on one document | U | two lines of item A | issue | both lines post; receipts allocate to the right line | INV-06 |
| EC-33 | Same batch split across vendors/operations | A | 100 units | 60 to vendor X, 40 to vendor Y | each tracked; returns credit the right lot | INV-07 |
| EC-34 | Item transformed by processor | A | send A, receive B | receive | mapping required; A relieved, B credited once | INV-01 |
| EC-35 | Rejected units at receipt | A | 100 received, 5 rejected | QC | 5 held, not free; disposition later | INV-01 |
| EC-36 | Consumption of unfinished material | A | part with remaining operation | assembly issue | blocked | — |
| EC-37 | Serial reuse | A | serial on cancelled order | reuse | allowed; duplicate active serial blocked | unique |
| EC-38 | Session expiry mid-form | U | long form | token expires, save | re-auth without losing form | — |
| EC-39 | Mobile vs desktop permissions | U | restricted role on mobile | open restricted page | blocked same as desktop | — |
| EC-40 | Rounding of totals | U | 3 lines × 0.333 | total | computed on full precision; displayed rounded | — |
