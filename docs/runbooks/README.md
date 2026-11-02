# Runbooks

Operational procedures, written to be followed under pressure by someone who did
not write the system. Steps are literal and copy-pasteable; every check states
the expected output so the reader can tell pass from fail without judgement.

Candidates, based on failure modes already observed in this system:

- **Supabase unreachable** — every call returns `TypeError: fetch failed`. The
  app does not surface this: it silently degrades to calling NewsData.io per
  request, so the first visible symptom is upstream quota burn, not an error.
  Confirm with the `X-Data-Source` response header on
  `/api/news/top-headlines?refresh=true` — `newsdata` where `supabase` is
  expected means the store is not being read.
- **NewsData.io quota exhausted or key invalid** — feed falls back to built-in
  mock articles; header reads `mock`.
- **Cron not firing** — stale feed. Check `lastSyncAt` in `/api/admin/stats`
  against the 30-minute schedule in `vercel.json`.
- **Admin lockout** — `ADMIN_PASSWORD` or `ADMIN_SESSION_SECRET` unset makes
  the shared-password login return 503 and every `/admin/*` path redirect to the
  login page. Staff accounts (Panel 0) have their own recovery: `staff-access.md`.
- **Restoring the database** — schema from `database/schema.sql`, then
  `database/policies.sql`.

Written:

- [`apply-database.md`](apply-database.md) — apply the SQL files in `database/` in order, and verify each. Restoring the schema follows the same steps.
- [`staff-access.md`](staff-access.md) — switch on Panel 0 in order (migrations, deploy, bootstrap Super Admins, staff sign-in, freeze `admin_logs`, and only then the shared password off), and get back in when locked out.
