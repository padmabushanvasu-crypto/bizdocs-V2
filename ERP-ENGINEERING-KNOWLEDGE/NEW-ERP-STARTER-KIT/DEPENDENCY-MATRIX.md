# Dependency Matrix

Review before any change to a document type: "trace both directions" — what does it depend on, and what depends on it, including on edit, cancel, delete and reversal.

## Document dependencies
| Document | Reads (masters/docs) | Posts (movements) | Referenced by | If edited after posting | If cancelled | If deleted (draft) |
|---|---|---|---|---|---|---|
| PO | items, parties | none | receipts | received lines locked; others in place | blocked if received; else status cancelled | allowed |
| Receipt | PO lines | incoming → held/free | issues, returns, invoices | DB nets difference | reverse un-consumed qty | allowed |

## Shared values and their single writer
| Value | Writer | Readers |
|---|---|---|

## Module seams (where double effects happen)
| Seam | Owning module of the effect | The other module must |
|---|---|---|
| receipt → inventory | Inventory | call posting; never update balance |
| invoice ↔ dispatch | (decide in ADR-004) | be informational |
