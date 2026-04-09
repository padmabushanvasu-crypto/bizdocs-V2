# BizDocs Brand Guidelines

> Reference this file for all design decisions.
> Claude Code must read this before writing any front-end or UI code.

---

## Logo

- **File:** `brand_assets/bizdocs-logo.png`
- **Usage:** Always use on white or very light backgrounds only
- **Clear space:** Maintain padding equal to the height of the "B" around the logo on all sides
- **Never:** Stretch, recolour, rotate, or place on dark/busy backgrounds

### Logo Colours (extracted from logo)
| Element | Colour | Hex |
|---|---|---|
| "Biz" wordmark | Dark forest teal | `#1B5E52` |
| "Docs" wordmark | Bright mint green | `#3DBF94` |
| Tagline "Manufacturing ERP" | Muted teal grey | `#6B9E96` |
| Document icon | Gradient: `#1B5E52` → `#3DBF94` | — |

---

## Colour System

Colours are defined as CSS variables in `src/index.css` and consumed via Tailwind. **Never hardcode hex values in components** — always use the Tailwind token.

### Primary Brand Colours
| Role | Tailwind Token | Description |
|---|---|---|
| Primary action | `bg-primary` / `text-primary` | Main brand teal — buttons, links, highlights |
| Primary foreground | `text-primary-foreground` | Text on primary backgrounds |
| Accent | `bg-accent` / `text-accent` | Secondary highlights |
| Success | `bg-success` / `text-success` | Confirmations, approvals, pass states |
| Destructive | `bg-destructive` / `text-destructive` | Errors, deletions, rejections |

### Neutral / Surface Colours
| Role | Tailwind Token | Description |
|---|---|---|
| Page background | `bg-background` | Main app canvas |
| Card surface | `bg-card` | Module cards, panels |
| Muted surface | `bg-muted` | Table headers, inactive tabs |
| Border | `border-border` | All dividers and outlines |
| Muted text | `text-muted-foreground` | Labels, secondary info |

### Sidebar Colours
| Role | Tailwind Token |
|---|---|
| Sidebar background | `bg-sidebar` |
| Sidebar text | `text-sidebar-foreground` |
| Sidebar active item | `bg-sidebar-primary` |
| Sidebar hover | `bg-sidebar-accent` |

---

## Typography

### Font Families
| Use Case | Font | Tailwind Class |
|---|---|---|
| Headings, page titles, module names | Plus Jakarta Sans | `font-display` |
| Body text, labels, descriptions, table content | DM Sans | `font-body` |
| Item codes, quantities, numeric data, IDs | JetBrains Mono | `font-mono` |

### Type Scale (use Tailwind defaults)
| Element | Class |
|---|---|
| Page title | `text-2xl font-display font-semibold` |
| Section heading | `text-lg font-display font-medium` |
| Card title | `text-base font-display font-medium` |
| Body / table content | `text-sm font-body` |
| Labels / captions | `text-xs font-body text-muted-foreground` |
| Item codes / quantities | `text-sm font-mono` |

---

## Spacing & Layout

- **Container max width:** 1400px (`2xl` breakpoint in Tailwind config)
- **Page padding:** `p-6` or `p-8` for main content areas
- **Card padding:** `p-4` or `p-6`
- **Gap between cards:** `gap-4` or `gap-6`
- **Table row height:** Compact — use `py-2` for table cells, not `py-4`

---

## Border Radius

Defined via CSS variable `--radius`. Use Tailwind tokens only:
- `rounded-lg` — cards, dialogs, modals
- `rounded-md` — buttons, inputs, badges
- `rounded-sm` — small tags, chips

---

## Shadow

Only one shadow token is defined:
- `shadow-subtle` — use for cards and elevated surfaces. Do not use heavy drop shadows.

---

## Component Behaviour Rules

- **Tables:** Always use shadcn/ui `Table`. Zebra striping via `bg-muted/50` on alternate rows.
- **Buttons:** Primary actions = `variant="default"`. Destructive = `variant="destructive"`. Secondary = `variant="outline"`.
- **Badges / Status chips:** Use colour-coded variants — green for approved/pass, red for rejected/fail, yellow for pending, grey for draft.
- **Forms:** Always use shadcn/ui `Input`, `Select`, `Checkbox`. Never raw HTML inputs.
- **Notifications:** Always use Sonner toast. Success = green, Error = red, Warning = yellow.
- **Empty states:** Always show an icon + message. Never leave a blank white area.

---

## Print Layout Rules

- Target: **A4 portrait** (210mm × 297mm)
- Use `@media print` CSS for all print-specific styles
- Page breaks: `break-before: page` for new sections
- Font for print: DM Sans body, Plus Jakarta Sans for headings
- Remove sidebars, navbars, and action buttons from print view
- Always include: document title, date, company name, page number

---

## What to Avoid

- ❌ No gradients in UI components (gradients are logo-only)
- ❌ No heavy box shadows
- ❌ No decorative animations in data-heavy views
- ❌ No hardcoded hex colours in component files
- ❌ No new fonts — stick to the three defined fonts only
- ❌ No rounded-full on rectangular elements like buttons or table rows
- ❌ No generic AI aesthetics (avoid pastel cards, excessive whitespace, illustration-heavy empty states)
