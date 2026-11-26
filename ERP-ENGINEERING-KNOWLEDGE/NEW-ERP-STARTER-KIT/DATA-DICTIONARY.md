# Data Dictionary

Updated in the same change as every migration. The **Writer** column is the single-writer map (R-DB-01): for derived columns it names the one trigger/function allowed to write them.

## Tables
| Table | Owning module | Purpose | Tenant key | RLS policy | Soft delete | Audit cols |
|---|---|---|---|---|---|---|

## Columns
| Table.column | Type | Unit/precision | Nullable | Default | Meaning (one meaning only) | Derived? | Writer | FK → (ON DELETE) | Constraints |
|---|---|---|---|---|---|---|---|---|---|
| stock_ledger.qty | numeric(18,4) | item primary unit | no | — | quantity moved, > 0 | no | posting function only | — | CHECK qty > 0 |
| stock_position.qty | numeric(18,4) | primary unit | no | 0 | balance per item/state | **yes** | trigger `trg_ledger_to_position` | — | CHECK ≥ 0 unless allowed |

## Movement states
| State | Meaning | Counts as usable stock? | Counts in valuation? |
|---|---|---|---|

## Movement table (event → transition → document)
| Event | transaction_type | from → to | Recording document (one only) | Reverse event |
|---|---|---|---|---|

## Invariant views
| View | Asserts | Expected rows |
|---|---|---|
| inv_01_position_drift | cache = ledger | 0 |

## Deprecated / legacy
| Column | Replaced by | Writers stopped on | Readers migrated on | Drop on |
|---|---|---|---|---|
