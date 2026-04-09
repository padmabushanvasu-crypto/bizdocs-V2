# BizDocs — Claude Code System Instructions

> Read this file before every task, no exceptions.
> This is the architectural blueprint for the BizDocs project.

---

## 1. Project Identity

- **Product Name:** BizDocs
- **Built By:** Innventive Solutions
- **Developer:** Vasu (padmabushanvasu-crypto on GitHub)
- **Repo:** bizdocs-v2
- **Local Path:** /Users/shree/Library/Mobile Documents/com~apple~CloudDocs/Desktop/bizdocs-bharat-main
- **Target Market:** Indian SME Manufacturers (B2B SaaS)
- **Purpose:** A manufacturing ERP platform covering procurement, inventory, job work, BOM, GRN, dispatch, and invoicing workflows.

---

## 2. Tech Stack — Never Deviate From This

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TypeScript |
| Styling | Tailwind CSS (utility-first, no custom CSS unless unavoidable) |
| UI Components | shadcn/ui — always prefer existing components before creating new ones |
| Backend / DB | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Hosting | Vercel (auto-deploy via GitHub push) |
| Version Control | GitHub — repo: bizdocs-v2 |

**Rules:**
- Always use TypeScript. No `.js` files in `src/`.
- Always use shadcn/ui components first. Do not reinvent buttons, inputs, dialogs, tables, or tabs.
- Never touch the Supabase schema directly in code — always create a migration file first.
- Never hardcode Supabase URLs or API keys. They live in `.env` only.

---

## 3. Design System

**Invoke the front-end design skill before writing any front-end code, every session, no exceptions.**

### Principles
- This is a professional B2B ERP tool. Prioritise **clarity, density, and function** over decoration.
- No generic AI aesthetics. No rounded-everything. No pastel gradients.
- Layouts should feel like a professional operations tool — think Notion, Linear, or Zoho Books in terms of density and structure.

### Colours
- Follow the existing Tailwind config and CSS variables already defined in the project.
- Reference `brand_assets/brand_guidelines.md` for any colour or typography decisions.
- Do not introduce new colour values not already in the design system.

### Component Patterns
- Use shadcn/ui `Table` for all data grids.
- Use shadcn/ui `Dialog` for all modals.
- Use shadcn/ui `Tabs` for all multi-section views.
- Use shadcn/ui `Sheet` for slide-over panels (e.g. item detail, party detail).
- Use shadcn/ui `Toast` / Sonner for all notifications — success, error, warning.
- Print layouts must be A4, portrait, multi-page capable, with proper page-break handling.

---

## 4. Module Map — Know What Exists

These modules are already built. Do not rebuild or duplicate them:

- **Item Master** — SKU management, item types, UOM, unit cost
- **BOM (Bill of Materials)** — multi-level BOM lines per finished good
- **Processing Routes** — stage-by-stage manufacturing steps per item
- **Party Master** — customers, vendors, job workers (raw material suppliers vs component manufacturers distinction)
- **Opening Stock** — initial stock import per item
- **GRN (Goods Receipt Note)** — two-stage QC flow (quantitative + qualitative), non-conformance tracking, A4 print layout
- **DC / Job Work Order** — dispatch to job workers, renamed from DC throughout
- **Jig & Mould Master** — tooling data
- **Stock Ledger** — state machine tracking stock movement

**Upcoming / In Progress:**
- Scrap return tracking on job work GRNs
- Final GRN checkbox with store confirmation layer
- DC-to-Job Card auto-creation driven by BOM processing routes
- Cost accumulation per component through processing stages
- Reorder Intelligence module (Phase 11)

---

## 5. Database Rules

- Supabase Project ID: `mclskjvrkopowusevuyk`
- All schema changes require a migration file in `/supabase/migrations/`
- Never use raw SQL in component files — use Supabase client calls
- RLS (Row Level Security) must be considered for any new table
- Naming convention: `snake_case` for all table and column names

---

## 6. File & Folder Conventions

```
src/
  components/       # Reusable UI components
  pages/            # Route-level page components
  hooks/            # Custom React hooks
  lib/              # Utility functions, Supabase client
  types/            # TypeScript interfaces and types
brand_assets/       # Logo, brand guidelines, colour references
supabase/
  migrations/       # All DB schema changes go here
```

- Component files: `PascalCase.tsx`
- Hook files: `useCamelCase.ts`
- Utility files: `camelCase.ts`

---

## 7. Git & Deployment Rules

- **Never push directly to `main` without local testing first.**
- Commit messages must be descriptive and scoped. Format: `feat: add scrap return tracking to GRN` or `fix: item code silent transformation on import`
- Each logical change = one commit. Do not bundle unrelated fixes.
- After pushing to GitHub, Vercel auto-deploys to production. Treat every push as a production release.
- The `.gitignore` must always include: `.env`, `node_modules/`, `temporary_screenshots/`

---

## 8. Known Bugs (Fix Before Adding Features)

These are logged and must not be ignored:

1. **Silent item code transformation during import** — item codes are being modified without user awareness
2. **Exact-match-only lookup failures** — search/lookup should support partial matching
3. **462 items missing unit cost** — data quality issue from Vasudevan client onboarding
4. **81 vendor name mismatches** — process codes vs party names don't match

---

## 9. Client Context

Current live client: **Vasudevan** (OLTC component manufacturer)

Imported data:
- 883 items, 1,067 BOM lines, 2,667 processing route stages, 231 parties

Outstanding from onboarding:
- 462 items need unit cost populated
- 81 vendor name mismatches to resolve

---

## 10. Claude Code Behaviour Rules

- Always test changes locally on `localhost` before suggesting a GitHub push.
- When asked to refactor, do not change behaviour — only structure.
- When in doubt about a design decision, refer to existing patterns in the codebase first.
- Never delete data or run destructive DB operations without explicit instruction.
- If a task touches the Supabase schema, always write the migration file first and show it before applying.
- For print layouts, always target A4 (210mm × 297mm), portrait, with `@media print` CSS.
