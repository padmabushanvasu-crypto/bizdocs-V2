# Risk Register

| ID | Risk | Category (data/security/delivery/ops/business) | Likelihood (1–5) | Impact (1–5) | Score | Owner | Mitigation / control | Trigger to act | Status | Accepted by / date / expiry |
|---|---|---|---|---|---|---|---|---|---|---|
| RSK-001 | Master data duplicates at import cause phantom shortages | data | 4 | 4 | 16 | | normalised unique keys; import reconciliation (R-DB-08, R-MIG-02) | any duplicate rejected count > 0 | open | |
| RSK-002 | Movement model wrong for subcontracted operations | business | 3 | 5 | 15 | | walk-through at G-02 | exception unmapped | open | |
| RSK-003 | Opening balances inaccurate | data | 4 | 4 | 16 | | physical count at baseline date; owner sign-off | variance at first cycle count | open | |
| RSK-004 | Authorization bypass via API | security | 3 | 5 | 15 | | R-SEC-01..04; T-SEC-01..04 | advisor ERROR | open | |
| RSK-005 | Schema drift between repo and production | ops | 3 | 4 | 12 | | R-DB-09 CI diff | diff non-empty | open | |

Accepted risks expire; review at every gate.
