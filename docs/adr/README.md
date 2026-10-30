# Architecture Decision Records

One file per significant structural decision, numbered and immutable once
merged. A superseded ADR is not edited or deleted — a new one supersedes it and
links back, so the reasoning trail survives.

Naming: `NNNN-short-kebab-title.md`, e.g. `0001-feature-first-structure.md`.

Each record carries:

- **Status** — Proposed · Accepted · Superseded by NNNN
- **Context** — the forces in play, including constraints that were not chosen
- **Decision** — what was decided, in the active voice
- **Alternatives rejected** — and specifically why. This is the part future
  readers come back for; a decision without its discarded options reads as
  arbitrary.
- **Consequences** — what this makes easy, and what it makes harder

## Index

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-feature-first-structure.md) | Feature-first `src/` layout with layer separation and a CI-enforced boundary (restructure 1) | Superseded by 0002 |
| [0002](0002-frontend-backend-separation.md) | One Next.js app split into `app/`, `frontend/`, `backend/`, `shared/` and `database/`, with rules F1–X1 and V1 (restructure 2) | Accepted |
