# 10 — UX and Operational Design

Principles extracted from what worked and failed in BizDocs, for shop-floor users with limited ERP experience. Visual design is not prescribed.

## 1. Principles (each with BizDocs evidence)

| ID | Principle | Evidence |
|---|---|---|
| UX-01 | **Tell the user the next action, in their words.** Every pending line shows what happens next ("Not finished — still needs plating. Send on the next DC; not for assembly.") | `v_grn_line_next_action` (governance B2.7) |
| UX-02 | **Errors say where the material is and what to do.** "Only 40 in Store; 12 on GRN-123 awaiting QC; 30 on job card JW-45 at stage 6." | shortage messages naming job cards (live migration `dc_plain_lines_shortage_points_to_job_card`) |
| UX-03 | **No extra work for reconciliation.** Derive truth from what users already record; never add confirmation sheets or screens to fix system problems | owner's stated rule (project notes, Nov 2026) |
| UX-04 | **Defaults must not hide records.** List filters default to "All"; a default "this month" filter repeatedly made work look missing | `6af4bc4`, `7a47567`, `35e9b38`, `c046d56` |
| UX-05 | **Labels describe the stock effect.** "Post Goods Receipt", "Post to Store", "Issued on DC-x"; do not call a step "Store Confirmation" if it does not move stock to store | owner decision 28 Sept; queue renames `ccc3bd5`, `66d9226`, `24d4100` |
| UX-06 | **Plain-language status, one vocabulary.** Shared status badge component; same words on every page | `1b058d8` |
| UX-07 | **System-generated fields look read-only.** Document numbers, computed quantities | `a10a794` |
| UX-08 | **Destructive actions only from the detail page, with a dialog stating the effect.** "Deleting this DC returns 120 units to Store and reverses stage 6 on JW-45." | `c60952d`, `4d02acb` |
| UX-09 | **Inert by default.** New options off; daily workflows keep their behaviour until the user opts in | CLAUDE.md §3.5 |
| UX-10 | **Never pre-tick or auto-select a business choice.** Suggest (group "Suggested" above search results), do not decide | `954d412`, `21678cf`, suggestions design (PR #94) |
| UX-11 | **Forms survive interruptions.** Switching tabs, refocus or token refresh must not reset a form | `81d9177`, `2a8e292` |
| UX-12 | **One screen per job, not per table.** Single-screen raw-material conversion replaced multi-step staged approvals | PR #86/#94 |
| UX-13 | **Show quantities with their unit, at the right precision.** Unit next to every quantity; discrete units without decimals | `7ca6bd5`, standards §2 |
| UX-14 | **Prints are business documents.** Fixed layout per paper size, signatures, duplicate copy, light mode always | ~25 print commits Apr |
| UX-15 | **Mobile is first-class for floor roles,** with the same permissions as desktop | `5754248`, F-035 |

## 2. Component guidance

| Element | Guidance |
|---|---|
| Navigation | Group by daily job (Receive, Issue, Produce, Dispatch), not by table; role-filtered from the single permission source |
| Forms | Required fields marked; item picker searches code, drawing and description; show available quantity next to the qty field; validate on blur and on submit; never lose input |
| Search & filters | Server-side search on document number, party, item; filters persist per user; "All" default; result count shown |
| Tables | Sticky header; totals computed on full precision; pagination with total count; column for status and next action |
| Status indicators | Colour + text (never colour alone); consistent across pages |
| Approval interfaces | Queue with age; approve/reject with mandatory comment on reject; show what changed since last approval |
| Dashboards | Exceptions first (negative stock, overdue returns, pending QC age); each tile links to the filtered list |
| Error messages | Business message from the DB + suggested action; technical detail collapsible |
| Empty states | Say why empty and what to do ("No GRNs awaiting store. New receipts appear here after QC.") |
| Loading states | Skeletons for lists; disable submit while posting; show "Posting…" |
| Confirmations | Only for destructive or irreversible actions; state the effect in numbers |
| Keyboard | Tab order follows paper form; Enter to add line; shortcuts for save |
| Bulk operations | Preview with counts; all-or-nothing; result report |
| Import/export | Template download; validation report before commit; export = what's on screen with filters stated |
| Onboarding | Role-specific "how to" pages; first-week checklist per role |

## 3. Usability acceptance (gate G-08 inputs)

- A new user of each role completes their top 3 daily tasks with no help after a 30-minute walkthrough.
- Every error message seen in UAT is understandable to the floor user (record any that were not).
- No task needs more than one screen unless it is genuinely multi-step in the real process.
- Same task on mobile works for floor roles.
