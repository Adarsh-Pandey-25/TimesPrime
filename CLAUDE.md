# TimesPrime: start here (every session, every developer)

## This is NOT the Next.js you know

This version (Next.js 16) has breaking changes: APIs, conventions and file structure may all differ
from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing
any code, and heed deprecation notices. (`next dev` no longer writes this into an `AGENTS.md`:
`agentRules: false` in each app's `next.config.ts`.)

## Before any work

1. **Read [`docs/NEWSROOM_PLAN.md`](docs/NEWSROOM_PLAN.md).** It is the one plan for this project,
   approved by the owner on 4 Nov 2026. Its **Progress** table names the current phase: the first
   one not marked Done. **The release goes first** (row 0, `release/v1`, run by Vivek): the panel
   phases wait for it. Work only on the current phase, or on a parallel track the plan names, on the
   branch the table gives. Nothing outside the plan gets built without the owner's approval.
2. **Read the [current status](docs/OPERATIONS.md#current-status)** in `docs/OPERATIONS.md`, §1–§3
   (state, environment, gotchas), before changing code.
3. **Where code goes:** [`docs/README.md`](docs/README.md#where-new-code-goes) and
   [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#4-layout) §4.
4. **When a phase or panel is done**, update in the same piece of work: the plan's Progress table,
   `docs/PANEL_DOCS.md` (for a panel), the current status in `docs/OPERATIONS.md`, and
   `docs/ARCHITECTURE.md`.
5. **The owner reads Hinglish.** Explain to the owner in simple Hinglish; keep the docs and commit
   messages in plain English for the developers.
6. **Seven Markdown files, no others:** this file and, in `docs/`, `README.md`, `ARCHITECTURE.md`,
   `OPERATIONS.md`, `PANEL_DOCS.md`, `NEWSROOM_PLAN.md` and `RESEARCH.md`. A new record (a design,
   a decision, a runbook, a backlog item) is a section of one of them. `npm run check:docs` fails on
   any other Markdown file and on a link that does not resolve.

## Structure and commands

- `apps/web` is the reader site, `apps/admin` the back office (every panel lives here), and
  `apps/worker` the scheduled jobs. `packages/server` holds the server-only code, `packages/shared`
  the client-safe config, types and helpers, and `packages/ui` the React both apps share. They are
  npm workspaces, and all dependencies are declared in the root `package.json`.
- From the root:
  - `npm run dev` starts the reader site on port 3000.
  - `npm run dev:admin` starts the back office on port 3001.
  - `npm run job -- <name>` runs a worker job (never from a session: it writes to the database).
  - `npm run verify` is the gate every commit must pass: typecheck, lint, check:docs, test, build,
    and the JS budget.
  - `npm run test:e2e` runs the read-only browser tests against production builds of both apps.
- One env file at the root, `.env`, serves every app (template `.env.example`; tests get the empty
  `.env.test`).

## Back-office panels

- **The definition of done, the access rules** (roles, the permission matrix, the four-eyes and MFA
  rules) **and the progress of every panel** are in
  [`docs/PANEL_DOCS.md`](docs/PANEL_DOCS.md). Read its
  [definition of done](docs/PANEL_DOCS.md#definition-of-done) before panel work: a panel is done
  only when all 13 items hold.
- **The access rules change only with the owner's approval:** propose the change in the panel's
  design, then regenerate the catalogue SQL (`node scripts/generate-access-catalog.mjs`). Report
  errors or conflicts with the code instead of working around them.
- **One panel at a time,** in the plan's order: 0 → 1 → 2 → 3 → 7 (launch minimum) → 8 (launch
  minimum) → launch → 7 and 8 in full → 4 → 5 → 6 → 9. No panel starts before the previous one is
  done.
- **Every panel starts with a design**, a section of `docs/PANEL_DOCS.md` ("Panel N design"),
  approved by the owner before code.

## Branches

- **All work happens on a branch:**
  - `panel-N-<name>` for a panel (e.g. `panel-0-access`);
  - `site/<topic>` for reader-site work;
  - `fix/<topic>` for fixes;
  - `chore/<topic>` for tooling, infrastructure and docs.

  Push only the branch.
- **Never push to `main` directly.** A branch reaches `main` only after the owner approves: then merge
  it into `main` and push `main`.

## Deployment and the database

- **A deployment now** (owner, 2026-11-02): the owner's senior asked for one; it is built as the
  release (`release/v1`, phases R0–R4). **Hosting is AWS**, region `ap-south-1` (owner, 4 Nov 2026,
  replacing R0's Vercel): the two apps on ECS, and the worker as a task EventBridge starts every
  30 minutes.
- **The real database:** the env file holds its credentials and the app uses them. Never read,
  print or edit an env file (`.claude/settings.json` denies it too). Never write to the database
  yourself: no SQL, migrations, bootstrap, test users, destructive tests or worker jobs. Schema
  changes are owner actions in a runbook. The app's normal behaviour (reading, ingesting, caching
  scraped content) is fine. End-to-end tests are read-only.
