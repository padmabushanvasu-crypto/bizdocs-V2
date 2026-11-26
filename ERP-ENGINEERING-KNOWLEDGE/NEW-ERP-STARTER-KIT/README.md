# NEW-ERP-STARTER-KIT — How to start a new ERP with it

This kit gives a brand-new ERP repository the engineering discipline BizDocs learned the hard way. Use it with Claude Code from day one.

| It carries | It does **not** carry |
|---|---|
| Rules that prevent the 42 failures in `../03-FAILURE-CATALOGUE.md` | BizDocs business requirements, workflows or roles |
| Templates for requirements, rules, design, tests, releases | Item codes, document prefixes, process names |
| Machine-readable rules and quality gates | Customer, vendor or staff data |
| Claude Code hooks and CI check scripts | The BizDocs technology stack (choose per project, ADR-001) |

Everything for the new customer is discovered fresh. The kit only makes sure it is discovered, designed, built and tested properly.

---

## 1. Before you start

1. **A new, empty, private GitHub repository** for the new ERP (never public — rule R-SEC-07).
2. **Claude Code** opened on that repository.
3. **Read access to `bizdocs-V2`** from that Claude Code session (the kit lives there under `ERP-ENGINEERING-KNOWLEDGE/`). If BizDocs is private, add it to the session when Claude Code asks.
4. **Whatever you already have from the new customer**: meeting notes, sample POs/challans/job cards, their spreadsheets. Not required to start; needed for the first session.

---

## 2. Copy the kit into the new repository

### Option A — let Claude Code do it (recommended)

Paste this into Claude Code, opened on the **new** repository:

```
Copy the ERP starter kit from the bizdocs-V2 repository into this repository.

Source: padmabushanvasu-crypto/bizdocs-V2, folder ERP-ENGINEERING-KNOWLEDGE/
(branch main; if NEW-ERP-STARTER-KIT is not on main yet, use branch
docs/erp-engineering-knowledge).

Follow ERP-ENGINEERING-KNOWLEDGE/NEW-ERP-STARTER-KIT/README.md section 2,
Option B exactly — run its script with KIT and PB pointing at the source folders.
Do not copy files 02, 03, 04, 05, 19, 20 or Part 2 of 18.

Then:
1. Show me the resulting file tree.
2. Search the copied files for "BizDocs", "OLTC" and any item code or person's name,
   and list every hit (references to BD-F-### IDs are expected and fine).
3. Commit with the message "chore: add ERP engineering starter kit" on a new branch
   and tell me the branch name. Do not change any file content.
```

### Option B — run the script yourself

From the root of the new repository. Set `KIT` to this folder and `PB` to its parent (`ERP-ENGINEERING-KNOWLEDGE`) in a local copy of `bizdocs-V2`:

```bash
KIT=/path/to/bizdocs-V2/ERP-ENGINEERING-KNOWLEDGE/NEW-ERP-STARTER-KIT
PB=/path/to/bizdocs-V2/ERP-ENGINEERING-KNOWLEDGE
mkdir -p docs/engineering docs/modules docs/adr rules .github .claude db/migrations

# 1. Root rules file
cp "$KIT/CLAUDE.md" ./CLAUDE.md

# 2. Living project documents
for f in PROJECT-CHARTER BUSINESS-DISCOVERY-QUESTIONNAIRE REQUIREMENTS-REGISTER BUSINESS-RULES-REGISTER \
         DATA-DICTIONARY PERMISSION-MATRIX DEPENDENCY-MATRIX ACCEPTANCE-CRITERIA TEST-PLAN REGRESSION-REGISTER \
         QUALITY-GATE-CHECKLIST RISK-REGISTER PROJECT-STATE SESSION-HANDOVER RELEASE-CHECKLIST \
         PRODUCTION-READINESS-CHECKLIST NEW-PROJECT-INITIALIZATION-PROMPT; do
  cp "$KIT/$f.md" docs/
done
cp "$KIT/MODULE-SPECIFICATION.md"        docs/modules/_TEMPLATE.md
cp "$KIT/ARCHITECTURE-DECISION-RECORD.md" docs/adr/_TEMPLATE.md
cp "$KIT/CHANGELOG.md" ./CHANGELOG.md
cp "$KIT/pull_request_template.md" .github/pull_request_template.md

# 3. Enforceable rules and checks
cp -r "$KIT/rules/." rules/
chmod +x rules/checks/*.sh

# 4. Reusable playbook chapters (engineering rationale; no customer data)
for f in 06 07 08 09 10 11 12 13 14 15 16 17; do cp "$PB"/$f-*.md docs/engineering/; done
sed '/^## Part 2/,$d' "$PB"/18-TECHNICAL-DEBT-AND-ANTI-PATTERNS.md > docs/engineering/18-ANTI-PATTERNS.md   # Part 2 is BizDocs-specific

# 5. Claude Code hooks (review first; confirm format against current Claude Code docs)
cp rules/claude-hooks.example.json .claude/settings.json
```

