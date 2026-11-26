# Business Rules Register

A business rule is a statement the business owns ("Rejected units stay on hold until scrapped"). Each rule: owner, date, enforcement point, test. Changing a rule = new version row, never silent edit.

| ID | Rule | Owner (who decided) | Date | Applies to | Enforced where (DB function / constraint / setting) | Block or warn | Test | Version | Supersedes |
|---|---|---|---|---|---|---|---|---|---|
| BR-001 | | | | | | block | T- | 1 | — |

## Settings derived from rules
| Setting key | Value | BR | Changed by | Changed on |
|---|---|---|---|---|
| allow_negative.<transaction_type> | false | BR- | | |
| receipt.over_tolerance_pct | | BR- | | |

## Prompts for rules commonly needed (answer per customer; do not assume)
Negative stock allowed for which transactions? · Over-receipt tolerance? · Who approves count adjustments? · Edit after issue: allowed, and how does stock follow? · When are rejected units written off? · Which document takes goods out (dispatch/invoice)? · Backdating window? · Creator may approve own document?
