# 20 — Known Limitations, Self-Review and Unresolved Questions

## 1. Limitations of the evidence

| Limitation | Effect |
|---|---|
| No issue tracker, production logs, error-tracking history or Vercel build history were available | Failures that were reported verbally and fixed without a descriptive commit are under-represented |
| Original development conversations were not read; the owner's project notes (secondary summaries) were used | Figures quoted from notes (e.g. 217 items, 190,000 units, 34,433 units) were not re-verified against data |
| Live database: only migration **names** and security-advisor output were read; no function bodies, no data | Claims about current function behaviour rely on governance docs and commit text |
| Commit messages are the author's account (often AI-written) | Root causes in commit bodies were accepted at face value where consistent with governance docs |
| Migration history between 3 Apr and 18 Aug is absent from the live record | Schema evolution in that window is known only from repo files and commits |
| One customer, one industry | Universal claims are reasoned from one system plus general ERP practice; see category B caveats in `05` |
| Advisor findings not exploit-tested | BD-F-009 severity assumes default API grants; verify |

## 2. Adversarial self-review

**This is a self-review by the same agent that wrote the documents. It is not an independent review.** An independent reviewer (ideally a database engineer and a manufacturing operations person) should repeat it.

| Perspective | Challenge | Finding | Action taken |
|---|---|---|---|
| Principal architect | Is "put logic in the database" an inherited BizDocs stack bias presented as universal? | Yes, partly. The universal rule is one server-side transaction per operation and DB-level constraints; stored procedures are one option | `06` §1 amended: logic location is an ADR; transaction rule mandatory |
| Principal architect | Overengineering for a solo owner + AI? 67 rules, 10 gates | Real risk of ceremony nobody runs | Added "Minimum viable enforcement" (10 checks) to `16` |
| Database reliability | Running-balance and lock-order rules sufficient for concurrency? | Adequate for postings; nothing on statement timeouts, long transactions, connection limits | Listed as gap (§3 GAP-03) |
| Database reliability | Invariant template assumes a from/to single-row ledger | True; other ledger shapes need rewriting | Template header states assumed shapes |
| Cybersecurity | Is the playbook itself leaking? | The BizDocs repository is **public**; incident history and project identifiers are already public. Specific vulnerable objects were withheld from these docs | BD-F-009 written at class level; detail given to owner privately |
| Cybersecurity | Missing topics | Rate limiting, audit-log tamper resistance, personal-data handling, device loss on shop floor | Listed as gaps (§3) |
| Manufacturing operations | Will "fail loud" stop the shop floor? | Yes if applied without escape routes. BizDocs needed allowed over-issue for sub-assemblies and "post and flag" for some shortages | R-BL-08 makes block/warn a recorded business rule and a setting; emphasised in review |
| Manufacturing operations | Barcode/scanning, label printing, shift handover, multilingual UI not covered | Gap | Listed (§3) |
| QA engineer | Tests are specified, not implemented | True — T-* IDs are specifications | Stated in `13` and here; starter-kit stage-9 prompt requires implementing them |
| QA engineer | Heuristic CI checks produce false positives | Verified: clamp and loop checks flagged display code and chunked imports in BizDocs | Documented in `rules/checks/README.md` with whitelist markers |
| Production support | Who receives the nightly invariant alert and what they do | Not specified | Added to Q-06 |
| New developer | Too many documents? | 21 docs + 21 templates | `00-START-HERE.md` gives a 20-minute reading path; CLAUDE.md template ≤ 120 lines |
| All | Industry assumptions presented as universal | Found two: R-BL-02 ("every transition reversible") and R-BL-04 ("all status derived") were too absolute | Both amended (irreversible-by-declaration; human decisions as events) |
| All | Unsupported figures | F-029 "~120 September migrations" was an estimate | Recounted from the live list and reworded "over 100" |
| All | Severity count arithmetic | Initial summary miscounted | Corrected to 12 / 19 / 8 / 2 |

## 3. Known gaps in the playbook (not yet covered)

| ID | Gap |
|---|---|
| GAP-01 | Barcode/RFID, label printing, scanner workflows |
| GAP-02 | Offline-first shop-floor operation and sync conflict rules (only mentioned in `06`) |
| GAP-03 | DB operational tuning: statement timeouts, connection pooling, long-running reports |
| GAP-04 | Personal-data protection, retention and deletion obligations |
| GAP-05 | Rate limiting / abuse protection on the API |
| GAP-06 | Costing method implementation detail (standard vs average vs FIFO) |
| GAP-07 | Statutory e-invoicing / e-way-bill integrations (jurisdiction-specific) |
| GAP-08 | Planning (MRP) — BizDocs had reorder alerts only |
| GAP-09 | Multilingual UI and low-literacy design patterns |

## 4. Unresolved questions for the owner

| ID | Question | Why it matters |
|---|---|---|
| Q-01 | ~~Remediate advisor findings~~ — done 26 Nov 2026 (BD-F-009) | — |
| Q-02 | ~~Make `bizdocs-V2` private~~ — owner approved 26 Nov 2026 | R-SEC-07 |
| Q-03 | ~~Server-side PO/DC approval~~ — DC was partly enforced; both enforced 26 Nov 2026 | BD-F-007 |
| Q-04 | Is the DB-side auto-link of DC lines to an unambiguous job card (live migration, 21 Sept) still active and intended? | BD-F-024 consistency |
| Q-05 | For the next ERP: single-tenant per customer confirmed? On-premise or cloud? | ADR-002 default in `06` §8 |
| Q-06 | Who receives nightly invariant alerts, and what is the response time? | `15` §6 |
| Q-07 | Is a full accounting ledger ever in scope for the next customers, or always export to their accounting system? | `08` §9 |
| Q-09 | When will the OLTC Dashboard sign in with its own read-only account so the last 7 anonymous read policies can be dropped? | BD-F-042 |
| Q-08 | Should the 344 historical double-credited GRN lines (project notes, 24 Sept) be included in the BizDocs debt register as Critical? | TD-15 severity |

## 5. Areas needing human or independent technical review

- `06` and `07` defaults (architecture and DB) — database engineer.
- `08` §8 manufacturing safeguards and `14` A-scope cases — manufacturing operations person from the next customer's industry.
- `09` — security reviewer, including a test of the live BizDocs exposure.
- `13` test harness choice — whoever will maintain CI.
- `rules/checks/*` — before relying on them as merge gates.
