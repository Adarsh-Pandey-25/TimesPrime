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
  `/api/admin/login` return 503 and every `/admin/*` path redirect to the login
  page.
- **Restoring the database** — schema from `database/schema.sql`, then
  `database/policies.sql`.
