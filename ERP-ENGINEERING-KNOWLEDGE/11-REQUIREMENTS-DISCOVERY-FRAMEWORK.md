# 11 — Requirements Discovery Framework

Goal: no production code until the movement model, document lifecycles, roles and exceptions are known. Questionnaire: `NEW-ERP-STARTER-KIT/BUSINESS-DISCOVERY-QUESTIONNAIRE.md`.

## 1. Rule for AI sessions

**Claude must not invent requirements.** When a behaviour is not stated by the customer, record it as an open question (`Q-###` in the requirements register) with the options and their consequences. Implementation waits, or proceeds behind a default-off setting only if the owner approves.

## 2. Steps

| Step | Activity | Output |
|---|---|---|
| 1 | Stakeholder map: owner, department heads, daily users per role, IT, accountant | stakeholder list with decision rights |
| 2 | Walk the floor: follow one real order from enquiry to dispatch; follow one purchased part from PO to consumption; follow one subcontracted part | process maps with real document samples |
| 3 | Departmental interviews (questionnaire sections) | answers, pain points, exceptions |
| 4 | Collect real documents: POs, challans, GRNs, job cards, prints, spreadsheets in use | document inventory |
| 5 | Exceptions workshop: partial, rejected, returned, reworked, cancelled, edited after issue, backdated, wrong item, wrong unit | exception catalogue |
| 6 | Data audit: existing masters (item codes, units, duplicates), opening balances, volumes | data quality report, volume estimates |
| 7 | Model draft: domain model, state machines, movement states and transitions, single-writer map | model pack |
| 8 | Walk-through with realistic data (≥ 3 real scenarios per flow including one reverse path) | signed walk-through record |
| 9 | Permission matrix, approvals, separation of duties | permission matrix |
| 10 | Non-functional requirements: users, volumes, offline needs, response times, backup/RPO/RTO, deployment | NFR list |

## 3. Translating findings into artefacts

| Finding | Artefact (starter kit) |
|---|---|
| What the system must do | Functional requirement `FR-###` in REQUIREMENTS-REGISTER |
| Quality attributes | `NFR-###` |
| Rules ("rejected units are not written off until scrapped") | `BR-###` in BUSINESS-RULES-REGISTER with owner and date |
| Processes | process map per flow |
| Concepts and relationships | domain model in DATA-DICTIONARY |
| Document behaviour | state machine in MODULE-SPECIFICATION |
| Who can do what | PERMISSION-MATRIX |
| Fields | DATA-DICTIONARY (type, unit, owner, derived?) |
| Done-ness | ACCEPTANCE-CRITERIA (Given/When/Then incl. reverse paths) |
| Links | traceability FR → BR → module → test |

## 4. Must be resolved before development

1. Which document records each physical movement (receipt into store, issue, return, consumption, goods leaving) — **one per movement**.
2. Movement states (e.g. incoming, held for QC, free, at processor, in WIP, finished, rejected-hold, scrapped, dispatched).
3. Units: primary unit per item class; whether alternate units exist; whether conversion is by factor or by recorded actuals.
4. Batch/lot/serial needs and at what level.
5. Whether material moves through routed operations and whether partial batches split.
6. Edit/cancel rules for every document after it affects stock.
7. Whether negative stock is ever allowed, for which transactions.
8. Roles, approvals, separation of duties.
9. Deployment: single-tenant, on-premise or cloud, offline needs.
10. Accounting boundary: operational ERP with export vs full accounting.
11. Opening balances: source, date, who counts.
12. Numbering series and FY.

## 5. May be deferred (with a recorded default)

Report layouts beyond the core prints · dashboards · e-mail digests · vendor scorecards · foreign currency (if not used now) · analytics · non-core masters · notification preferences.

## 6. Red flags in discovery

- "We'll figure out the flow once we see the screens" → BD-F-034 pattern.
- Two departments describe the same event differently → model conflict; resolve before build.
- A flag that "means it's done" → ask what "done" means for every consumer (BD-F-021).
- "The office enters it later" → after-the-fact recording; design for actuals, not prescriptions (BD-F-027).
- Existing spreadsheets with duplicate codes → master-data cleanup is a go-live task, not a later one (BD-F-028, F-039).
