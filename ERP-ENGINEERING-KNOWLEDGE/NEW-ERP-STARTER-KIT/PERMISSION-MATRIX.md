# Permission Matrix

**Single source of truth (R-SEC-06).** Generate from this table (or from the DB table it describes): DB role checks, route guards, desktop and mobile navigation, button visibility, and the permission tests (T-SEC-01).

## Roles
| Role | Who | Notes |
|---|---|---|

## Operations × roles
✔ = allowed · — = denied · T = allowed up to threshold (see settings) · A = approve only

| Permission key | Operation | admin | purchase | inward | qc | store | production | finance | viewer |
|---|---|---|---|---|---|---|---|---|---|
| po.create | create PO | ✔ | ✔ | — | — | — | — | — | — |
| po.approve | approve PO | ✔ | — | — | — | — | — | T | — |

## Data visibility
| Data | Roles that may see | Enforcement (policy / view) |
|---|---|---|
| unit prices, costs | | |

## Separation of duties
| Rule | Enforced by |
|---|---|
| creator ≠ approver for PO | function check |

## Default
Unknown or missing role → no access (R-SEC-05).
