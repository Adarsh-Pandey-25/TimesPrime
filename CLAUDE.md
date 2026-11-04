@AGENTS.md

## Start here (every session, every developer)

1. **Read `docs/NEWSROOM_PLAN.md`.** It is the one plan for this project, approved by the owner on
   4 Nov 2026. Its **Progress** table names the current phase: the first one not marked Done. Work
   only on that phase, or on a parallel track the plan names, on the branch the table gives.
   Nothing outside the plan gets built without the owner's approval.
2. **Read `docs/HANDOFF.md` §1–§3** (state, environment, gotchas) before changing code.
3. **Where code goes:** `CONTRIBUTING.md` ("Where does new code go?") and `docs/architecture.md` §4.
4. **When a phase or panel is done**, update in the same piece of work: the plan's Progress table,
   `docs/PANEL_DOCS.md` (for a panel), `docs/HANDOFF.md` and `docs/architecture.md`.
5. **The owner reads Hinglish.** Explain to the owner in simple Hinglish; keep the docs and commit
   messages in plain English for the developers.

## Structure and commands

- `apps/web` is the reader site, `apps/admin` the back office (every panel lives here), and
  `apps/worker` the scheduled jobs. `packages/server` holds the server-only code, `packages/shared`
  the client-safe config, types and helpers, and `packages/ui` the React both apps share. They are
  npm workspaces, and all dependencies are declared in the root `package.json`.
- From the root:
  - `npm run dev` starts the reader site on port 3000.
  - `npm run dev:admin` starts the back office on port 3001.
  - `npm run job -- <name>` runs a worker job.
  - `npm run verify` is the gate every commit must pass: typecheck, lint, test, build.
- One `.env.local` at the root serves every app.

## Back-office panels

- **Plan:** `docs/NEWSROOM_PLAN.md` (the phases, their order and what each delivers).
- **Access rules:** `docs/PERMISSIONS.md` (roles, permission matrix, four-eyes and MFA rules).
  Change it only with the owner's approval: propose the change in the panel's design doc, then
  regenerate the catalogue SQL. Report errors or conflicts with the code instead of working around
  them.
- **Progress and per-panel docs:** `docs/PANEL_DOCS.md`.
- **One panel at a time,** in the plan's order: 0 → 1 → 2 → 3 → 7 (launch minimum) → 8 (launch
  minimum) → launch → 7 and 8 in full → 4 → 5 → 6 → 9. No panel starts before the previous one is
  done.
- **Every panel starts with a design doc** in `docs/design/panel-N-<name>.md`, approved by the owner
  before code.
- **A panel is done only when:**
  1. Every feature in its `PANEL_DOCS.md` entry works, and the entry matches the code.
  2. Every route and action it adds checks a permission server-side; tests prove allowed and denied.
  3. Privileged actions are audited and need MFA where the plan says so.
  4. `npm run verify` and CI are green; routes, JS and CSS reported.
  5. SQL is in migration files with a rollback, listed as an owner action.
  6. `docs/PANEL_DOCS.md`, `docs/HANDOFF.md` and `docs/architecture.md` are updated.
  7. Real-database tests run against the local Supabase, not only mocks.
  8. End-to-end browser tests cover the critical flows, including a refused-access flow.
  9. Every screen has loading, error and empty states.
  10. Accessibility is checked (keyboard, labels).
  11. Failures reach Sentry; privileged actions are audited.
  12. A JS size budget per route is enforced in CI.
  13. A runbook covers what to do when the main flow breaks.

## Branches

- **All work happens on a branch:**
  - `panel-N-<name>` for a panel (e.g. `panel-0-access`);
  - `site/<topic>` for reader-site work;
  - `fix/<topic>` for fixes;
  - `chore/<topic>` for tooling, infrastructure and docs.

  Push only the branch.
- **Never push to `main` directly.** A branch reaches `main` only after the owner approves: then merge
  it into `main` and push `main`.

## Deployment: none until the project is complete

- **Nothing is deployed** until the whole project is done (owner decision, 2026-11-02). All
  verification is local. A staging environment on AWS is allowed before that (owner sign-off,
  4 Nov 2026; plan Phase I).
- **The target is AWS**, region `ap-south-1` (CERT-In: logs kept in India): the two apps on ECS, and
  the worker as a task EventBridge starts every 30 minutes. Vercel is not used.
- **Never run a migration, bootstrap, smoke test or worker job against the database `.env.local`
  points at**: it may be production. Local runs use a local database
  ([`docs/HANDOFF.md`](docs/HANDOFF.md) §2).
