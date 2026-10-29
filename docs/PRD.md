# TimesPrime — Product Requirements

> **Status: not yet written.** This document is authored in Phase 2 of the
> restructure (see `docs/prompts/00-prd-and-restructure.md`), which is gated on
> approval of Phase 1.
>
> It is a *reverse-engineered* PRD: it records what the product does today, not
> what it should do. Every functional requirement must cite the code
> implementing it (`file:line`) or be marked `Planned`. A requirement that
> cannot be pointed at is either a bug or a wish, and gets labelled as one.

Planned sections:

1. Overview
2. Problem and context
3. Goals / Non-goals
4. Personas — reader, admin/editor
5. User journeys — browse · read · translate · save · chat · administer
6. Current capabilities (as-built)
7. Functional requirements — `FR-001..`, each with statement, acceptance
   criteria, implementing `file:line`, and status
8. Non-functional requirements
9. Data model — derived from `db/schema.sql`
10. Integrations — purpose, auth, failure mode, fallback
11. Success metrics
12. Risks and open questions
13. Out of scope / future
14. Appendix — glossary, env var reference
