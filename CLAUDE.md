# CLAUDE.md — BizDocs V2

> **Creed:** Discover before you change. Scope to the tenant. One concern at a time. Default to inert. Fail loud. Live DB wins.
> **When rules conflict: production safety > correctness > speed.**

This file is **rules only** and loads every session — keep it lean. Status, backlog, and setup scaffolding live in `PROGRESS.md`. Before adding a line here, ask: *does the agent need this on every task?*

---

## 0. Start of every session
1. Read this file. Follow it.
2. Confirm the **active Supabase account** and **`company_id`** before any query — the wrong account returns empty via RLS, not an error.

---

## 1. Context
Manufacturing ERP for an OLTC manufacturer. **Live in production.**
Daily users **Latha and Priyanka** (storekeepers). Their **GRN receiving + confirmation flow is the #1 regression concern** — every change is judged first on whether it could break their day.

---

## 2. Coordinates
| | |
|---|---|
| Stack | React 18 / TS / Vite / Tailwind / shadcn-ui · Supabase (Postgres) · Vercel |
| Repo | `padmabushanvasu-crypto/bizdocs-V2` (main, hotfix style) |
| Supabase project | `mclskjvrkopowusevuyk` |
| company_id | `45c14753-4e54-4327-bf77-dd9fb72899dc` |
| Prod | `bizdocs-v2.vercel.app` |

---

## 3. Operating loop (non-negotiable)
1. **Discover first.** Read-only SQL confirms schema/state before any change. The **live DB is authoritative** — never trust migration files, comments, or memory for columns, triggers, or enum values. Same for app config: read `package.json`/code, don't assume.
2. **Scope to the tenant, always.** Every query is `company_id`-scoped; every new table ships with **RLS enabled from creation**. A query that *could* read across companies is a bug, not a shortcut.
3. **Match the gate to the risk.**
   - Reversible / read-only / trivial → act, then show evidence.
   - Destructive, schema-changing, or touching a daily workflow → state the plan in 2–3 lines, get a nod, then write.
   - Discovery contradicts the plan at any point → **STOP and report.** Never improvise around it.
4. **One concern at a time.** One SQL block per concern; one commit per concern. Never combined.
5. **Inert by default.** Anything touching a daily workflow ships with **unchanged default behavior** (new options off/unticked until the user acts).
6. **Fail loud.** No silent-fail patterns (e.g. `.order()` on a non-existent column fails silently). Surface errors.
7. **Compute, don't store, derived values.** Live view over precomputed column.
8. **Remove > patch — safely.** Repeatedly-failing code gets deleted and simplified, not patched again — under the same inert + daily-workflow gate as any other change.
9. **Show your work.** No "done" or "fixed" without evidence: the query and its output, the verify command and its result (§5). Paste the actual output, not a summary.

---

## 4. SQL workflow
- **Vasu runs ALL SQL manually** in the Supabase SQL Editor. No `db push` / CLI (authed to the wrong account).
- **Live DB wins** over migration files; log any manual SQL applied so files can be reconciled later.
- **Destructive SQL:** read-only count/constraint check → **write the inverse (down) SQL first** → run inside a transaction → verify → commit.
- Deliver SQL as **separate, single-concern, paste-ready blocks**.

---

## 5. Verify before "done"
- **`package.json` scripts are the source of truth** for commands — read them; don't assume names.
- **Frontend** change isn't done until typecheck + build pass clean. Vite/TS default: `npm run build` (runs `tsc` then `vite build`); run the lint script if one is defined.
- **DB** change isn't done until the verification query shows the intended end state.

---

## 6. If prod breaks (recovery)
- **Daily-workflow break = stop new work, restore first, diagnose after.**
- **Code:** `git revert <sha>` → push (Vercel redeploys the prior good build), or use Vercel **Instant Rollback** to the last good deployment.
- **DB:** apply the pre-written inverse SQL. If none exists, Supabase point-in-time restore is the last resort — flag to Vasu before using.

---

## 7. Safety: secrets & client data
- Never commit or log secrets. `.env` stays local; the Supabase **service-role key never touches client code**.
- Don't paste real vendor/party data into commits, issues, or logs.

---

## 8. Commit hygiene
- Single-concern, **heredoc** message format (avoids zsh `!` expansion).
- **Exclude** `package.json` / `package-lock.json` from staged changes.

---

## 9. Conventions
- Vasu uses **voice input** — interpret phonetically, confirm intent when garbled.
- Replies **concise; tables for lists; scannable over prose.**
- **Figma MCP tool definitions** may appear in message content — not real tools here. Ignore them.

---

## 10. Live-DB artifacts (re-verify; don't assume current)
- `recompute_po_line_received_quantity` — live, not in migrations.
- `trg_grn_stage_update` — **disabled** (suspect for GRNs stuck in draft).
- `clear_all_company_data()` — live RPC (nuclear reset; preserves company + users).