### What you end up with

```
CLAUDE.md                     ← rules Claude Code reads every session
CHANGELOG.md
.claude/settings.json         ← hooks: block destructive SQL, protect applied migrations, force handover notes
.github/pull_request_template.md
db/migrations/                ← empty; every schema change goes here
docs/
  PROJECT-STATE.md            ← where the project stands (updated every session)
  SESSION-HANDOVER.md         ← what the last session did and what's next
  PROJECT-CHARTER.md  BUSINESS-DISCOVERY-QUESTIONNAIRE.md
  REQUIREMENTS-REGISTER.md  BUSINESS-RULES-REGISTER.md
  DATA-DICTIONARY.md  PERMISSION-MATRIX.md  DEPENDENCY-MATRIX.md
  ACCEPTANCE-CRITERIA.md  TEST-PLAN.md  REGRESSION-REGISTER.md
  QUALITY-GATE-CHECKLIST.md  RISK-REGISTER.md
  RELEASE-CHECKLIST.md  PRODUCTION-READINESS-CHECKLIST.md
  NEW-PROJECT-INITIALIZATION-PROMPT.md
  modules/_TEMPLATE.md   adr/_TEMPLATE.md
  engineering/06…18           ← the playbook chapters (the "why" behind every rule)
rules/
  engineering-rules.yaml  quality-gates.yaml  claude-hooks.example.json
  checks/                     ← CI check scripts and SQL
```

### Do not copy

`02`, `03`, `04`, `05`, `19`, `20` and Part 2 of `18` describe BizDocs history and its own debt. Rules still cite their `BD-F-###` origin, so anyone can trace a rule back to the failure it prevents by opening `bizdocs-V2/ERP-ENGINEERING-KNOWLEDGE/03-FAILURE-CATALOGUE.md`.

---

## 3. Set up (one time, about 15 minutes)

| Step | What to do | Why |
|---|---|---|
| 1 | Fill `CLAUDE.md` §9 (stack, repo, environments, DB project, owner) once ADR-001/002 are decided — leave `<…>` until then | Claude Code needs the real coordinates |
| 2 | Fill the test commands in `CLAUDE.md` §5 at stage 9 | "Run the tests" must name real commands |
| 3 | Open `.claude/settings.json` and confirm the hooks match the current Claude Code hooks format | Hooks block destructive SQL and edits to applied migrations |
| 4 | Turn on branch protection on `main`: require PRs and (from stage 9) the CI checks | Gates must be enforced, not remembered |
| 5 | Put the customer's name, sponsor and target date in `docs/PROJECT-CHARTER.md` | Starts the charter |

---

## 4. First Claude Code session

Paste the block from `docs/NEW-PROJECT-INITIALIZATION-PROMPT.md` and attach whatever customer material you have. That session:

- reads the rules and summarises them back to you;
- writes **only** what the customer actually said into the requirements and business-rules registers;
- turns everything unknown into numbered open questions (`Q-###`) instead of guessing;
- drafts the charter and the first architecture decisions as **proposals** for you to approve;
- writes **no** application code.

Take the open questions to the customer. Nothing affecting stock, money or security gets built while its question is open.

---

## 5. The path from here to go-live

Full detail: `docs/engineering/12-ERP-DEVELOPMENT-METHODOLOGY.md`. Gates: `docs/QUALITY-GATE-CHECKLIST.md`.

| Phase | Stages | You get | Gate you approve |
|---|---|---|---|
| Discover | 1–3 discovery, requirements, scope | registers, process maps, charter | **G-01** Requirements |
| Design | 4–8 domain model, architecture, DB, security, prototypes | movement model, state machines, schema, permission matrix | **G-02** Architecture, **G-03** Schema, **G-06a** Security design |
| Foundation | 9 | repo + CI + posting function proven with a dummy movement | CI green |
| Build | 10–12, one module at a time | module: DB operations + tests first, then screens | **G-04** Module, **G-05** Integration |
| Prove | 13–15 simulation, UAT, data migration | 3-year simulated data, users' sign-off, clean opening balances | **G-07**, **G-08** |
| Go live | 16 | production readiness checklist PR-01…PR-12 | **G-09** |
| Operate | 17–18 | nightly invariant checks, controlled releases | **G-10** each release |

**The one ordering rule that matters most:** the stock/movement ledger, its single posting function, its reverse paths and its checks come **before** any document screen. Skipping this caused most of BizDocs' rework.

