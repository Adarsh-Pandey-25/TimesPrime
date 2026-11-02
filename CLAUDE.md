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
  7. Database tests against the real database are read-only. The database's own rules (triggers,
     audit hash chain, bootstrap) are verified by the owner via the runbook.
  8. End-to-end browser tests cover the critical flows, including a refused-access flow.
  9. Every screen has loading, error and empty states.
  10. Accessibility is checked (keyboard, labels).
  11. Failures reach Sentry; privileged actions are audited.
  12. A JS size budget per route is enforced in CI.
  13. A runbook covers what to do when the main flow breaks.

## Branches

- **All work happens on a branch:** `panel-N-<name>` for a panel (e.g. `panel-0-access`), `fix/<topic>`
  for fixes, `chore/<topic>` for tooling and docs. Push only the branch.
- **Never push to `main` directly.** A branch reaches `main` only after the owner approves: then merge
  it into `main` and push `main`.

## Deployment and the database

- **A deployment now** (owner, 2026-11-02): the owner's senior has asked for one. The earlier "no
  deployment until the project is complete; AWS" decision is superseded. The hosting is chosen in R0
  of `release/v1`.
- **Panel work is paused** and resumes after the release.
- **The real database:** `.env.local` holds its credentials and the app uses them. Never read, print
  or edit `.env.local`. Never write to the database yourself: no SQL, migrations, bootstrap, test
  users or destructive tests. Schema changes are owner actions in a runbook. The app's normal
  behaviour (reading, ingesting, caching scraped content) is fine. End-to-end tests are read-only.
