# 00 — Start Here

Institutional engineering knowledge from BizDocs, packaged for building **different** ERPs. It carries engineering lessons, not BizDocs business requirements.

## If you are starting a new ERP
1. Read `01-EXECUTIVE-SUMMARY.md` (5 min).
2. Follow `NEW-ERP-STARTER-KIT/README.md` to copy the kit into the new repository.
3. Paste `NEW-ERP-STARTER-KIT/NEW-PROJECT-INITIALIZATION-PROMPT.md` into the first Claude Code session.
4. Work through the stages in `12-ERP-DEVELOPMENT-METHODOLOGY.md`; pass each gate in `16`.

## If you want to understand what went wrong in BizDocs
`02` retrospective → `03` failure catalogue → `04` root causes → `19` traceability.

## Twenty-minute reading path for a new developer or AI session
`01` → `04` (table only) → `06` §1–3 → `07` rules table → `08` rules table → `09` §1–2 → `13` §2–3 → `17` §2.

## Documents

| # | Document | Reusable in a new ERP? |
|---|---|---|
| 00 | Start here | — |
| 01 | Executive summary | — |
| 02 | BizDocs engineering retrospective | No (history) |
| 03 | Failure catalogue (`BD-F-###`) | Reference |
| 04 | Root-cause analysis (`RC-##`) | Reference |
| 05 | Universal vs specific classification | Checklist only |
| 06 | Architecture blueprint | Yes |
| 07 | Database engineering standards | Yes |
| 08 | Business logic and data integrity | Yes |
| 09 | Security and permissions | Yes |
| 10 | UX and operational design | Yes |
| 11 | Requirements discovery framework | Yes |
| 12 | Development methodology (18 stages) | Yes |
| 13 | Testing and regression framework | Yes |
| 14 | Edge-case catalogue | Yes |
| 15 | Production readiness | Yes |
| 16 | Quality gates | Yes |
| 17 | AI-assisted development governance | Yes |
| 18 | Anti-patterns (Part 1) / BizDocs debt (Part 2) | Part 1 yes |
| 19 | Evidence and traceability register | Reference |
| 20 | Limitations, self-review, open questions | — |
| — | `PROGRESS-REGISTER.md` | Resume point for this exercise |
| — | `NEW-ERP-STARTER-KIT/` | Copy into new repos |

## ID scheme (permanent)
`BD-F-###` failures · `RC-##` root causes · `R-<AREA>-##` rules · `T-<AREA>-##` tests · `EC-##` edge cases · `G-##` gates · `PR-##` readiness criteria · `AP-##` anti-patterns · `TD-##` BizDocs debt · `Q-##` open questions. Never renumber; retire with a note.

## Confidentiality
The BizDocs repository is public. These documents contain no customer, vendor or staff details beyond what was already in the repository. Security-sensitive specifics were withheld while open; BD-F-009 was fixed on 26 Nov 2026 before being described in detail.
