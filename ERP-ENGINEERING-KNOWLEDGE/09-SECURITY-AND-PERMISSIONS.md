# 09 — Security and Permissions Framework

## 1. Principle

**The interface is not a security boundary.** Anyone with a valid session and the public client key can call the data API directly. Every restriction must hold when the UI is bypassed (BD-F-007, BD-F-009).

## 2. Rules

| Rule | Standard | Enforcement | Test |
|---|---|---|---|
| R-SEC-01 | Authorization for every privileged operation is enforced server-side: row-level policies for reads/writes, role checks inside every operation function | DB | T-SEC-01 |
| R-SEC-02 | Every table in an API-exposed schema has RLS enabled at creation; tables with no app use are not exposed | DB + CI advisor | T-SEC-03 |
| R-SEC-03 | Elevated-rights functions: fixed `search_path`, role/tenant check inside, `EXECUTE` revoked from anonymous and public | DB + CI advisor | T-SEC-03 |
| R-SEC-04 | Views use invoker rights (or are not exposed) | DB + CI advisor | T-SEC-03 |
| R-SEC-05 | Deny by default: unknown/no role = no access; sign-up disabled at the auth provider (not only hidden); new users get no tenant or role until assigned | auth config | T-SEC-02 |
| R-SEC-06 | One permission source (role × operation matrix) drives DB checks, routes, navigation (desktop and mobile) and buttons | code generation or shared module | T-SEC-05 |
| R-SEC-07 | Secrets only server-side; service keys never in client code or repo; repository visibility reviewed (private by default for customer projects) | CI secret scan | T-SEC-06 |
| R-SEC-08 | Audit trail on every business table and every privileged action (who, when, before/after for edits) | DB triggers | T-SEC-07 |
| R-SEC-09 | Input validation at the API (shape) and the DB (constraints); never trust client-computed totals, numbers or statuses | DB | T-SEC-08 |
| R-SEC-10 | File uploads: type/size allow-list, stored outside web root/public bucket, served via signed URLs, virus scan if from external parties | storage policy | T-SEC-09 |

## 3. Model

| Concept | Implementation |
|---|---|
| Authentication | Managed auth provider; MFA for admin/finance; session expiry and refresh; leaked-password protection on |
| Roles | Small set derived from discovery; a user may hold several |
| Permissions | Operation-level (`po.approve`, `stock.count.approve`) mapped to roles in one table |
| Record-level access | Policies by tenant (if multi-tenant), plant/location, ownership where required |
| Approval authority | Permission + optional threshold (amount, quantity) from settings |
| Separation of duties | Configurable: creator ≠ approver; requester ≠ issuer of stock |
| Privileged operations | Data corrections, period reopen, user/role changes: admin only, logged, ideally two-person approval |
| Sensitive data | Prices/costs hidden from roles that do not need them — enforced by column-level policy or separate views, not by hiding columns in the UI |
| Data isolation | Per-customer deployment; if shared, tenant key + RLS on every table + tests |
| Backups | Encrypted, access-restricted, restore tested |
| Account recovery | Self-service reset via verified e-mail; admin cannot see passwords; recovery events logged |
| Dependencies | Automated vulnerability scan; monthly update window |

## 4. Risks that exist even when the UI looks restricted

1. Hidden button, open API (F-007).
2. Table created during an incident without RLS (F-009, F-037).
3. Elevated-rights function callable by anonymous role (F-009).
4. View owned by a role that bypasses RLS returning other tenants' rows (BizDocs project notes: explicit tenant filter needed).
5. Column hidden in UI but returned by `select *` (costs).
6. Client sends a computed total or status that the server trusts.
7. Sign-up hidden in UI but enabled at provider (F-008).
8. Mobile navigation without the same guards as desktop (F-035).
9. Public repository containing project identifiers and internal incident history.

## 5. Mandatory security validation checklist (gate G-06)

- [ ] Advisor/linter: zero ERROR findings; WARN findings triaged with owner
- [ ] Every exposed table has RLS; policy tests pass for each role (allow and deny)
- [ ] Anonymous role cannot read or write any business table (automated)
- [ ] Every privileged operation rejects an unauthorised role when called directly (automated, per operation)
- [ ] Elevated-rights functions: `search_path` set, anon/public execute revoked
- [ ] Unknown role → no access; sign-up disabled at provider
- [ ] Secret scan clean; no service key in client bundle (grep built assets)
- [ ] Price/cost columns not returned to restricted roles
- [ ] Audit rows written for create/edit/approve/cancel/correct
- [ ] Backup restore drill done this quarter
- [ ] Dependency scan: no critical vulnerabilities

## 6. Automated test requirements

`T-SEC-01` role × operation matrix test (generated from the permission table) · `T-SEC-02` default-deny · `T-SEC-03` advisor zero-error in CI · `T-SEC-04` anon access · `T-SEC-05` navigation and routes derive from permission table (snapshot test) · `T-SEC-06` secret scan · `T-SEC-07` audit rows present · `T-SEC-08` server ignores client totals/status · `T-SEC-09` upload policy.
