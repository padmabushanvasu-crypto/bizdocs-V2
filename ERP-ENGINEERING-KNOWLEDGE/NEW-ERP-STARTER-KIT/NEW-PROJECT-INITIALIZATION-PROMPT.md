# New Project Initialization Prompt

Paste the block below into the **first** Claude Code session of a new ERP repository, after the starter kit has been copied in (see `README.md` in this folder). Replace `<…>`.

```
You are starting a new, customised manufacturing ERP for <customer>, in <industry>.
This repository contains an engineering starter kit distilled from a previous ERP.
It carries engineering lessons only. It does NOT carry that project's business
requirements, industry assumptions, item codes, roles or workflows. Do not import any.

1. Read, in order: CLAUDE.md, docs/PROJECT-STATE.md, docs/engineering/12-ERP-DEVELOPMENT-METHODOLOGY.md,
   docs/engineering/11-REQUIREMENTS-DISCOVERY-FRAMEWORK.md, rules/engineering-rules.yaml,
   rules/quality-gates.yaml. Summarise back to me, in 10 lines or fewer, the rules you
   will follow and the stage we are in.

2. We are at stage 1 (business discovery). Do not write application code, schema or
   migrations in this session.

3. Using docs/BUSINESS-DISCOVERY-QUESTIONNAIRE.md and the material I give you
   (<attach: notes, sample documents, spreadsheets>):
   a. Fill docs/REQUIREMENTS-REGISTER.md with FR/NFR only from what I or the customer
      stated, citing the source of each row.
   b. Fill docs/BUSINESS-RULES-REGISTER.md the same way.
   c. Record every unanswered ★ question and every ambiguity as Q-### with options and
      consequences. Do not answer them yourself.
   d. Draft docs/PROJECT-CHARTER.md in/out of scope, marked DRAFT.

4. Propose the first ADR drafts (ADR-001 stack, ADR-002 deployment/tenancy,
   ADR-003 movement ledger, ADR-004 which document records each movement) as
   PROPOSED only, each with options and trade-offs. Do not assume the previous
   project's stack or patterns fit; justify each choice against this customer's
   requirements.

5. Update docs/PROJECT-STATE.md and docs/SESSION-HANDOVER.md. End with:
   - the list of open Q-### that block gate G-01,
   - what you produced,
   - what is unverified.
```

## Follow-on session prompts (one per stage)

| Stage | Prompt starter |
|---|---|
| 4 Domain model | "Stage 4. From the confirmed registers, draft the domain model, state machines and movement table in docs/DATA-DICTIONARY.md and docs/modules/*. Walk through these real scenarios forward and reverse: <list>. Report every scenario that does not map to a transition. No code." |
| 6 Schema | "Stage 6. Write migrations for the approved model in db/migrations/. Include the posting function, position cache trigger, invariant views (adapt rules/checks/invariants.template.sql), RLS, numbering. Run fresh-build and schema-lint and paste output. Update DATA-DICTIONARY single-writer map." |
| 9 Foundation | "Stage 9. Set up CI jobs named in rules/quality-gates.yaml. Prove with a dummy movement: post, double-submit, reverse, invariants zero — all in CI. Paste the CI output." |
| 10 Module | "Discovery only: for module <X>, read its spec and list operations, reverse paths, dependencies, open questions. No code." → then separately: "Implement module <X> per the approved discovery report. DB operations and DB tests first, then UI. Paste test output. List unverified items." |
