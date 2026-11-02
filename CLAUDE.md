@AGENTS.md

## Back-office panels

- **Plan:** `docs/PANEL_PLAN.md` (roles, permission matrix, four-eyes and MFA rules, data model). It
  is the reference; do not edit it. Report errors or conflicts with the code instead.
- **Progress and per-panel docs:** `docs/PANEL_DOCS.md`. Its index says which panel is next.
- **One panel at a time.** Panel 0 (Access foundation) first; no panel starts before the previous
  one is done.
- **A panel is done only when:**
  1. Every feature in its `PANEL_DOCS.md` entry works, and the entry matches the code.
  2. Every route and action it adds checks a permission server-side; tests prove allowed and denied.
  3. Privileged actions are audited and need MFA where the plan says so.
  4. `npm run verify` and CI are green; routes, JS and CSS reported.
  5. SQL is in migration files with a rollback, listed as an owner action.
  6. `docs/PANEL_DOCS.md`, `docs/HANDOFF.md` and `docs/CODEMAP.md` are updated.
- **Each panel on its own branch** (`panel-N-<name>`, e.g. `panel-0-access`). Push only that branch,
  never `main`. It reaches `main` only when the panel is complete and the owner approves; then merge
  it into `main` and push `main`.

## Deployment: none until the project is complete

- **Nothing is deployed** until the whole project is done (owner decision, 2026-11-02). Ignore any
  earlier Vercel deployment. All verification is local.
- **The target is AWS**, region `ap-south-1` (CERT-In: logs kept in India), when the project is
  complete. The 30-minute cron in `vercel.json` will need an AWS scheduler then.
- **Never run a migration, bootstrap or smoke test against the database `.env.local` points at**: it
  may be production. Local runs use a local database ([`docs/HANDOFF.md`](docs/HANDOFF.md) §2).
