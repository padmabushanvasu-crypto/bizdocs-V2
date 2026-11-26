# 06 — ERP Architecture Blueprint (technology-agnostic)

Rule IDs refer to `NEW-ERP-STARTER-KIT/rules/engineering-rules.yaml`. "MUST" items are enforced by a gate in `16`.

## 1. Default shape: a modular monolith with a database that enforces invariants

For a custom ERP for one manufacturer, built by a small team with AI assistance, the default is:

```
 Browser UI ──► Application API layer ──► Database
 (forms,         (thin: auth context,        (schema, constraints, posting
  lists,          input validation,           functions, triggers, views,
  prints)         calls ONE operation          row-level security, audit)
                  per user intent)
```

- **The database is the system of record and the last line of defence.** Constraints, single posting functions, derived-value maintenance and authorization live there (R-DB-01, R-DB-02, R-SEC-01).
- **Where the logic lives is a stack decision (ADR-001); the transaction rule is not.** BizDocs put operations in Postgres functions, which made atomicity easy but testing and versioning harder (BD-F-029, F-031). An application service layer that owns one DB transaction per operation is equally valid. What is mandatory: constraints, uniqueness, ledger immutability and cache maintenance in the DB; one transaction per operation on the server; nothing multi-step in the browser.
- **One business operation = one server-side transaction**, named after the user's intent: `issue_delivery_challan`, `confirm_store_receipt`, `reverse_conversion` (R-DB-02).
- **The UI never computes stock, status, balances or numbers**; it displays them and submits intents.

### When to choose something else

| Condition | Choose | Why |
|---|---|---|
| One customer per deployment, < ~200 users, one plant | Modular monolith (default) | Lowest operational cost; one transaction boundary |
| Several plants with intermittent connectivity | Monolith + local site deployment with defined sync of masters/documents | Shop floor must keep working offline; design sync explicitly, never ad hoc |
| Heavy integration (accounting, e-invoicing, machines/IoT) | Monolith + integration module with an outbox table and retries | Keeps external failures out of the posting transaction |
| Multiple product lines sold as SaaS to many customers | Multi-tenant with tenant key in every table and RLS, or schema/database per tenant | Only then. Single-tenant deployments remove a whole risk class (cross-tenant reads) |
| Separate teams owning separate domains at scale | Services | Not justified for a single-customer ERP; distributed transactions make stock integrity harder |

Avoid by default: microservices, event sourcing as the primary store, CQRS frameworks, a generic workflow engine. Each adds failure modes the business does not need. Record any deviation in an ADR.

## 2. Domain boundaries (manufacturing ERP)

Define modules by ownership of data and invariants, not by screens.

| Module | Owns | Publishes to others |
|---|---|---|
| Master data | items, units, BOMs, routes, parties, locations, users/roles | read-only references |
| Procurement | PO, approvals, vendor terms | open quantities |
| Receiving & QC | receipt documents, inspection results, dispositions | accepted quantity → Inventory |
| Inventory | **movement ledger, positions, counts, adjustments** | positions, availability |
| Subcontracting | outward/return documents, processor charges | movements via Inventory |
| Production | work orders, operation ledger, material issue, output | movements via Inventory |
| Quality | NC records, rework/scrap decisions | movements via Inventory |
| Sales & dispatch | orders, dispatch records, invoices | the single goods-leave event via Inventory |
| Finance interface | valuation, cost, export to accounting | — |
| Platform | numbering, audit, notifications, prints, imports | — |

**Inventory is the only module that writes movements.** Every other module calls its posting function. This single rule would have prevented F-012..016 and F-018.

## 3. Layer responsibilities

| Layer | Must | Must not |
|---|---|---|
| Database | constraints (FK, unique, check), posting functions, derived-value triggers, RLS, audit columns, invariant views | contain presentation formatting |
| API / server | authenticate, validate input shape, call one operation, map errors to messages | orchestrate several writes; compute stock |
| UI | collect intent, show state, prevent obvious errors early, confirm destructive actions | be the only place a rule is enforced |
| Jobs | scheduled reports, drift checks, e-mails, using the company's time zone | post business movements except through the same posting functions |

## 4. Shared services

Numbering (DB trigger + lock + unique index) · audit trail (who/when/what on every business table) · document state machine helper · print/PDF service from one template set · import pipeline (stage → validate → report → commit) · notification outbox · paginated fetch helper · error-message catalogue (business-readable).

## 5. Module communication

- Synchronous call into the owning module's operation inside the same transaction when the effect must be atomic (e.g. receipt confirm → inventory posting).
- Outbox table + worker for anything external (e-mail, accounting, e-invoice). Never call an external system inside a posting transaction.
- No module writes another module's tables directly. Enforce with DB grants or at least with a code-review rule and a grep check in CI.

## 6. Configuration management

- Business parameters (tolerances, approval thresholds, allow-negative per transaction type, FY start, time zone, prefixes) in a settings table with audit and an owner — not in code.
- Feature flags for behaviour changes on daily workflows, default **off** (inert by default).
- Environment configuration (URLs, keys) per deployment; secrets only server-side.

## 7. Error handling

1. Database raises with a stable error code and a business message ("Only 40 available in Store; 12 more are on GRN-123 awaiting QC").
2. The API maps codes to messages; never hides them.
3. The UI shows the message where the user acts; never a generic "Something went wrong" for a business rule.
4. Unexpected errors go to error tracking with the operation name and document id.

## 8. Independent customer deployments

Each customer gets: own database, own app deployment, own secrets, own backups, own release schedule. Shared code comes from a versioned template, not from copying a running customer's repo. Customer-specific behaviour lives in settings, configuration tables or clearly marked extension modules.

## 9. Extensibility and maintainability

- Prefer **adding** a transaction type, state or settings value over adding a branch in an existing posting function.
- Keep the posting function small and generic; put document-specific logic in the document's operation, which then calls posting.
- Every new table: owner module, RLS, audit columns, FK policy, and an entry in the data dictionary — enforced at G-03.
- Deprecations: mark, stop writing, migrate readers, drop — tracked in the debt register.

## 10. Architecture acceptance checklist (gate G-02)

- [ ] Module map with data ownership; Inventory is sole movement writer
- [ ] List of business operations, each one transaction, each with its reverse operation
- [ ] State machines for every document
- [ ] Single-writer map for every derived value
- [ ] Authorization model (roles × operations) enforced server-side
- [ ] Deployment model and backup/restore approach
- [ ] ADRs for every Category B pattern adopted and every deviation from §1
