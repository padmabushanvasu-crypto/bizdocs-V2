# NEW-ERP-STARTER-KIT

Templates and enforceable rules for starting a new ERP repository. Contains no BizDocs customer data and no industry-specific assumptions.

## Transfer into a new repository (exact steps)

From the root of the new, empty, **private** repository (`$KIT` = path to this folder, `$PB` = path to `ERP-ENGINEERING-KNOWLEDGE`):

```bash
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

Do **not** copy `02`, `03`, `04`, `05`, `19`, `20` — they describe BizDocs history. The rules keep their `BD-F-###` origin IDs so the reasoning stays traceable back to this repository.

Then:
1. Fill the placeholders in `CLAUDE.md` §9 and the commands in §5.
2. Open the first Claude Code session and paste the block from `docs/NEW-PROJECT-INITIALIZATION-PROMPT.md`.
3. Wire the CI jobs named in `rules/quality-gates.yaml` during stage 9 (see `rules/checks/README.md`); enable branch protection requiring them.

## Contents

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
| `DEPENDENCY-MATRIX.md` | trace both directions |
| `ACCEPTANCE-CRITERIA.md` | Given/When/Then incl. reverse and idempotency |
| `TEST-PLAN.md`, `REGRESSION-REGISTER.md` | test strategy, defect→test |
| `QUALITY-GATE-CHECKLIST.md`, `RISK-REGISTER.md` | gates and risk acceptance |
| `PROJECT-STATE.md`, `SESSION-HANDOVER.md` | memory that survives sessions |
| `RELEASE-CHECKLIST.md`, `PRODUCTION-READINESS-CHECKLIST.md`, `CHANGELOG.md` | release and go-live |
| `NEW-PROJECT-INITIALIZATION-PROMPT.md` | first-session and per-stage prompts |
| `pull_request_template.md` | evidence-based PRs |
| `rules/engineering-rules.yaml` | all rules, severity, enforcement, tests, origin |
| `rules/quality-gates.yaml` | gate definitions with auto checks |
| `rules/claude-hooks.example.json` | Claude Code hooks |
| `rules/checks/*` | reference CI checks (schema lint, invariants, clamp/loop/TODO/PR checks, hooks) |