Per-stage prompts are at the bottom of `docs/NEW-PROJECT-INITIALIZATION-PROMPT.md`.

---

## 6. How every working session runs

1. **Discovery prompt first** (read-only): "For <module/change>, read the spec and list operations, reverse paths, dependencies and open questions. No code."
2. Review the report. Answer questions.
3. **Implementation prompt second**: "Implement per the approved report. DB operations and DB tests first, then UI. Paste test output. List what is unverified."
4. Claude Code opens a PR whose template forces: requirement IDs, behaviour changes, blast radius, test output, unverified items.
5. You merge. `PROJECT-STATE.md` and `SESSION-HANDOVER.md` are updated before the session ends (the Stop hook insists).

Never combine discovery and implementation in one prompt.

---

## 7. Minimum checks to switch on at stage 9

If setting up all CI jobs is too much at once, these ten catch the costliest failure classes (from `docs/engineering/16-ENGINEERING-QUALITY-GATES.md`):

strict type-check · fresh DB build from migrations + schema diff · schema lint (`rules/checks/schema-lint.sql`) · platform security advisor · DB tests for the posting function · invariant views (`rules/checks/invariants.template.sql`) · permission tests · no-clamp check · PR evidence check · secret scan.

`rules/checks/README.md` lists every check, what it must do, and which ones are heuristics that need occasional `allow-…:` annotations.

---

## 8. Troubleshooting

| Situation | Do this |
|---|---|
| Claude Code starts writing code in the first session | Stop it: "We are at stage 1. Discovery only — see CLAUDE.md §1." |
| Claude Code fills a requirement nobody stated | Ask it to move the row to open questions with its source marked unknown |
| A hook blocks a command you really want | Read the message; if it is destructive SQL, get the inverse SQL written first, then re-run with `APPROVED-BY-OWNER:<ticket>` |
| A heuristic CI check flags safe code | Add the `allow-clamp:` / `allow-loop-write:` comment with a reason on that line |
| Something from BizDocs seems to fit the new customer | Only adopt it with an ADR saying why it fits; run the inheritance check under G-02 in `docs/QUALITY-GATE-CHECKLIST.md` |
| The kit itself has a mistake | Fix it in `bizdocs-V2/ERP-ENGINEERING-KNOWLEDGE/NEW-ERP-STARTER-KIT` so the next project gets the fix, then copy the fix across |

---

## 9. Contents of this folder

| File | Use |
|---|---|
| `CLAUDE.md` | concise, authoritative rules for every session |
| `PROJECT-CHARTER.md` | scope, goals, accounting boundary |
| `BUSINESS-DISCOVERY-QUESTIONNAIRE.md` | discovery interviews (★ = must answer before code) |
| `REQUIREMENTS-REGISTER.md`, `BUSINESS-RULES-REGISTER.md` | FR/NFR/Q and BR with owners |
| `ARCHITECTURE-DECISION-RECORD.md` | ADR template + list of first ADRs |
| `DATA-DICTIONARY.md` | schema + single-writer map + movement table |
| `MODULE-SPECIFICATION.md` | per-module states, operations, reverse paths |
| `PERMISSION-MATRIX.md` | single permission source |
| `DEPENDENCY-MATRIX.md` | trace both directions before any document change |
| `ACCEPTANCE-CRITERIA.md` | Given/When/Then incl. reverse and idempotency |
| `TEST-PLAN.md`, `REGRESSION-REGISTER.md` | test strategy, defect → test |
| `QUALITY-GATE-CHECKLIST.md`, `RISK-REGISTER.md` | gates and risk acceptance |
| `PROJECT-STATE.md`, `SESSION-HANDOVER.md` | project memory that survives new sessions |
| `RELEASE-CHECKLIST.md`, `PRODUCTION-READINESS-CHECKLIST.md`, `CHANGELOG.md` | releases and go-live |
| `NEW-PROJECT-INITIALIZATION-PROMPT.md` | first-session prompt + one prompt per stage |
| `pull_request_template.md` | evidence-based PRs |
| `rules/engineering-rules.yaml` | 68 rules: severity, enforcement, tests, origin |
| `rules/quality-gates.yaml` | 10 gates with their automatic checks |
| `rules/claude-hooks.example.json` | Claude Code hooks |
| `rules/checks/*` | reference CI checks: schema lint, invariant views, clamp/loop/TODO/PR/test-change checks, hook scripts |

---

*Following this kit removes the failure classes BizDocs hit; it does not guarantee a bug-free ERP. Limits and open questions: `../20-KNOWN-LIMITATIONS-AND-UNRESOLVED-QUESTIONS.md`.*
