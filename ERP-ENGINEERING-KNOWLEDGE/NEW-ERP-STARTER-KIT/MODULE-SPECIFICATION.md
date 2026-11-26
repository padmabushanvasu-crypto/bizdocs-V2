# Module Specification — <Module>

Copy per module to `docs/modules/<module>.md`. Gate G-04 uses this file.

## 1. Purpose and requirements
FR/BR IDs covered.

## 2. Documents
| Document | Header fields | Line fields | Numbering series |
|---|---|---|---|

## 3. State machine
| From | To | Operation (DB function) | Who (permission) | Guard | Postings |
|---|---|---|---|---|---|
| draft | posted | `post_<doc>(id)` | `<doc>.post` | lines valid, stock available | `posting(...)` per line |
| posted | cancelled | `cancel_<doc>(id, reason)` | `<doc>.cancel` | not fully consumed downstream | reverse un-consumed balance |

Editable fields per state:

## 4. Operations
| Operation | Inputs | Transaction contents | Idempotency key | Errors (code → message) | Reverse operation |
|---|---|---|---|---|---|

## 5. Reverse paths (mandatory)
| Path | Effect on stock | Effect on downstream documents | Blocked when |
|---|---|---|---|
| Edit after posting | | | |
| Cancel | | | |
| Delete (draft only) | none | | |
| Reverse | | | |

## 6. Derived values
| Value | Computed by | Stored? (ADR if yes) |
|---|---|---|

## 7. Dependencies
Reads from / posts to / referenced by (update DEPENDENCY-MATRIX.md).

## 8. UI
Screens, next-action messages, errors shown, mobile needs, prints.

## 9. Acceptance criteria
Link ACCEPTANCE-CRITERIA.md entries.

## 10. Tests
| Test ID | Type (db/unit/e2e/perm) | Covers |
|---|---|---|

## 11. Open questions
Q-### links.
