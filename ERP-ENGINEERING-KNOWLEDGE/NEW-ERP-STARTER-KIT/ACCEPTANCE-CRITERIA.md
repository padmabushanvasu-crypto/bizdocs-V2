# Acceptance Criteria

Write before coding. Every feature that changes quantities needs at least: one happy path, one guard failure, one idempotency case, one reverse path.

## Template
**AC-<###> (FR-<###>)** — <title>
- **Given** <state: documents, balances, role>
- **When** <action>
- **Then** <observable result: document state, balances per state, messages>
- **And invariants:** INV-01, INV-03 … return zero rows
- **Test:** T-<id>

## Example set (adapt)
**AC-001** Receive partial quantity
- Given PO line 100 units approved; role inward
- When receipt of 40 is posted
- Then open qty = 60; 40 in `held_for_qc` (or `free` if no QC); one ledger row
- And INV-01, INV-03 = 0

**AC-002** Duplicate submit
- Given AC-001 receipt draft
- When post is submitted twice concurrently
- Then one posting; second call returns the same receipt; no error shown to user

**AC-003** Over-receipt beyond tolerance
- Given tolerance 5%; 100 ordered, 100 received
- When receipt of 6 is posted
- Then blocked with message naming the tolerance and approver

**AC-004** Reverse
- Given AC-001 posted and nothing issued from it
- When receipt is cancelled
- Then open qty = 100; held/free reduced by 40; reversal row references original
