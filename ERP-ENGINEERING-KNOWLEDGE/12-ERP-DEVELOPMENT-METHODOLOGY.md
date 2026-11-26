# 12 — ERP Development Methodology

Eighteen stages, grouped into five gated phases. Gate IDs refer to `16`. The key ordering lesson from BizDocs: **ledger, states, posting function and reverse paths come before any document screen** (BD-F-001, RC-07).

```
DISCOVER (1–3) ─G-01─► DESIGN (4–8) ─G-02,G-03,G-06a─► FOUNDATION (9) ─► BUILD (10–12, per module: G-04, G-05)
 ─► PROVE (13–15: G-07, G-08) ─G-09─► OPERATE (16–18: G-10 each release)
```

Each stage: **Objective · Inputs · Deliverables · Validation · Acceptance · Depends on · Common failures · Blocks progression if**

### 1. Business discovery
- **Obj:** understand real flows and exceptions. **In:** stakeholders, real documents. **Del:** process maps, exception catalogue, data audit (`11`).
- **Val:** floor walk of one order, one purchase, one subcontract. **Acc:** every flow has an owner who confirmed the map.
- **Fail:** discovery done from screenshots of the old system only. **Blocks if:** any §11.4 question unanswered.

### 2. Requirements validation
- **Obj:** turn findings into FR/NFR/BR with IDs. **Del:** registers. **Val:** read-back session with each department. **Acc:** each BR has owner + date. **Fail:** AI-invented rules (R-AI-05). **Blocks if:** an unresolved Q affects stock or money.

### 3. Scope definition
- **Obj:** decide v1 modules and what is excluded. **Del:** project charter with in/out list, accounting boundary. **Acc:** owner sign-off. **Fail:** breadth-first scope (BD-F-034). **Blocks if:** v1 includes a module whose flow is not mapped. → **Gate G-01**

### 4. Domain modelling
- **Obj:** entities, movement states, transitions, documents and which one records each movement. **Del:** domain model, state machines, movement table (event → from → to → document). **Val:** realistic-data walk-through incl. reverse paths (T-SIM-01 on paper). **Acc:** every exception from stage 1 maps to a transition. **Fail:** stage/batch, sale event or "finished" not modelled (BD-F-018, 023, 040). **Blocks if:** any movement has two candidate documents.

### 5. Architectural planning
- **Obj:** module boundaries, operations list, deployment model. **Del:** architecture doc + ADRs (`06`). **Acc:** checklist `06` §10. → **Gate G-02**

### 6. Database design
- **Obj:** schema with constraints, posting function, single-writer map. **Del:** migrations (not applied to prod), data dictionary, invariant views. **Val:** schema review checklist (`07`). **Acc:** every derived column has one writer; every table has RLS/FK policy. **Fail:** delete+reinsert children, snapshots, overloaded flags. → **Gate G-03**

### 7. Security design
- **Obj:** roles, permission matrix, policies. **Del:** permission matrix, policy tests. **Acc:** `09` §5 items designed. → **Gate G-06a (design)**

### 8. UX and workflow prototyping
- **Obj:** clickable or paper prototypes of daily tasks. **Del:** prototypes per role. **Val:** users perform tasks on the prototype. **Acc:** top-3 tasks per role accepted. **Fail:** UI designed before the model (screens drive schema).

### 9. Foundational infrastructure
- **Obj:** repo, CI, environments, numbering, audit, posting function, paginated fetch, error catalogue, auth. **Del:** working skeleton with CI gates (strict type-check, lint, unit + DB tests, migration drift, advisor). **Acc:** a dummy movement posts, reverses and passes invariants in CI. **Blocks if:** CI cannot build a fresh DB from migrations.

### 10. Module development (repeat per module, vertical slice)
- **Obj:** one module end to end: schema → operations (forward + reverse) → DB tests → UI → prints. **Del:** module spec, code, tests, docs. **Acc:** module acceptance criteria incl. reverse paths; invariants zero. **Fail:** forward-only (BD-F-038); placeholder presented as done. → **Gate G-04**

### 11. Inter-module integration
- **Obj:** flows across modules (PO → receipt → store → issue → production → dispatch). **Del:** end-to-end tests per flow. **Acc:** each flow + each reverse path nets to correct positions. **Fail:** double effect at module seams (BD-F-012, 013, 018). → **Gate G-05**

### 12. Automated testing
- Continuous from stage 9; this stage closes coverage gaps per `13`: every BR has a test, every rule in `engineering-rules.yaml` marked "test" has one.

### 13. Realistic data simulation
- **Obj:** run months of synthetic but realistic activity (volumes from discovery, exceptions mixed in, concurrent users). **Del:** simulation report: invariants, performance, data quality. **Acc:** zero invariant violations; p95 response targets met at 3-year volume. **Fail:** only happy-path demo data (BD-F-003, 004 appeared at 1,000). → **Gate G-07**

### 14. User acceptance testing
- **Obj:** each role runs real scenarios incl. exceptions. **Del:** UAT log, defects, sign-off. **Acc:** no open Critical/High; usability criteria `10` §3. → **Gate G-08**

### 15. Data migration
- **Obj:** masters and opening balances loaded. **Del:** cleaned masters (no duplicates, units verified), opening balances as of one baseline date, reconciliation report. **Val:** dry-run twice in staging; second run posts zero (T-MIG-02); counts reconcile to source. **Acc:** owner signs the opening position. **Fail:** BD-F-039. **Blocks if:** any unexplained difference.

### 16. Production deployment
- **Obj:** go-live. **Del:** runbook, rollback plan, backups verified, monitoring on. → **Gate G-09** (`15`)

### 17. Post-deployment monitoring
- **Obj:** detect drift and errors early. **Del:** daily invariant report (zero expected), error tracking, user feedback channel. **Acc:** first 4 weeks: daily review; any invariant ≠ 0 is a P1.

### 18. Maintenance and controlled evolution
- **Obj:** change without regressions. **Del:** each change → requirement/defect ID, ADR if architectural, migration, tests, changelog. → **Gate G-10** per release.

## Decide early vs keep flexible

| Decide early (expensive to change) | Keep flexible |
|---|---|
| Movement states and which document posts each movement | Report layouts, dashboards |
| Posting function and ledger shape | Labels and wording |
| Primary unit policy; batch/serial levels | Print templates |
| Tenancy/deployment model | Notification rules |
| Numbering and FY | Approval thresholds (settings) |
| Authorization model | Tolerances (settings) |
| Accounting boundary | Optional modules |

## Avoiding both extremes

- **Premature implementation:** no screen before its movement model is walked through (stage 4).
- **Over-engineering:** build only Category C capabilities with a requirement ID; no generic workflow engine; no services for a single-customer ERP; no configuration options nobody asked for.
