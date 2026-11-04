# Operations

Running, deploying and picking up TimesPrime:

1. [Environment variables](#environment-variables): every variable, where it is set, and which files
   hold them.
2. [Deployment](#deployment): AWS, and the checklist for the day.
3. [Runbooks](#runbooks): procedures for the owner, to follow under pressure.
4. [Current status](#current-status): where the work stands, the baselines, the gotchas, the history.
   **A new session starts here**, after [`CLAUDE.md`](../CLAUDE.md).
5. [Backlog](#backlog): deferred work, each item with the reason it was deferred.
6. [Audit ledger](#audit-ledger): the 28 audit findings and their status.

> **Paths in carried records.** The runbooks, the backlog, the audit ledger and the history below
> keep the paths of their time where they describe what happened then. Instructions meant for today
> use today's paths: `apps/web`, `apps/admin`, `apps/worker`, `packages/server`, `packages/shared`,
> `packages/ui`, `database/`, and the env file `.env` at the root.

## Environment variables

**Files.** One env file serves every app: `.env` at the repository root holds the owner's real
values locally. It is git-ignored, and a session never reads, prints, copies or edits it
(`CLAUDE.md`; `.claude/settings.json` denies it). Create it from `.env.example`, the committed
template, which names every variable the code reads; a test keeps the two in step (F-009,
`10c8b47`). `.env.test`, committed with every key empty, is the test environment: Next loads it
before `.env` when `NODE_ENV` is `test`, and keeps the first value it finds, so tests never see the
real values. Each app's `next.config.ts` loads the root files (gotcha 3.25); the worker passes
`--env-file-if-exists=../../.env`. In production the variables come from the AWS task definitions,
not from a file. **Never commit real values.** (Until 2026-11-04 the local file was `.env.local` at
the root on this branch, and `frontend/.env` on `main`.)

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public anon key; RLS restricts it to reads. Used only without the service-role key, and then every write fails (BL-025) |
| `SUPABASE_SERVICE_ROLE_KEY` | server, required in production | Bypasses RLS for server writes. Never expose to the client. Only the back office and the worker need it |
| `NEWSDATA_API_KEY` | yes | NewsData.io. Without it the app serves built-in mock articles |
| `ANTHROPIC_API_KEY` | yes | Powers `/api/chat` and category classification. Without it chat returns a clear "unavailable" message |
| `ADMIN_PASSWORD` | yes | The admin panel password, compared in constant time. Unset (or without `ADMIN_SESSION_SECRET`), login answers 503 and `/admin` stays locked |
| `ADMIN_SESSION_SECRET` | yes | HMAC key signing the 12-hour admin session cookie; changing it signs every admin out |
| `ADMIN_LEGACY_LOGIN` | optional | The two variables above are the shared password, retired in code at 2027-01-01 00:00 IST. Set this to `off` to retire it sooner |
| `UPSTASH_REDIS_REST_URL` | optional | Shared cache and the shared rate-limit windows. Without it, an in-process cache is used (fine locally, not shared across instances) |
| `UPSTASH_REDIS_REST_TOKEN` | optional | Pairs with the URL above |
| `NEXT_PUBLIC_SENTRY_DSN` | optional | Error reporting. Not a secret, but must be `NEXT_PUBLIC_` to reach the browser |
| `SENTRY_AUTH_TOKEN` | build | Source-map upload at build time only |
| `SENTRY_ORG` | build | Sentry org slug |
| `SENTRY_PROJECT` | build | Sentry project slug |
| `NEXT_PUBLIC_APP_URL` | prod | The site's public origin: OpenGraph's `og:url` |

Gone since the apps/packages split: `CRON_SECRET` (the refresh is the worker's `refresh-news` job,
started by the scheduler, not an HTTP route) and `NEXT_PUBLIC_BASE_URL` (the article page no longer
fetches its own API, BL-016). `ADMIN_SECRET_TOKEN` and `MEDIASTACK_API_KEY` appear in some older env
files and are **read by nothing**; `NEXT_PUBLIC_NEWSDATA_API_KEY` is no longer read either
(`45223f0`) and must never be set. The code also reads `NODE_ENV`, `CI` and `NEXT_RUNTIME`, which
the platform sets.

Generate the two admin secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

## Deployment

**A deployment now** (owner, 2026-11-02): the owner's senior asked for one, and it is built as the
release (`release/v1`, phases R0–R4). **Hosting is AWS**, region `ap-south-1` (owner, 4 Nov 2026,
replacing R0's Vercel Pro `bom1`). Set every variable from the [table above](#environment-variables)
in the AWS environment. Three units deploy: the reader site and the back office as ECS services, and
the worker as a task that EventBridge starts every 30 minutes (`npm run job -- refresh-news`). The
plan's Phase I ([`NEWSROOM_PLAN.md`](NEWSROOM_PLAN.md)) covers the full launch; the list below is
what must hold on the day.

The list below must hold on the day the apps first serve the public. Until then every check is
made locally ([environment](#2-environment-and-commands)).

**AWS.**
- **Region:** `ap-south-1` (Mumbai), for the app and for its logs. CERT-In's directions keep logs for
  180 days within India; the plan also asks for the Supabase project in an Indian region, or logs
  exported to Indian storage.
- **The refresh:** the worker's `refresh-news` job, started every 30 minutes by EventBridge
  Scheduler (an ECS task running `npm run job -- refresh-news`). It has no HTTP path and needs no
  secret; without the scheduler, ingestion stops silently, so alarm on the task's exit code.
- **Runtime:** Node 24 (F-026). The proxy runs on Next's Node runtime. Audit rows take their
  `request_id` from `x-vercel-id`, and fall back to a random UUID where that header is absent, as it
  will be on AWS.
- **Configuration:** every variable in `.env.example`, set in the AWS environment, never in
  the repository.

**Panel 0** ([the staff-access runbook](#staff-access-switching-on-panel-0-and-getting-back-in)). It is rehearsed first on the local
database, then done once more against the production database at deployment, in this order:
1. Supabase dashboard: sign-ups off, TOTP on. Apply `2026-11-02-access-1-foundation.sql`, then
   `2026-11-02-access-2-catalog.sql`, and run their checks.
2. Run the merged code. The shared password still works, and an admin change writes `audit_log`
   rows.
3. Invite two Super Admins, and run `database/bootstrap/super-admin.sql` for each, with its four
   checks.
4. Each signs in with email, password and a second factor; check the audit rows.
5. Apply `2026-11-02-access-3-freeze-admin-logs.sql`.
6. Only after Panel 1: consider `ADMIN_LEGACY_LOGIN=off`. The code ends the shared password on
   1 January 2027 regardless.

**The production database** ([the database runbook](#applying-the-database-files)), from the audit:
1. Confirm `SUPABASE_SERVICE_ROLE_KEY` is set in the environment (present, not copied). Without it the
   app falls back to the anon key and RLS refuses every write (BL-025).
2. Take the step 0 snapshot and confirm `service_role` has `rolbypassrls`.
3. Apply `database/schema.sql`, then `database/policies.sql`, then
   `database/migrations/2026-11-02-indexes.sql`. Verify each as the runbook shows. Each has a
   rollback. This closes F-008 and F-018 (the F-005 and scraper lookups use the link index).
4. Before any `NOT NULL` migration, count the nulls in live data (BL-024).
5. Re-run the F-006 injection probe, and an RLS check, against the live database.

**Environment:**
- The root `.env` holds the real database (§2). The app uses it; nothing else writes to it.
- On AWS: Node 24 (F-026), `NEXT_PUBLIC_SENTRY_DSN`, the Upstash variables, and the worker's
  scheduler. No production cron entry has ever been seen in the database.
- Owner's `.env`: `ADMIN_SECRET_TOKEN` and `MEDIASTACK_API_KEY` can go; nothing reads them.
  Never set `NEXT_PUBLIC_NEWSDATA_API_KEY`.

**Smoke test at deployment:**
- `/api/health` answers 200, and Sentry receives a Supabase fallback event (F-002).
- `X-Data-Source` shows `supabase` or `cache` for readers (NFR-01).
- The scheduler starts the worker's refresh, and its `audit_log` row (`system:cron`, `cron.refresh_news`) carries
  the purge count (F-015).
- The Redis limiter: the 11th login attempt in 15 minutes and the 31st uncached scrape in a minute
  answer 429 across instances (F-004, F-011).
- BL-019 (publisher image timeouts) under real traffic.

**Before production.** A list only; no work is planned on it yet (owner, 2026-11-02):
- **Environments:** local, then staging on AWS, then production. Nothing skips a stage.
- **Backup and restore:** a restore actually tested, not just backups switched on.
- **Load test** of the reader paths and the admin API.
- **Review:** dependencies (advisories, BL-031) and HTTP headers (CSP, HSTS, frame and referrer
  policies).
- **AWS infrastructure as code:** no hand-made production resources.
- **Alerts:** Sentry, the cron's runs, `/api/health`, the audit chain.
- **Incident runbook:** including CERT-In's 6-hour report.
- **Legal pages:** the privacy policy (BL-008), and the grievance officer page (NEWSROOM_PLAN Phase H, IT Rules
  Level I).

**Not covered by any audit:** accessibility (axe-core), a scraper replay against the 120-URL
publisher sample, a staging environment, Supabase backup and restore, end-to-end tests, and a bundle
budget in CI.

**Open with the owner:** the privacy policy (BL-008); BL-031 (accept the moderate advisories or wait);
Phase F (§6) is optional.

---

## Runbooks

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
- **Refresh not running** — stale feed. Check `lastSyncAt` in `/api/admin/stats`
  against the worker's 30-minute schedule (`npm run job -- refresh-news`, started by
  the scheduler; its exit code is 1 when a run failed).
- **Admin lockout** — `ADMIN_PASSWORD` or `ADMIN_SESSION_SECRET` unset makes
  the shared-password login return 503 and every `/admin/*` path redirect to the
  login page. Staff accounts (Panel 0) have their own recovery: `staff-access.md`.
- **Restoring the database** — schema from `database/schema.sql`, then
  `database/policies.sql`.

Written:

- [`apply-database.md`](#applying-the-database-files) — apply the SQL files in `database/` in order, and verify each. Restoring the schema follows the same steps.
- [`staff-access.md`](#staff-access-switching-on-panel-0-and-getting-back-in) — switch on Panel 0 in order (migrations, deploy, bootstrap Super Admins, staff sign-in, freeze `admin_logs`, and only then the shared password off), and get back in when locked out.
- [`sign-in-broken.md`](#staff-sign-in-or-an-admin-action-is-failing) — staff sign-in or an admin action is failing: by what the person sees, the cause, how to confirm it and what to do, with the Sentry operation each failure reports.

### Applying the database files

For the owner, at deployment. Nothing in the app or its tooling applies these files; this runbook
is the only way they reach a database. Every file is idempotent, so a step that fails halfway can be
run again. Every step has a rollback, which relies on the snapshot you take in step 0.

**Before you start**
- Confirm which Supabase project you are connected to. The local `.env` may point at the
  production project ([Deployment](#deployment)); apply to the project you mean to change.
- Confirm that `SUPABASE_SERVICE_ROLE_KEY` is set in the deployment's environment variables. Check
  only that it is present; never copy its value anywhere. See [Which key the app uses](#which-key-the-app-uses-and-what-rls-does-to-it):
  without it, Row Level Security makes the app's writes fail.
- Take a backup, or confirm point-in-time recovery is on (Dashboard → Database → Backups).
- Open Dashboard → SQL Editor → New query. Paste each file whole, then Run.

#### Which key the app uses, and what RLS does to it

Every database call is made by the server, through one client (`packages/server/src/lib/supabase.ts`). The
browser never talks to Supabase. That client uses `SUPABASE_SERVICE_ROLE_KEY` when it is set, and
falls back to `NEXT_PUBLIC_SUPABASE_ANON_KEY` otherwise.

In Supabase, the `service_role` bypasses RLS (`rolbypassrls`), so with the service key every call
below works whatever the policies say. The policies matter only on the anon fallback, where only
the two public reads are allowed. How the rest fails depends on the grants:

- **After step 2**, anon holds no write grant on any table and nothing at all on `admin_logs`, so
  every other call fails with `permission denied`. The app logs it and reports it to Sentry. The
  activity log answers 500, and the audit-log insert is logged but not raised.
- **Between step 1 and step 2**, or anywhere anon still holds Supabase's default grants, RLS
  filters instead: reads and `UPDATE`/`DELETE` match **0 rows with no error**, so the activity log
  looks empty and a purge deletes nothing. Only an `INSERT` reports an error.

Granting anon those rights is not a fix: the anon key is public by design, so a write policy for
anon would let anyone write.

| Table | What the app does | Where | Service key | Anon fallback: the policy that allows it |
|---|---|---|---|---|
| `articles` | SELECT: the feed, the freshness check, the new-story count, the row count, the link lookup (F-005) | `packages/server/src/repositories/db.ts` | ✅ bypass | ✅ "Public read access" |
| `articles` | SELECT: health probe, admin list and stats, classifier column probe | `services/health`, `api/admin/articles.ts`, `api/admin/stats.ts`, `services/classify` | ✅ bypass | ✅ "Public read access" |
| `articles` | UPSERT: cron ingest, admin publish | `db.ts` `saveArticlesToDB`, `api/admin/publish-article.ts` | ✅ bypass | ❌ none |
| `articles` | UPDATE: admin edit, `category_mismatches`, scraped `content` | `api/admin/articles.ts`, `services/classify`, `services/scrape` | ✅ bypass | ❌ none |
| `articles` | DELETE: the 7-day purge, admin delete and bulk delete | `db.ts` `purgeOldArticles`, `api/admin/articles*.ts` | ✅ bypass | ❌ none |
| `breaking_news` | SELECT: the homepage banner (public `GET /api/admin/breaking-news`, CR-08) | `api/admin/breaking-news.ts` | ✅ bypass | ✅ "Public read access" |
| `breaking_news` | INSERT, UPDATE (`is_active = false`): admin set and remove | `api/admin/breaking-news.ts` | ✅ bypass | ❌ none |
| `admin_logs` | INSERT: every admin action and cron run | `packages/server/src/repositories/auditLog.ts` | ✅ bypass | ❌ none |
| `admin_logs` | SELECT, DELETE: the activity log and its clear button | `api/admin/logs.ts` | ✅ bypass | ❌ none |

Before the F-008 files existed, `articles` already had RLS enabled and the same policies through
`database/policies.sql`. So if the live cron is ingesting today (`lastSyncAt` advancing in
`/admin`), the service key is already in use.

#### 0. Snapshot the current state

Run these queries and keep their results (the SQL Editor's results grid has a download button).
Every rollback below restores what they show.

```sql
SELECT relname, relrowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('articles', 'breaking_news', 'admin_logs');

SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('articles', 'breaking_news', 'admin_logs')
ORDER BY tablename, policyname;

SELECT table_name, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('articles', 'breaking_news', 'admin_logs')
  AND grantee IN ('anon', 'authenticated', 'service_role')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;

SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'articles' ORDER BY indexname;

SELECT extname FROM pg_extension WHERE extname = 'pg_trgm';

SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname IN ('service_role', 'anon', 'authenticated');
```

The last query should show `service_role` = `true` and the other two = `false`. If `service_role`
is `false`, stop: the table above no longer holds, and RLS would block the app's writes.

#### 1. `database/schema.sql` — the tables

Creates whichever of `articles`, `breaking_news` and `admin_logs` is missing (the last two were
never in a file before F-008), with the `created_at` and `article_id` indexes on `articles`, and
enables Row Level Security on all three. A table that already exists is left as it is: `IF NOT
EXISTS` adds no columns or constraints to it. On the live project, where all three exist, the only
possible change is turning RLS on.

Verify:

```sql
SELECT relname, relrowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('articles', 'breaking_news', 'admin_logs');
```

Expected: 3 rows, every `relrowsecurity` = `true`.

**Rollback.** Turn RLS back off only on a table where the snapshot showed `relrowsecurity` =
`false`:

```sql
ALTER TABLE public.breaking_news DISABLE ROW LEVEL SECURITY;  -- only if the snapshot showed false
ALTER TABLE public.admin_logs DISABLE ROW LEVEL SECURITY;     -- only if the snapshot showed false
ALTER TABLE public.articles DISABLE ROW LEVEL SECURITY;       -- only if the snapshot showed false
```

Drop only what this step created, as the snapshot shows. That means a table with no row in the
first snapshot query, or `idx_articles_created_at` / `idx_articles_article_id` missing from the
index list. A table created by this step is new and empty. Run `SELECT count(*)` on it first and
drop it only at 0.

```sql
DROP INDEX IF EXISTS public.idx_articles_created_at;  -- only if missing from the snapshot
DROP INDEX IF EXISTS public.idx_articles_article_id;  -- only if missing from the snapshot
DROP TABLE IF EXISTS public.breaking_news;            -- only if missing from the snapshot, and empty
DROP TABLE IF EXISTS public.admin_logs;               -- only if missing from the snapshot, and empty
```

Never drop `articles`.

#### 2. `database/policies.sql` — who may read and write

Drops and recreates the policies on all three tables, and sets the table grants. `articles` and
`breaking_news` get public read access, `admin_logs` gets none, and only `service_role` writes.
Runs as one transaction: either all of it applies or none of it does, so a failed run needs no
rollback.

Verify:

```sql
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE tablename IN ('articles', 'breaking_news', 'admin_logs')
ORDER BY tablename, policyname;

SELECT has_table_privilege('anon', 'public.articles', 'INSERT');       -- false
SELECT has_table_privilege('anon', 'public.breaking_news', 'SELECT');  -- true
SELECT has_table_privilege('anon', 'public.admin_logs', 'SELECT');     -- false
```

Expected: 7 policies. `articles` has 4 (Public read access, Service role delete, insert, update),
`breaking_news` has 2 (Public read access, Service role full access), and `admin_logs` has 1
(Service role full access). Then false, true, false.

**Rollback.** The policies have the same names and rules as those in `policies.sql` and the code
comments before F-008, so on a project that already had them, nothing about them changed. What is
new is the grants: `breaking_news` loses INSERT, UPDATE and DELETE for anon and authenticated, and
`admin_logs` loses every privilege for them.

1. **Grants.** For each `anon` or `authenticated` row in the snapshot's grants query that differs
   from the verify output, grant its privileges back, for example:

   ```sql
   GRANT INSERT, UPDATE, DELETE ON public.breaking_news TO anon, authenticated;  -- as the snapshot listed
   ```

2. **Policies.** For a policy that the snapshot shows with a different rule, or that it does not
   show at all, drop it, then recreate it from the snapshot's `roles`, `cmd`, `qual` and
   `with_check` columns:

   ```sql
   DROP POLICY IF EXISTS "Service role full access" ON public.admin_logs;  -- one per policy, by name
   CREATE POLICY "<policyname>" ON public.<table> FOR <cmd> TO <roles>
     USING (<qual>) WITH CHECK (<with_check>);  -- leave out a clause the snapshot shows as null
   ```

Put the rollback in `BEGIN; … COMMIT;` so it applies whole or not at all.

#### 3. `database/migrations/2026-11-02-indexes.sql` — the indexes (F-018)

Enables `pg_trgm`, then adds five indexes to `articles`: GIN on `category` and `country`, trigram
GIN on `title` and `description`, and a btree on `link`. **The link index matters most.** The
article page (F-005) and the public scrape route look up every request's URL by `link`, and without
the index each lookup scans the whole table.

Optional pre-check, for information only (the link index is deliberately not unique):

```sql
SELECT link, count(*) FROM public.articles GROUP BY link HAVING count(*) > 1 ORDER BY 2 DESC LIMIT 10;
```

Verify:

```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'articles' ORDER BY indexname;

EXPLAIN SELECT title, link FROM public.articles WHERE link = 'https://example.com/x';
```

Expected indexes, beside the primary key and `articles_article_id_key`:
- `idx_articles_article_id`
- `idx_articles_category_gin`
- `idx_articles_country_gin`
- `idx_articles_created_at`
- `idx_articles_description_trgm`
- `idx_articles_link`
- `idx_articles_title_trgm`

The `EXPLAIN` should show `Index Scan using idx_articles_link`. On a very small table the planner
may still choose a sequential scan; that is expected, not a failure.

**Rollback.** Dropping an index loses no data; the queries only get slower again. Drop the five,
except any the snapshot already listed:

```sql
DROP INDEX IF EXISTS public.idx_articles_category_gin;
DROP INDEX IF EXISTS public.idx_articles_country_gin;
DROP INDEX IF EXISTS public.idx_articles_title_trgm;
DROP INDEX IF EXISTS public.idx_articles_description_trgm;
DROP INDEX IF EXISTS public.idx_articles_link;
```

Then, only if the snapshot did not list `pg_trgm`:

```sql
DROP EXTENSION IF EXISTS pg_trgm;  -- refuses (and changes nothing) if anything else still uses it
```

#### 4. In the app, afterwards

- `/admin` → the activity log loads, and adding a breaking-news item shows it on the homepage banner.
- Open an article from the feed: the page shows "Read on publisher's site" with the publisher's link.
- `GET /api/health` answers 200 with `{"status":"ok"}`. A 503 (`degraded`) means a dependency is
  down; the result is cached for 60 seconds, so wait a minute before checking again.

#### 5. The Panel 0 access files

Three more files, for staff accounts, roles and the audit log:
`database/migrations/2026-11-02-access-1-foundation.sql`, `2026-11-02-access-2-catalog.sql` and
`2026-11-02-access-3-freeze-admin-logs.sql`, plus `database/bootstrap/super-admin.sql`. They have
an order relative to the code deploy (migrations before it, the freeze after it), so they are not
listed here. Follow [`staff-access.md`](#staff-access-switching-on-panel-0-and-getting-back-in), which gives each step's check and undo.
Each file also carries its own verification queries and rollback.

From the Panel 0 deploy, the activity log reads `audit_log` (`admin_logs` is history), and an admin
change that cannot write its audit row is refused with 503.

If the activity log is empty or fails right after an admin action, the app may be on the anon
fallback; see
[Which key the app uses](#which-key-the-app-uses-and-what-rls-does-to-it). Roll back step 1 for
`admin_logs` and `breaking_news` (if their snapshot showed RLS off) until the key is set.

### Staff access: switching on Panel 0, and getting back in

For the owner. Panel 0 replaces the shared admin password with named staff accounts, roles and a
second factor ([design](PANEL_DOCS.md#panel-0-design-the-access-foundation), [PANEL_DOCS](PANEL_DOCS.md)).
Nothing in the app applies SQL or changes settings: every step below is yours. Each step says how to
check it and how to undo it.

**Where.** Against the real database, the one the env file names (owner decision, 2026-11-02): the
six steps in [Part B](#part-b--at-the-aws-deployment), when panels resume, with the app run locally
on that database for step 2. Nothing is deployed until the whole project is complete; on the day of
the AWS deployment the same steps apply there ([Deployment](#deployment)). These steps are
yours: no session and no test writes to that database.

#### The order

Do these in order, and do not start a step until the one before it checks out.

| # | Step | Check | Undo |
|--:|---|---|---|
| 1 | **Apply the SQL migrations** (before any code) | The verification queries at the end of each file | The foundation file's rollback (only before go-live) |
| 2 | **Run the code** | The shared password still works; an admin change writes an audit row | Run the previous version |
| 3 | **Bootstrap two Super Admins** | `database/bootstrap/super-admin.sql`'s checks 1–4 | Revoke the assignment (in the file) |
| 4 | **Sign in with a staff account and verify** | `/admin` says "Signed in as …"; the audit log shows the sign-in and the second factor | Nothing to undo; the shared password still works |
| 5 | **Freeze `admin_logs`** | It is still readable and no longer writable | Grant writes back (in the file) |
| 6 | **Only then, consider turning the shared password off** | It answers 403 "retired" | Remove the switch, before 1 January 2027 |

The shared password keeps working through steps 1–5, so there is always a way in while you set
staff accounts up. It stops by itself at 00:00 IST on 1 January 2027, whatever is configured.

---

#### Part A — dropped

Part A ran the same steps against a local Supabase stack. The owner dropped the local database
(2026-11-02), so the database-level checks (the two-admin trigger, the audit hash chain, the
bootstrap's checks 1–4) wait for Part B against the real database.

---

#### Part B — at the AWS deployment

Against the real database: when panels resume (then "deploy" in B2 means running the app locally
on the root `.env`), and again at the AWS deployment.

##### B1. Apply the SQL migrations

**Before you start.** In the Supabase dashboard:
- Authentication → Sign In / Providers: turn **off** "Allow new users to sign up". Staff accounts are
  invited, never self-registered.
- Authentication → Multi-factor: TOTP (authenticator app) **enabled**. It is on by default and free.
- Authentication → Sessions: leave the JWT expiry at the default, 1 hour.
- Take a backup, or confirm point-in-time recovery (Database → Backups).

Then in SQL Editor → New query, run each file whole, in this order:
1. `database/migrations/2026-11-02-access-1-foundation.sql`: the six tables, their triggers and
   grants.
2. `database/migrations/2026-11-02-access-2-catalog.sql`: the 15 roles, 39 permissions and the
   matrix (generated from the access rules (`docs/PANEL_DOCS.md`)).

**Check.** The verification queries at the end of each file, each with its expected answer. In short:

```sql
SELECT count(*) FROM public.roles;             -- 15
SELECT count(*) FROM public.permissions;       -- 39
SELECT count(*) FROM public.role_permissions;  -- 136
SELECT has_table_privilege('authenticated', 'public.audit_log', 'SELECT');  -- false
SELECT has_table_privilege('service_role', 'public.audit_log', 'UPDATE');   -- false
SELECT public.audit_verify_chain();            -- NULL (an empty chain is intact)
```

The running app does not use these tables until step 2, so nothing changes for anyone yet.

**Undo.** The rollback section at the end of the foundation file drops the tables and functions.
Use it only before go-live: once `audit_log` holds real rows, it is never dropped (logs are kept at
least one year).

##### B2. Run the code

Deploy `main` (with Panel 0 merged) on AWS. No new environment variable is needed. `ADMIN_LEGACY_LOGIN` stays unset (the shared password stays
on).

**Check.**
- `/admin/login` shows the staff form (email and password) and "Use the shared admin password".
- The shared password still signs in. `/admin` shows a notice that it stops working on 1 January
  2027.
- Make one admin change with it, for example set a breaking-news item, then:

  ```sql
  SELECT seq, at, actor_label, action, outcome FROM public.audit_log ORDER BY seq DESC LIMIT 5;
  ```
  Expect two rows from `legacy:shared-password`, `breaking_banner.set`: `attempted`, then
  `succeeded`.
- Within 30 minutes the cron writes a `system:cron` row, action `cron.refresh_news`.

If every admin change answers 503 "The audit log could not be written", step 1 is missing, or
`SUPABASE_SERVICE_ROLE_KEY` is not set where the app runs (see
[apply-database.md](#which-key-the-app-uses-and-what-rls-does-to-it)). Nothing was
changed in either case: the app refuses a change it cannot record.

**Undo.** Roll back to the host's previous release. The new tables stay; the previous code ignores them.

##### B3. Bootstrap two Super Admins

Super Admins are the only accounts created outside the app, and only by you (owner decision D4).
Two of them, because granting any privileged role in the app needs two different Super Admins, and
there is no single-admin mode.

For each person:
1. Authentication → Users → **Invite user**, with their email. They open the email and set a
   password.
2. Open `database/bootstrap/super-admin.sql`, fill in `v_email` and `v_name` at the top, and run it.
   It refuses to run with the placeholders, refuses if the person has not accepted the invite, and
   does nothing if they are already a Super Admin.

**Check.** The verification block at the end of the file. Run all four. Checks 3 and 4 must
**fail** with an error, and roll back:
1. Lists the Super Admins so far.
2. Lists one `bootstrap` audit row per grant; `audit_verify_chain()` returns NULL.
3. The app's role tries to bootstrap and the trigger refuses.
4. The app's role tries to edit the audit log and is refused.

**Undo.** The file's rollback revokes the assignment (assignments are history, never deleted), and
optionally suspends the profile. It applies to the person's next request.

##### B4. Sign in with a staff account, and verify

Each Super Admin, on their own device:
1. `/admin/login` → email and password → **Sign In**.
2. The first time: "Set up your second factor". Scan the QR code with an authenticator app (any TOTP
   app), or type the key shown under it, then enter the 6-digit code.
3. Every time after: the code only.

**Check.**
- `/admin` says "Signed in as <name> · super admin". A Super Admin sees sync, stats, the activity
  log and the articles list, but no editorial controls: no publish form, no banner manager, and the
  list's edit and delete buttons answer 403. The plan gives Super Admin no editorial verbs. That is
  intended, not a fault.
- The audit log has the sign-in and the factor:

  ```sql
  SELECT actor_label, action, outcome, at FROM public.audit_log
   WHERE action LIKE 'auth.%' ORDER BY seq DESC LIMIT 10;
  ```
  Expect `auth.sign_in` / `succeeded`, `auth.mfa_enroll_started`, `auth.mfa_enrolled`, then
  `auth.mfa_verified` at later sign-ins.

**Undo.** Nothing to undo. If a staff sign-in fails, the shared password still works.

Granting editorial roles (Managing Editor, Desk Editor and the rest) in the app is Panel 1. Until
then, editorial work continues on the shared password, now recorded as `legacy:shared-password`.

##### B5. Freeze `admin_logs`

Nothing writes `admin_logs` since the deploy: staff actions and the cron write `audit_log`. Run
`database/migrations/2026-11-02-access-3-freeze-admin-logs.sql`.

**Check.** The queries at the end of the file:

```sql
SELECT has_table_privilege('service_role', 'public.admin_logs', 'SELECT');  -- true  (still readable)
SELECT has_table_privilege('service_role', 'public.admin_logs', 'INSERT');  -- false
```

Its history stays readable in the app at `GET /api/admin/logs?source=legacy` (`audit.read`).

**Undo.** `GRANT ALL ON public.admin_logs TO service_role;` (in the file).

##### B6. Only then: turning the shared password off

Turn it off only when all three hold:
- two Super Admins have signed in with their second factor, in production (after the AWS deployment);
- Panel 1 is done, so editorial staff have their own accounts and roles;
- you decide to.

Set `ADMIN_LEGACY_LOGIN=off` in the app's environment (on AWS, where its variables are configured),
then restart or redeploy it: the variable is read by the running server.

**Check.** The shared password gets 403 "The shared admin password has been retired". An old
shared-password cookie gets 401 from the proxy.

**Undo.** Remove the variable and restart. This works only until 00:00 IST on 1 January 2027. After
that, the shared password is refused by the code itself and no setting brings it back. The last
step is a code change that deletes it, with `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` (design §7).

---

#### Getting back in, and other emergencies

Your own way in never depends on the app: the Supabase dashboard and the SQL editor (locally, Studio
and `psql`; there, a reset is also always available).

**A staff member lost their authenticator device.** Authentication → Users → the user → remove
their MFA factor. Then sign them out of all sessions on the same page. At their next sign-in they
get the set-up step again. Record what you did:

```sql
INSERT INTO public.audit_log (actor_type, actor_label, action, outcome, entity_type, entity_id, reason)
VALUES ('bootstrap', 'owner:sql-editor:' || current_user, 'auth.mfa_reset', 'succeeded',
        'staff', '<user id>', 'lost device: <who asked, how you checked it was them>');
```

The app itself refuses to replace a verified factor (409). A stolen password alone cannot swap one.

**The last Super Admin is locked out** (lost device and no other admin, or a forgotten password).
Reset their password or factor in the dashboard as above. Or invite a new account and run the
bootstrap script for it (step 3).

**A session may be stolen.** Authentication → Users → the user → sign out of all sessions. Then
revoke their assignments, and suspend them if needed. Until Panel 1 this is SQL:

```sql
BEGIN;
UPDATE public.role_assignments
   SET revoked_at = now(), revoked_by = NULL, revoke_reason = '<why>'
 WHERE user_id = '<user id>' AND revoked_at IS NULL;
UPDATE public.staff_profiles SET status = 'suspended' WHERE user_id = '<user id>';
COMMIT;
```

The app reads assignments and status on every request, so this applies to their next request.
Signing them out ends the session itself.

**Is the audit log intact?** Run `SELECT public.audit_verify_chain();` weekly, and whenever in
doubt. NULL means intact. A number is the first row that does not verify. A rewrite of the whole
chain is caught only by a copy of its head kept elsewhere ([BL-034](#backlog)).

### Staff sign-in or an admin action is failing

Panel 0's main flow is: email and password, then the authenticator code, then an admin action that
writes two audit rows. This page starts from what the person sees, names the cause, says how to
confirm it, and what to do. Getting a locked-out person back in is in
[`staff-access.md`](#getting-back-in-and-other-emergencies).

Two rules hold whatever is wrong:

- **Nothing here needs the app.** The Supabase dashboard and its SQL editor always work, and the
  SQL in this page runs there. The queries that only read are safe at any time; anything that writes
  is an owner action.
- **A refusal never changes anything.** Every 403 and 503 below was decided before the change, so
  there is nothing to undo. Check `audit_log` to see what was refused, and why.

#### First: what Sentry says

Every failure of the system on this path reaches Sentry with `tags.source = supabase` and an
`extra.operation`. A person's own mistake (a wrong password or code) is not reported.

| `extra.operation` | Where | What failed |
|---|---|---|
| `loadStaffRecord` | sign-in (`extra.at = sign-in`), and every admin request | reading `staff_profiles` or `role_assignments` |
| `listFactors` | `POST /api/admin/mfa` | reading the user's factors from Supabase Auth |
| `enroll` | `POST /api/admin/mfa` | starting a TOTP enrolment |
| `beginAudit` | every audited change | writing the `attempted` row: the change was refused |
| `finishAudit` | every audited change | writing the outcome row: the change happened, its outcome row is missing |

#### By what the person sees

| They see | Cause | Confirm | Do |
|---|---|---|---|
| **"Incorrect email or password."** for everyone, right password or not | The email provider is off, or Supabase Auth is down. Supabase answers "Email logins are disabled", which the app does not pass on (it never says which part was wrong) | Dashboard → Authentication → Sign In / Providers → Email: the provider must be on | Turn the provider on. Sign-ups stay off through "Allow new users to sign up" |
| "Incorrect email or password." for one person | Their password | Dashboard → Users → the user → last sign-in | Send them a password reset |
| **"This account is not a staff account."** (403) | A valid user without a `staff_profiles` row | `SELECT * FROM public.staff_profiles WHERE user_id = '<id>';` returns nothing | Add the profile. Until Panel 1, by SQL, as in `staff-access.md` |
| **"This staff account is suspended."** (403) | `status = 'suspended'` | The same query | Reactivate only if that was a mistake; the suspension is recorded in the audit log |
| **"Could not check your account. Try again."** (503 at sign-in) | The staff record could not be read: the database is unreachable, or a grant is missing | Sentry `loadStaffRecord`. `SELECT has_table_privilege('service_role', 'public.staff_profiles', 'SELECT');` must be `true` | Restore the database or the grant (re-apply `2026-11-02-access-1-foundation.sql`: idempotent). The person was signed back out; they retry |
| "Staff sign-in is not configured." (503) | `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` unset on the server | The deployment's environment | Set both, redeploy. The shared password still works meanwhile, until it is retired |
| **"Could not start the set-up."** (502), or "Could not read your second-factor status." (503) | Supabase Auth refused the MFA call; TOTP is off for the project | Sentry `enroll` or `listFactors`. Dashboard → Authentication → Multi-factor: TOTP on | Turn TOTP on |
| **"That code is not right."** (401) every time | The phone's clock is off: a code is valid for 30 seconds | The time on the phone against an accurate clock | Set the phone to automatic time. After five tries in 15 minutes, that user gets 429 |
| "A second factor is already set up." (409) at set-up | They lost the device and are enrolling again | — | The lost-device steps in `staff-access.md`. The app never replaces a verified factor, on purpose |
| "Too many login attempts." (429) | Ten attempts from one address in 15 minutes | — | Wait the minutes the message names. Without Upstash each server instance counts on its own |
| **"This action needs a second factor."** (403, `mfa_required`) | Signed in with the password, not yet the code | `audit_log`: a `denied` row with `reason = 'mfa_required'` and `aal = 'aal1'` | Finish signing in with the code (the dashboard links to it) |
| "You don't have permission for this action." (403, `forbidden`) | No live assignment grants it (none, revoked or expired), or the shared password, which has a fixed list | `SELECT role_key, language, section, expires_at, revoked_at FROM public.role_assignments WHERE user_id = '<id>';` | Grant the role. A privileged role needs two Super Admins (the database refuses otherwise) |
| "This action needs a second approver…" (403, `needs_approval`) | The permission is A (two people) in the plan's matrix, and approvals come with a later panel | — | Nothing to fix: refused by design until then |
| **"The audit log could not be written, so nothing was changed."** (503) | The `attempted` row failed, so the change was refused (owner decision Q2) | Sentry `beginAudit`. `SELECT has_table_privilege('service_role', 'public.audit_log', 'INSERT');` must be `true`. Then `SELECT public.audit_verify_chain();` | Restore the grant (re-apply access-1) or the database. Retry the action: nothing was half-done |
| "Could not check your permissions. Nothing was changed." (503) | The staff record could not be read on an admin request | Sentry `loadStaffRecord` | As for "Could not check your account" |
| "The shared admin password has been retired." (403) | `ADMIN_LEGACY_LOGIN=off`, or it is 2027-01-01 IST or later | — | Use a staff account. Before the date, removing the variable brings it back (`staff-access.md`, step B6) |
| "Unauthorized: please log in." (401) on every request after signing in | The session cookie is not kept: a `secure` cookie over plain HTTP, or a clock far off on the server | The browser's cookies for the site | Serve over HTTPS. A production build (`next start`) marks both session cookies `secure`; browsers accept that on `http://localhost` only, so a LAN address over HTTP signs no one in |

#### If an action happened but its outcome row is missing

Sentry `finishAudit`. The change was made. Its `attempted` row stands, and no row points back to it
(an attempt without an outcome, owner decision Q2). Check the change itself, then record it:

```sql
INSERT INTO public.audit_log (actor_type, actor_label, action, outcome, attempt_id, entity_type, entity_id, reason)
VALUES ('bootstrap', 'owner:sql-editor:' || current_user, '<the action>', 'succeeded', '<attempted row id>',
        '<entity type>', '<entity id>', 'outcome written by hand: <how the change was checked>');
```

#### What the automated tests cover

The unit tests cover the routes' answers on this page with Supabase stubbed:
`apps/admin/src/app/api/admin/login/route.test.ts`, `mfa/route.test.ts`, `access.test.ts` and
`packages/server/src/auth/*.test.ts`.
What Supabase itself answers (a provider switched off, TOTP disabled) they cannot show. The browser tests (`npm run test:e2e`)
are read-only: the refused access while signed out, and the sign-in page's accessibility. Nothing
automated signs in against the real database, so after a change to this flow the check is the
owner's, by hand: [`staff-access.md`](#staff-access-switching-on-panel-0-and-getting-back-in), step B4.

## Current status

> **A deployment now (owner, 2026-11-02):** the owner's senior asked for one. The release is
> prepared on `release/v1` (R0–R4), hosted on AWS `ap-south-1` (owner, 4 Nov 2026, replacing R0's
> Vercel); panel work is paused until then.
>
> **The real database (owner decision, 2026-11-02).** The env file (the root `.env`; `.env.local`
> until 2026-11-04) holds the real database's credentials, and the app uses them. The local database
> was dropped. **Never read, print or edit an env file.** You never write to the real database yourself: no SQL, no migrations, no
> bootstrap, no test users, no destructive or tamper tests. The app's normal behaviour (reading news,
> ingesting articles, caching scraped content) is fine. Browser tests are read-only. A schema change
> is an owner action in a runbook. Since `78e58b6` every admin change writes `audit_log` first and
> refuses with 503 without it, so the admin needs Panel 0's migrations wherever it runs.
>
> **Branch rule:** all work happens on a branch (`panel-N-<name>`, `fix/<topic>`, `chore/<topic>`),
> and only that branch is pushed. Nothing is pushed to `main` directly: a branch is merged into
> `main`, and `main` pushed, only after the owner approves.

**For:** a fresh Claude session (or engineer) continuing this work with no prior context.
**State as of:** 2026-11-04. The branch `chore/integrate` brought three lines of work into `main` in
one pull request: `main` itself (`release/v1`), Panel 0's second half (`panel-0-access`), and
`chore/restructure` (the owner-approved plan [`NEWSROOM_PLAN.md`](NEWSROOM_PLAN.md), its research
[`RESEARCH.md`](RESEARCH.md), [the access rules](PANEL_DOCS.md#access-rules), and the
apps/packages split, [ADR 0006](ARCHITECTURE.md#adr-0006--three-apps-over-shared-packages-2026-11-04)). **Panel 0 (Access foundation) is
complete in code** ([`PANEL_DOCS.md`](PANEL_DOCS.md), §4) and paused for `release/v1`. None of its
SQL is applied. Its database-level checks (the two-admin trigger, the audit hash chain, the
bootstrap) are **unverified**: the owner verifies them against the real database with
[the staff-access runbook](#staff-access-switching-on-panel-0-and-getting-back-in), Part B, when panels resume. Before it, five
restructures and all five audit phases were done:
- **Restructure 5** (the plan's Phase C, ADR 0006): `apps/web`, `apps/admin` and `apps/worker` over
  `packages/server`, `packages/shared` and `packages/ui`.
- **Restructure 4** ([ADR 0005](ARCHITECTURE.md#adr-0005--the-standard-nextjs-src-layout-2026-11-02-superseded-by-0006), superseded by ADR 0006): the
  standard `src/` layout and the cleanup.
- **Restructure 3** (on `main`, [ADR 0004](ARCHITECTURE.md#adr-0004--four-top-level-folders-four-documents-2026-11-03-superseded-in-part-by-0006)):
  four top-level folders and four documents. Its code layout gave way to restructure 5 when `main`
  was merged here; its env-file, docs and settings rules carried over.
- **Audit Phases 1–5** fixed the 28 audit findings. None is open: 22 are resolved, 5 await a check
  that needs production or the owner, and 1 (F-028) is partial. Status per finding:
  [the audit ledger](#audit-ledger).
- **Restructure 2** (S0–S5, [ADR 0002](ARCHITECTURE.md#adr-0002--frontend-backend-shared-and-database-separation-in-one-nextjs-app-2026-10-30-superseded-by-0004-in-part-and-by-0005), now superseded by
  ADR 0005) split the code into `app/`, `frontend/`, `backend/`, `shared/` and `database/`.
- **Restructure 1** (Phases A–E, [ADR 0001](ARCHITECTURE.md#adr-0001--feature-first-structure-with-layer-separation-and-a-ci-enforced-boundary-2026-10-30-superseded-by-0002), now superseded)
  came before it.

**Next:**
1. **`release/v1`** on `main`, in the apps/packages layout. Panels are paused meanwhile.
2. **When panels resume, finish Panel 0** (the plan's Phase A):
   - the owner applies the SQL and runs Part B of the staff-access runbook against the real database, which
     verifies the two-admin trigger, the audit hash chain and the bootstrap;
   - what is done of definition-of-done items 7–13, and what is not, is in PANEL_DOCS (Panel 0,
     "Tests and verification").
3. The owner approves Panel 0 as Done.
4. **Phase B:** `fix/aggregator-off`, then `fix/audit-closeout`:
   - F-028 / BL-028 (theme ternaries);
   - the local SQL checks for F-006, F-008 and F-018;
   - the F-002 fallback check;
   - BL-030 (lazy-load the chatbot).
5. Then Panel 1, on `panel-1-administration` (granting roles in the app, the access review,
   retiring the shared password).

The plan is [`NEWSROOM_PLAN.md`](NEWSROOM_PLAN.md); the access rules are in [PANEL_DOCS.md](PANEL_DOCS.md#access-rules); the panels, one at a time, are in
[`PANEL_DOCS.md`](PANEL_DOCS.md). Run `git log --oneline -20` on the branch for the exact head.

Read §1 and §3 before touching anything. §3 in particular will save you from false conclusions
that have already been reached and discarded once.

---

### 1. Start here

**What this is.** A bilingual (English/Hindi) news aggregator on Next.js 16.4 / React 19.
NewsData.io → Supabase (7-day rolling window) → Supabase-first read path with Upstash Redis
caching. Plus a Cheerio article scraper, Claude Haiku for chat and category classification, an
unofficial Google Translate wrapper, and a session-gated admin panel at `/admin`.

**Where the work stands.**
- **Restructure 1** (Phases 0, 1, A–E) built the knowledge base (PRD, CODEMAP, architecture), took
  the owner's five product decisions (§9), and moved the code into a feature-first `src/`. It also
  made the import rules fail CI.
- **Audit Phase 1** cleared the critical and high dependency advisories and added `/api/health`.
  **Phases 2–5** (after restructure 2) fixed the security findings, the data layer and the
  failure and UX findings, then closed out (§4). Every finding has a status in the audit ledger.
- **Restructure 2** answered the reviewer's request to make frontend, backend, database and docs
  visibly separate. One app, with `src/app/` as a routing shell
  ([`ARCHITECTURE.md`](ARCHITECTURE.md#architecture) §4):
  - The cleanup came first (S1, with follow-ups the owner approved in S2): two stale docs, five
    unused SVGs, an unused script, three unused exports, 24 dead translation keys, two unused colour
    fields, four unused dependencies.
  - S3 moved 95 files in 11 slices. The route table stayed identical and the CSS byte-identical,
    and the client JS changed by 35 bytes.
  - S4 rewrote the lint boundary rules for the new layers (F1–X1 plus V1), opened every backend
    module with `import "server-only"`, and proved each rule with a deliberate violation (46
    probes).
  - S5 brought every document up to date.
- **Phase F (decomposing the oversized files) is optional and not started** (§6).

**The single most important fact:** Supabase **was** failing every call with `TypeError: fetch
failed` until about 29 Oct, and the app hid it by silently serving NewsData.io. On 30 Oct it is
reachable again with no code change (F-002 in the audit ledger). It can no longer fail silently:
`/api/health` answers 503 when it is down, and each fallback is reported to Sentry, rate-limited.
Check `/api/health` before assuming the database is either up or down.

**Key documents in this repo** (seven Markdown files and no others; `npm run check:docs` holds it):

| File | What it holds |
|---|---|
| `CLAUDE.md` | **Every session, first.** Start here: the plan, the branch rules, the database rules |
| `docs/README.md` | Setup, commands, the folder structure, where new code goes, the commit rules |
| `docs/OPERATIONS.md` | Environment variables, deployment, the runbooks, **this current status**, the backlog (BL-001..BL-038) and the audit ledger (F-001..F-028) |
| `docs/NEWSROOM_PLAN.md` | **The build plan.** The phases from Panel 0 to launch and after, their order, owner tasks and the sign-off |
| `docs/ARCHITECTURE.md` | The flows, the layout, the import rules, and the decisions (the owner's, and ADRs 0001–0006) |
| `docs/PANEL_DOCS.md` | **For the back office.** The definition of done; the access rules (panels, roles, the permission matrix the catalogue SQL is generated from, four-eyes and MFA rules, data model); progress (panels 0–9) and each finished panel's record; Panel 0's design as approved (D1–D12, Q1–Q8) |
| `docs/RESEARCH.md` | The sourced research behind the plan |

The runbooks that matter now, all in OPERATIONS: [apply the database files](#applying-the-database-files)
(an owner action), [staff access](#staff-access-switching-on-panel-0-and-getting-back-in) (switching Panel 0 on, in order, and
getting back in) and [sign-in broken](#staff-sign-in-or-an-admin-action-is-failing).

There is also a published audit artifact (28 findings, severity-filterable):
`https://claude.ai/artifact/Hpo9Q5pJg1vw7ZjXyuT8Ck` — private to the owner.

### 2. Environment and commands

| | |
|---|---|
| Platform | Windows 11. Both PowerShell and Git Bash available |
| Node / npm | v24.19.0 / 11.17.0. **Node 24 everywhere** since `974b255`: `engines` `24.x`, which CI reads (`.node-version` deleted, from `main`'s `5da44cd`) |
| Dependencies | Installed via `npm ci` |
| Dev server | **Stopped** during both restructures (its Turbopack watcher can lock files during `git mv`). `npm run dev` to start |
| Database | **The real one, in the root `.env`** (`.env.local` until 2026-11-04; owner, 2026-11-02; the local database was proposed, set up, and dropped: `d587e56`, reverted in `67359e6`). Never read, print or edit an env file. Never write to the database yourself; the app's normal reads, ingestion and caching are fine. Browser tests are read-only |
| Deployment | **The release now** (`release/v1`, owner, 2026-11-02), on AWS `ap-south-1` (owner, 4 Nov 2026; [Deployment](#deployment)) |
| Line endings | **CRLF** in a Windows working tree (`core.autocrlf=true`); LF on the owner's macOS checkout. The index is LF |
| Git identity | Set locally for this repo: `Vivek Singh <vivektech.dev25@gmail.com>`. Not global |

```bash
npm run dev               # the reader site (apps/web), http://localhost:3000
npm run dev:admin         # the back office (apps/admin), http://localhost:3001/admin
npm run job -- <name>     # a worker job (apps/worker); refresh-news writes to the configured database
npm run verify            # THE GATE: typecheck -> lint -> test -> build -> check:js-budget
npm run test:e2e          # Playwright (Chromium), read-only, against production builds of both apps
npm run check:js-budget   # each route's client JS against scripts/js-budget.json (needs a build)
npm run typecheck         # tsc --noEmit, for every app, every package and the root
npm run lint              # eslint, including the boundary rules (eslint.config.mjs)
npm test                  # jest
npm run test:ci           # jest with coverage
```

**Baselines at the pause of Panel 0, on the branch `panel-0-access` (`1a215a0`, 2026-11-02).** Compare against these after any change:

| Measure | Value |
|---|---|
| Routes | **30**, identical to `_baseline-routes.txt` (Panel 0 added `/api/admin/me` and `/api/admin/mfa`) |
| Client JS | **981,876 bytes** in 18 chunks (976,061 at the audit close-out). Per route (entry chunks only): `/admin` 164,372 · `/article/[slug]` 141,655 · `/` 125,795 · `/saved` 113,333 · `/contact` 100,601 · `/about`, `/privacy`, `/terms` 97,443 each · `/admin/login` 35,636 · `/_not-found` 28,259. Panel 0 changed only the two admin pages: `/admin` +1,929 (the clear button out, `/me` and the permission checks in; then +271 for the role, id and aria-label attributes), `/admin/login` +3,886 (staff sign-in and the MFA steps; then +13 for `role="alert"`). The JS budget (`scripts/js-budget.json`) counts each route with the shared framework chunks: `/admin` 753,710 of 791,552, `/admin/login` 624,974 of 656,384 |
| CSS | **93,942 bytes**, one file, 927 selectors (+6 in Panel 0, for the notices and the code field) |
| Tests | **49 suites, 757 tests**, all passing. Browser tests: **10**, read-only (`npm run test:e2e`) |
| Coverage | **93 files** (the shims excluded): 60.07% of statements (8,635 of 14,374), 74.98% of branches, 74.35% of functions. `backend/` + `shared/`: 78.02% (5,514 of 7,067). `proxy.ts`: 100% (it was 0%) |
| Lint | **0 errors, 13 warnings** (all in source; BL-002 accounts for two) |
| Boundaries | Lint zones (`eslint.config.mjs`) and `import "server-only"` on every `packages/server/src/` module; `check:boundaries` was removed in restructure 4 |
| `npm audit` | **37: 0 critical, 0 high, 34 moderate, 3 low**. The moderates are dev and build tooling (BL-031); the lows are the accepted jest set |

**After restructure 4 (`chore/restructure`, same machine as a fresh build of `panel-0-access`):**
routes identical (30); client JS **980,692 bytes** (−900): `/` 125,360 · `/article/[slug]` 141,469 ·
`/admin` 163,762 · `/saved` 113,090 · `/contact` 100,358 · `/about`, `/privacy`, `/terms` 97,307
each · `/admin/login` 35,541 · `/_not-found` 28,175; CSS **93,939 bytes**, byte-identical (the
93,942 above was measured on Windows); 47 suites, 736 tests; lint 0 errors, 13 warnings.

**After restructure 5 (the apps/packages split, same machine):** `apps/web` 15 routes, `apps/admin`
16 routes plus the proxy; every old route present (the cron route became the worker's
`refresh-news` job; `/api/news/breaking-news` is new). Client JS, web: `/` 125,071 ·
`/article/[slug]` 141,328 · `/saved` 112,909 · `/contact` 100,205 · `/about`, `/privacy`, `/terms`
96,768 each · `/_not-found` 28,135. Admin: `/admin` **80,206** (was 163,762) · `/admin/login`
**23,705** (was 35,541). CSS: web 83,122 bytes, admin 47,737. 50 suites, 753 tests; lint 0 errors,
13 warnings. Measure each app from its own folder (`apps/<app>/.next`).

**After Panel 0's second half joined the split (`chore/integrate`):** 52 suites, 774 tests; 10
browser tests (web runs `reader.spec`, admin `admin-access` and `accessibility`). The JS budget
counts each route with the shared framework chunks, per app: web `/` 713,895 · `/article/[slug]`
730,152 · `/saved` 701,733 · `/contact` 689,029 · `/about`, `/privacy`, `/terms` 685,592 each;
admin `/admin` **668,614** (was 753,710 in one app) · `/admin/login` **611,836** (was 624,974).

Client JS is the sum of `.next/static/chunks/**/*.js`. A route's JS is the chunks listed in
`entryJSFiles` of its `.next/server/app/**/page_client-reference-manifest.js`. Chunk bytes move
when module ids do (§3.17).

```
tsc --noEmit             exit 0
eslint                   exit 0   (0 errors, 13 warnings)
jest --ci                52 suites, 774 tests passed
next build               exit 0   (web 15 routes, admin 16 plus the proxy)
check:js-budget          exit 0   (13 routes in 2 apps within budget)
playwright test          10 passed (read-only)
```

### 3. Gotchas that have already burned time

These are not theoretical. Each one caused a wrong conclusion or a failed command in an earlier
session.

#### 3.1 This is not the Next.js you were trained on

Next 16.4 postdates most published material. **`CLAUDE.md` requires reading
`node_modules/next/dist/docs/` before relying on any framework convention.** Known traps:

| Looks wrong | Actually correct |
|---|---|
| `apps/admin/src/proxy.ts` instead of `middleware.ts` | Next 16 **renamed Middleware to Proxy**. Correct as-is, in `src/` beside `app/` (required with a `src/` folder) |
| `preload` prop on `next/image` | Correct. **`priority` is deprecated as of v16.0.0** — the familiar prop is the wrong one |
| `remotePatterns` hostnames using `{,*.}host` glob | Correct. Hostnames are matched with **picomatch**, not string equality (`next/dist/shared/lib/match-remote-pattern.js`) |

`remotePatterns` is capped at **50 entries** (zod `.max(50)` in `next/dist/server/config-schema.js`).
The list in `packages/shared/src/config/imageDomains.ts` holds 49. One slot free.

> A previous pass flagged `preload` as a bug. It was wrong, and the bundled docs settled it.
> **When docs and memory disagree, the bundled docs win.**

#### 3.2 Check whether Supabase is up before diagnosing anything

It was down until about 29 Oct — every operation failed: Select, Upsert, Purge, Freshness Check,
breaking-news read — and it is up again on 30 Oct. `GET /api/health` answers 200 or 503;
`/api/admin/health` (with a session) names the failing dependency and an error code. Or confirm
with:

```bash
curl -s -D - -o /dev/null "http://localhost:3000/api/news/top-headlines?refresh=true" | grep -i x-data-source
# newsdata on a fresh table means Supabase failed; supabase or cache means it answered
```

The `X-Data-Source` header tells you which tier answered: `cache` / `supabase` / `newsdata` / `mock`.
Also check `.next/dev/logs/next-development.log` for the actual errors.

#### 3.3 CRLF breaks multi-line string anchors

Source files use CRLF in the working tree. Any script doing a multi-line find/replace must
normalise:

```js
const crlf = s.includes('\r\n');
const fix = t => crlf ? t.replace(/\r?\n/g, '\r\n') : t;
```

Single-line anchors are fine. Multi-line ones silently fail to match without this.

#### 3.4 Bash heredocs choke on this content

Heredocs containing backticks, `${...}`, or HTML repeatedly failed with quoting errors. **Use the
Write tool for file content, or write a Node script to a scratch file and run it.** Do not fight
the shell. Inline `node -e` with backslash regexes breaks the same way.

#### 3.5 `/tmp` paths don't resolve in Node on Windows

`node -e "require('/tmp/x.json')"` fails. Node also resolves `require()` relative to the *script's*
directory, not the cwd. Use absolute Windows paths, and for project modules use
`require(process.cwd() + '/node_modules/...')`.

#### 3.6 Jest coverage was lying

`collectCoverageFrom` was unset, so coverage instrumented only files the tests imported — it
reported **91.42%** while describing 5 of 73 source files. Fixed in `4e79cb1`. The real number was
**4.41%**, fell to **3.50%** when `3805007` deleted the paraphraser — one of the few well-covered
modules — and was **3.63%** at `9f3b76f` only because later deletions shrank the denominator.
Restructure 2 measured the whole repo by glob (`7ef8ab8`), and the audit fixes added tests: **9.27%**
of statements at the end of restructure 2. Since restructure 4 the glob is `src/**`. The oversized files in §6 still read **0%**.

#### 3.7 `eslint-disable-next-line` placement

It disables the **next line**, including a comment line. Putting it at the top of a multi-line
explanation block disables the comment, not the code. The explanation goes first; the directive sits
immediately above the statement.

#### 3.8 Two npm postinstall scripts are blocked

`@sentry/cli` and `unrs-resolver` were blocked by sandbox policy. **This does not break anything** —
`npm run build` and `npm run lint` both work. (An earlier claim that it might break the build was
wrong.) `npm approve-scripts --allow-scripts-pending` if source-map upload is ever needed.

#### 3.9 Never print the env file

The root `.env` (`.env.local` until 2026-11-04) holds real credentials. It is never read, copied or moved, including for worktrees and probe
builds (owner instruction); a probe build runs without it. Keys set at the last check (names only):
`ADMIN_PASSWORD`, `ADMIN_SECRET_TOKEN`, `ADMIN_SESSION_SECRET`, `CRON_SECRET`,
`MEDIASTACK_API_KEY`, `NEWSDATA_API_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

Note `ADMIN_SECRET_TOKEN` is set but **read by nothing** — leftover from the stale
`.env.local.example` that the README now corrects.

#### 3.10 Moving or deleting a route breaks `typecheck` until `.next/types` is cleared

`npm run verify` runs `typecheck` **before** `build`, and `tsconfig.json` includes the previous
build's generated route types. After a route file moves or is deleted, `tsc` reads a stale validator
still importing the old path:

```
.next/types/validator.ts: error TS2307: Cannot find module '../../src/app/.../route.js'
```

The source is fine — do not "fix" it. `rm -rf .next/types` and re-run. It hit the RSS deletion
(`bcd5393`), and every restructure-2 slice that touched `src/app/` cleared `.next/types` first. Durable
fix: `next typegen` in the `typecheck` script (BL-007).

#### 3.11 Verify claims against the build, not just the graph

Lint checks imports one at a time. When it matters, check the production bundle: `grep -l <distinctive-string> .next/static/chunks/*.js`, then find which route loads that
chunk in `.next/server/app/**/page_client-reference-manifest.js`. That is how the Supabase SDK in
`/admin`'s chunk was confirmed (`GoTrueClient`), with server-only strings as a negative control, and
how S5 confirmed a same-length image URL change actually shipped.

#### 3.12 A barrel imported by a server component ships every client component it re-exports

Measured in restructure 1, slice 5: `apps/web/src/app/layout.tsx` importing `BreakingNewsBanner` from the admin
feature's barrel put all five admin dashboard components on **every** route (+46 KB on `/`).
`"use client"` on the barrel does not help — the module count drops but the bytes stay. What fixes
it was a `package.json` of `{ "sideEffects": false }` in each feature folder (`bae6f8a`; restructure
2 measured +457 to +84,579 bytes per route without it). **Restructure 4 removed the barrels
instead**: every component is imported from its own file, and client JS fell 900 bytes. **Do not add
an `index.ts` that re-exports client components**; if one is ever needed, it needs that
`package.json` back.

#### 3.13 `sed -i` silently converts CRLF files to LF

Git Bash's `sed -i` rewrites the line endings of every file it touches. The index is LF
(`core.autocrlf=true`), so commits are unaffected, but the working copy drifts. Rewrite with a Node
script that detects and restores `\r\n`, and check with `git ls-files --eol <file>`.

#### 3.14 Path-keyed lists go stale silently on a move

A policy list that tolerates a stale path reports success while checking nothing. The scripts this
was written about (`generate-codemap.mjs`, `move-map.mjs`) were deleted in restructure 4. What is
left that walks paths: the route walk in `apps/admin/src/app/api/admin/access.test.ts` (it reads
`apps/admin/src/app/api/admin/**/route.ts` and fails on a route the policy does not name).

#### 3.15 Directory renames fail on Windows while the editor watches them

`git mv src/app app` failed with "Permission denied": VS Code's TypeScript server holds watch
handles on the directories. Restructure 2 moved files one by one instead (`git mv` per file, with
`GIT_LITERAL_PATHSPECS=1` for paths like `[slug]`), then removed the empty folders. Do not kill
editor processes to get around it (owner instruction).

#### 3.16 Tailwind v4 scans every file that is not git-ignored

Class detection is automatic and reads Markdown and comments too. A word in a document once removed
a CSS rule when the document was deleted (BL-018). `apps/web/src/app/globals.css` now excludes
`docs/`, `scripts/`, `database/` and the root `.md` files with `@source not`, with paths relative to
the stylesheet. Code comments and tests are still scanned: `.transform` is in the CSS only because
`jest.config.ts` comments say "transform".

#### 3.17 Turbopack's chunk bytes move when module ids do

Module ids derive from paths, so a pure move changes chunk bytes with no code change. Restructure 2
compared a **normalised** JS size per route (digits, hashes, chunk names and UUIDs neutralised) to
tell that noise from real growth. In S3 the normalised size moved only where the code really
changed; the one growth kept was the X1 entry point on `/` (109 bytes at slice 9, 50 by the end of
S3; ADR 0002).

#### 3.18 `next start` reads the env file, so a local run uses the real Supabase

Next loads the env file itself (`.env.local` until 2026-11-04; the root `.env` since, §3.25). A local `next start` therefore runs the app's normal flow against
the configured project: a stale table triggers a NewsData fetch and an upsert. (Before F-015, the
feed's read path also purged old rows.) In audit Phase 4, `next start` was run only to read static
HTML (`/about`, and an `/article/...` URL without `?url=`), on port 3123, so the article page's
suggestions fetch to `localhost:3000` failed and wrote nothing. The S3 smoke tests did exactly that (reported to the owner). Nothing
in this repo writes to the database by hand: SQL changes are files in `database/` that the owner
applies.

#### 3.19 `TaskStop` leaves `next start` running on Windows

Stopping a background `npx next start` with `TaskStop` kills `npx`, not its `node` child, which keeps
the port. The next `next start` then fails with `EADDRINUSE`, and `curl` silently answers from the
**old** build. Before trusting a page, list them with
`Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ? CommandLine -match 'next.*start'` and
stop the leftovers with `Stop-Process`.

#### 3.20 PowerShell's `$env:X = ""` deletes X, so Next fills it from `.env.local`

Next's env loader fills only keys that are `undefined` in the process (`@next/env`, `processEnv`). A
Panel 0 smoke test set every key the code reads to `""` in PowerShell to keep `.env.local` out.
On Windows that **removes** the variable, so Next loaded the real `NEWSDATA_API_KEY` and the feed
made one real NewsData.io request. Nothing was written: Supabase pointed at a local stand-in, and
Upstash was not configured. To run the app without `.env.local`'s values, spawn it from Node with an
explicit `env` object, where an empty string survives as "set".

#### 3.21 Windows PowerShell 5.1 reads UTF-8 files as ANSI, and writes a BOM

`Get-Content -Raw` without `-Encoding` decodes a BOM-less UTF-8 file as Windows-1252, so writing it
back turns `§` into `Â§` (it happened to a test file in Panel 0, repaired before commit).
`Set-Content -Encoding utf8` and `Out-File` add a BOM, which once reached a commit subject (amended
before push). Read and write text with Node, or the Write and Edit tools. Check a commit message's
first bytes with `git cat-file -p`, not through a PowerShell pipe, which adds its own BOM.

#### 3.22 Tailwind reads test files too

§3.16 again: a test id `"row-1"` produced a `.row-1` rule (grid-row) in the shipped CSS. Choose
ids that are not utility class names.

#### 3.23 The env-var test sees only tracked files

`check:boundaries` (removed in restructure 4) read `git ls-files`, and so does
`packages/shared/src/config/envExample.test.ts`. A gate run before a new file is added cannot see it. Register new
files with `git add -N <file>` before the gate.

#### 3.24 A lint zone silently passes an import it cannot resolve

Found on `main` during its four-folder restructure (restructure 3 there; gotcha 3.21 in its
OPERATIONS.md): `import/no-restricted-paths` judges the resolved path, and skips an import whose
path does not resolve, without a message. When `main`'s tsconfig moved into `frontend/`,
eslint-config-next's TypeScript resolver (which looks for `tsconfig.json` in the working directory)
stopped resolving `@/` imports, and every boundary zone let every aliased import through, from
`93627ad` to `63bd34b`. Lint still reported 0 errors; only probes showed it. Here,
`eslint.config.mjs` gives the resolver every app's and package's tsconfig (`project`). Probed on
2026-11-04: in `apps/web/src/components`, `import x from "@/app/layout"` and an import of
`@timesprime/server/lib/rateLimit` both fail. After any change to a tsconfig's place or its `paths`,
probe at least one zone with an aliased import before trusting lint.

#### 3.25 Next loads env files from the app's folder, and caches them

Each app's `next.config.ts` loads the root `.env` files with `loadEnvConfig` from `@next/env`. Next
has already called it for the app's own folder before it evaluates the config, and `@next/env`
returns that cached result to any later call unless `forceReload` (the fourth argument) is set.
Without it, from the split until 2026-11-04, no app read the root env file in dev, build, start or
jest, and nothing reported it: the apps fell back to mock articles and the in-memory cache. Probed
with a fake `.env` in a scratch folder. `envExample.test.ts` now proves the root `.env.test` reaches
the tests, which only happens through that call.

### 4. Commits — restructure 2, then audit Phases 2–5

`f260d3e` closed audit Phase 1. Everything after it is restructure 2. Restructure 1 and Phase 1 are
in `git log` before it, with their reasoning in ADR 0001 and the audit ledger.

| Stage | Commits | What it did |
|---|---|---|
| **S0** design | `b0c471b` | Move map v2 (95 files, 11 slices) and its checker, run against the rules before anything moved |
| **S1** cleanup | `26adbbd`..`8881bd1`, then `dbc4821`, `6327110`, `c2ab97a` | Deletions only, one category per commit. Two stale docs, five unused SVGs, an unused script, three unused exports, 24 dead translation keys, two unused colour fields (16 CSS rules), four unused dependencies |
| **S2** tooling | `6a1382d`..`381805f` | Tailwind stops scanning docs (BL-018); `@/frontend`, `@/backend`, `@/shared` aliases; layout-independent coverage, secret scan and CODEMAP; the per-slice checklist |
| **S3** moves | `b0fe915`..`2b9cb94` | 11 slices (slice 7 in six commits), pure moves. Plus `4460a40` (the news barrel stops exporting views), `ecdd8ea` (ADR 0002 draft), `bae6f8a` (`sideEffects: false`) |
| **S4** enforcement | `705b32e`..`5f6b0cc` | `@/*` removed; shims excluded from coverage by name; `import "server-only"` on all 32 backend modules (proved by a failing build); R5 restored; A1 and V1 added; lint rewritten for F1–X1 and V1, each rule proved by a probe (46 in all); BL-019 and BL-020 logged |
| **S5** docs | `c3c4387`..this file | BL-020 fixed (`c3c4387`); CONTRIBUTING's "Where does new code go?"; architecture, both ADRs, CODEMAP (and its generator's prose), README "Project structure", AUDIT-FINDINGS, PRD, backlog, this file |

Every commit passed `npm run verify`. Every commit that touched `src/app/` or deleted anything was
diffed against the route table, and every one matched it. CI was green at each push.

**Audit Phases 2–5** (after `f1d268c`). One finding per commit, each prefixed with its ID; tests first
for security code, and characterization tests first for untested UI and route logic.

| Phase | Commits | What it did |
|---|---|---|
| **2** security | `487eb47`..`25d1c7f` | F-003 (redirects revalidated, connections pinned), F-010 (size caps), F-020 and BL-013 (eviction), F-004 (login limit, digest compare), F-011 (scraper limit), F-005 (stored-article trust anchor), F-006 (search escaping), F-015 (purge off the read path) |
| **2** follow-up | `3d8b5ed`..`fcdf1db` | BL-016: the article page calls the scraper directly, which fixes BL-021; the public scraper takes only stored articles; Retry-After on chat and translate |
| **3** data layer | `db28a46`..`9e5c5ad` | F-008 (DDL and policies as files), F-018 (index migration), F-016 (feed fills to 40), the owner runbook with its rollback, the `#`-link tests |
| **4** honest failure, UX | `e582d2d`..`ecc4a31` | Admin search escaping, F-013, F-014, F-017, F-021, F-024, F-022, F-009, F-027, F-028 |
| **5** close-out | `96f192d`..this file | BL-027 (the first search result), BL-029 (no public-prefixed key), the ledger, PRD, CODEMAP, this file |

Every commit passed `npm run verify` and reported client JS and CSS. No route changed.

**Panel 0, the access foundation** (design approved with conditions; [`PANEL_DOCS.md`](PANEL_DOCS.md)).
Tests first for authorization code; characterization first for untested UI and the proxy.

| Part | Commits | What it did |
|---|---|---|
| Step 1, workflow | `862cf41`..`5f8b835` | PANEL_PLAN.md (from the owner's PDF), PANEL_DOCS.md, CLAUDE.md's panel section, README, this file |
| Step 2, design | `e9bce19`, `6bcfb4e` | BL-033; the design and ADR 0003 |
| First half, on `main` | `38ac276`..`f357d71` | The approval; BL-034; supabase-js 2.116.0; the access SQL; `decide` and `scope`; the shared password's end date; `requirePermission` with `@supabase/ssr` 0.12.7; every admin route wired, one per commit; the route walk; the cron as `system:cron`; `logAdminAction` deleted |
| Warning on `main` | `c35637f` | `main` is not deployable until the migrations are applied |
| Second half, branch `panel-0-access` | `d1bff91`..`e7bb6a8` | The bulk limit test; the proxy (characterized, then both sessions); `/me` and `/mfa`; staff sign-in and sign-out; the activity log read-only; the dashboard by `/me`; the sign-in page with MFA; CODEMAP; the runbooks; architecture; PANEL_DOCS; this file |
| Decisions and the local database, `panel-0-access` | `1462892`..`4de377c`, `d587e56` | The branch rule, no deployment until the end, the definition of done 7–13; the dev dependencies; the local database setup |
| The local database dropped, `panel-0-access` | `67359e6`, `ca21217` | `d587e56` reverted; `supabase` and `pg` removed |
| Paused for `release/v1`, `panel-0-access` | `1a215a0`, then this file | Read-only browser tests, Sentry captures, states and labels, the JS budget, the sign-in runbook (WIP); HANDOFF and PANEL_DOCS |

Every commit passed `npm run verify` before it was made, except `ebb7049`, whose tree failed
`check:boundaries` (§3.23). It was reverted, not patched. Six second-half commit messages state the
suite count one too high (`d8bf37a` 45, `523cc51` 46, `ced5f2a` and `e5c6914` 47, `4b809f5` and
`06da24b` 48; the logs say 44, 45, 46, 46, 47, 47). Their test counts are right. They were pushed,
so they are not rewritten. Client JS and CSS were reported per commit. The two admin pages grew,
with the causes recorded in their commits (§2).

**Retired:** `docs/TimesPrime-PRD-and-Architecture.pdf` was committed in `ddbcc9f`, then untracked
and git-ignored at the owner's direction. Do not consult the PDF if a copy exists on disk. The PRD
(`docs/PRD.md`) and the owner's `PANEL_PLAN.md` were retired on 4 Nov 2026 for `NEWSROOM_PLAN.md`
and the access rules (`PANEL_DOCS.md`); both are in git history.

### 5. Architecture

The flows (ingest, serve, authorise), the layout, the rules and each folder's responsibilities are
in [`ARCHITECTURE.md`](ARCHITECTURE.md#architecture). The tree, in short:

```
apps/web/        the reader site: src/app (pages, public APIs) · src/components · src/context · src/lib
apps/admin/      the back office: src/proxy.ts · src/app/admin · src/app/api/admin · src/components
apps/worker/     scheduled jobs: src/jobs.ts (refresh-news)
packages/server/ auth/ · repositories/ · services/{news,scrape,translate,classify,health} · lib/
packages/shared/ config/ · types/ · lib/      what both apps import
packages/ui/     ThemeContext
database/        schema.sql · policies.sql · migrations/ · bootstrap/ · seed/
```

**Authorisation, since Panel 0:** `apps/admin/src/proxy.ts` (matcher `/admin/*`, `/api/admin/*`) only checks that a
session exists. Every admin route body calls `requirePermission`, the **only** gate on the data,
because the app reads Supabase as `service_role` and bypasses RLS. A route outside the matcher is
still public, and an admin route without a rule fails the route walk (`access.test.ts`).
[`ARCHITECTURE.md`](ARCHITECTURE.md#architecture) §1 has the flow.

#### Files over 500 lines

| File | LOC | Statements covered |
|---|--:|--:|
| `apps/web/src/components/article/ArticleDetailView.tsx` | 970 | tested (F-005, F-013, F-017) |
| `apps/admin/src/components/ArticlesTable.tsx` | 751 | 0% |
| `packages/server/src/repositories/db.ts` | 678 | 71.8% |
| `packages/server/src/services/scrape/scrapeArticle.ts` | 580 | 87.1% |
| `apps/web/src/components/news/Header.tsx` | 568 | stubbed in tests |
| `apps/web/src/components/home/HomeClient.tsx` | 561 | tested (F-021, BL-027) |
| `apps/admin/src/app/admin/page.tsx` | 521 | tested (F-014) |

Per-file coverage: `npm run test:ci`, then `coverage/lcov-report/index.html`.

### 6. Structural work — where it stands

| Work | Status |
|---|---|
| Restructure 1: Phases 0, 1, A, C, D, E | ✅ Done (ADR 0001, superseded) |
| Restructure 2: S0 design, S1 cleanup, S2 tooling, S3 moves, S4 enforcement, S5 docs | ✅ Done (ADR 0002, superseded) |
| Restructure 4: the standard `src/` layout, cleanup of the restructure-2 tooling, ngrok and CORS | On `chore/restructure`, awaiting the owner (ADR 0005, proposed). Moved the feed's read path into `packages/server/src/services/news/topHeadlines.ts` |
| **Phase F** — decompose the oversized files; move route-body logic into services | Optional, not started; needs an owner decision |

#### Phase F candidates

Decomposing any of the files above edits a module body, so each needs a characterization test of
what it splits. The audit phases added most of them: `ArticleDetailView` (links, the AI panel, the
story area), `HomeClient` (the feed's fetches and search), `AdminView` (sync and purge),
`scrapeArticle` and `db.ts` (through their route and repository tests). Still untested:
`ArticlesTable.tsx`, whose two modals already sit at module scope and can move to their own files as
a pure move, and `Header.tsx`.

### 7. Known defects — current behaviour that is NOT intended

Numbered to match the retired PRD's §11 (in git history). Of DEF-01..25, all but six
are resolved:

| ID | What remains | Status |
|---|---|---|
| DEF-01 | Supabase reachable again and no longer silent; `/api/health` 200 and a Sentry fallback event in production | Pending verification (F-002) |
| DEF-07 | `breaking_news` and `admin_logs` DDL in `database/schema.sql`; the owner applies it | Pending verification (F-008) |
| DEF-12 | Search escaping fixed; the injection probe against the live database | Pending verification (F-006) |
| DEF-18 | The index migration; the owner applies it | Pending verification (F-018) |
| DEF-23 | The production runtime's Node version (AWS, at deployment) | Pending verification (F-026) |
| DEF-25 | `dark:` classes right before paint; 75 `isDark` ternaries still switch after hydration | Partial (F-028, BL-028) |

**`npm audit`:** 0 critical, 0 high. 34 moderate in dev and build tooling, published after Phase 1 (BL-031), and the 3 accepted jest lows.

### 8. Backlog summary

**Open:**
- BL-001 (`any` in `db.ts`'s row mapping), BL-002 (two `set-state-in-effect` warnings). Both need
  logic changes behind tests (Phase F).
- BL-004 (editorial publishing hardcodes `country: ["us"]`) and BL-006 (stored paraphrased titles,
  self-heals). BL-005, real contact and newsletter backends, is future feature work.
- BL-007 (`next typegen` in `typecheck`, a one-line change) and BL-009 (two cosmetic leftovers).
- BL-008 (privacy policy, needs the owner or legal).
- BL-016's remainder (the suggestions fetch is still HTTP; no per-IP limit on its route) and BL-019
  (an image optimizer timeout: act only if it recurs).
- BL-022 (a public scrape writes `articles.content`; kept by the owner), BL-023 (signed links, only if
  needed), BL-024 (nullable columns, deployment phase), BL-025 (the anon-key fallback).
- BL-026 (headline translation, a feature), BL-028 (theme ternaries), BL-030 (lazy-load the chatbot),
  BL-031 (the new moderate advisories), BL-032 (A2 for new pages).
- BL-033 (the 7-day purge against Rule 19's 60 days; Panel 4 or 7), BL-034 (export the audit chain's
  head hash outside the database).

**Resolved:** BL-003, BL-010, BL-011, BL-012, BL-013, BL-014, BL-015, BL-017, BL-018, BL-020, BL-021,
BL-027, BL-029.

### 12. Quick reference

#### Useful probes

```bash
# which tier answered
curl -s -D - -o /dev/null "http://localhost:3000/api/news/top-headlines?refresh=true" | grep -i x-data-source

# real runtime errors
tail -40 .next/dev/logs/next-development.log

# route table drift: compare the "Route (app)" block of `next build` output before and after
# (f/o + path), not a file list
git ls-files 'apps/*/src/app/**/page.tsx' 'apps/*/src/app/**/route.ts' | sort

# the boundary rules
npm run lint

# confirm framework behaviour instead of guessing
node -e "const pm=require('next/dist/compiled/picomatch'); console.log(pm.makeRe('{,*.}newsdata.io').test('i.newsdata.io'))"
```

#### Data model

`database/schema.sql` defines all three tables, `IF NOT EXISTS`, with RLS enabled:
- `articles`: 15 columns, `article_id` unique, `category`/`country`/`category_mismatches` are `TEXT[]`.
  Only `id`, `article_id`, `title` and `created_at` are NOT NULL (the root of BL-001).
- `breaking_news` and `admin_logs`, committed in `db28a46` (F-008); their nullable columns are BL-024.

Panel 0's six access tables (`staff_profiles`, `roles`, `permissions`, `role_permissions`,
`role_assignments`, `audit_log`) are in `database/migrations/2026-11-02-access-1-foundation.sql`, the
catalogue in `-2-catalog.sql`, generated from the plan's matrix by `scripts/generate-access-catalog.mjs`.

Policies and grants are in `database/policies.sql`. Indexes: `created_at` and `article_id` in the
schema; GIN on `category`/`country`, trigram on `title`/`description`, and `link` in
`database/migrations/2026-11-02-indexes.sql`. None of it is applied by the app: the owner applies it
(§11).

#### Test suite

47 files, 736 tests, all passing. Panel 0: `access.test.ts` is the route walk and the access matrix
(every admin route and method, through the real gate, for every kind of caller), with `decide`,
`requirePermission`, the session, the proxy, sign-in, `/me`, `/mfa`, the catalogue against the matrix,
and the access SQL's guarantees. Every security module has tests: `urlValidation` (73),
`fetchPage` (real axios against a local server), `adminSession`, the login and scrape routes, the
rate limiter (memory and Redis), the size-capped body reader, and the search escaping. Repo-reading
tests keep the SQL in step with the code (`packages/server/src/repositories/schema.test.ts`, including the
runbook's rollback), and `.env.local.example` in step with `process.env`
(`packages/shared/src/config/envExample.test.ts`). Untested: `ArticlesTable.tsx` and `Header.tsx`.

## Backlog

Debt deliberately deferred rather than fixed in place, with the reason it was
deferred and the phase that should pick it up. Added to when a rule in the
restructure plan ("no while-I-am-here fixes") stops a fix from happening in the
commit that found it.

---

### BL-001 — `db.ts` row mapping relies on `any` to hide unhandled nulls

**Found:** Phase 0b (lint baseline)
**Files:** `packages/server/src/repositories/db.ts` — the two `.map()` calls in `saveArticlesToDB` and `getDBArticles`
**Status:** Open · two `eslint-disable-next-line @typescript-eslint/no-explicit-any` in place

`database/schema.sql` declares `link`, `pub_date`, `description`, `content`,
`image_url`, `source_id`, `source_name`, `category`, `country` and `language` as
nullable. `Article` (in `packages/shared/src/types/index.ts`) declares `link: string` and
`pubDate: string` as required.

The accurate row type (`ArticleRow`, now defined in `db.ts` and checked against
the schema) is therefore *not* assignable to `Article` at those two mapping
sites. The pre-existing `(row: any)` annotation was the only thing letting it
compile. Typing the rows honestly surfaces the gap rather than creating it.

Three of the five `any` annotations in this file **were** replaced with
`ArticleRow` — the two `.filter()` predicates and the `classifyCategoryRelevance`
projection, none of which produce an `Article`.

**Why not fixed now:** the fix is a logic change (null coalescing at the mapping
sites, or widening `Article.link` / `Article.pubDate` to accept null), and the
commit that found it was scoped to type annotations only. `db.ts` has no test
coverage, so the change cannot currently be proven equivalent.

**Pick up in:** Phase 6, when `db.ts` is split. Write a characterization test
over the mapping first, then decide whether a null `link` should become `"#"`
(as `saveArticlesToDB` already does on write) or whether `Article` should admit
null.

---

### BL-002 — `react-hooks/set-state-in-effect` downgraded to a warning

**Found:** Phase 0b (lint baseline)
**Files:** `apps/web/src/app/saved/page.tsx:21`, `apps/web/src/components/news/ArticleCard.tsx:83` (the two warnings `npm run lint` reports)
**Status:** Open · rule set to `"warn"` in `eslint.config.mjs`

Both call `setState` synchronously inside an effect body. Satisfying the rule
means converting them to derived state computed during render.

**Why not fixed now:** that conversion changes *when* the state settles relative
to paint. Both files have zero test coverage, so a render-timing change cannot
be verified as equivalent, and the restructure plan forbids behavior changes
outside the phase that owns them.

**Pick up in:** Phase 6. Write a characterization test (initial render output,
then output after the effect flushes) before converting either component. Restore
the rule to `"error"` in the same commit that fixes the last violation.

---

### BL-003 — Jest coverage previously measured 6.8% of the codebase

**Found:** Phase 0 (baseline)
**Files:** `jest.config.ts`
**Status:** Resolved in Phase 0c — `collectCoverageFrom` added

Before Phase 0c, `collectCoverageFrom` was unset, so coverage instrumented only
the five modules the four test suites import. The reported 91.42% described
5 of 73 source files. The number is now measured against the whole source tree (since restructure 2,
less the one-line `src/app/` shims) and is correspondingly, accurately, much lower.

Kept here as the reason the coverage number dropped sharply in one commit
without any test being deleted.

Note: coverage then fell again, 4.41% → 3.50%, in `3805007`. That was not a
test regression either: the deleted paraphraser was one of the few well-covered
modules (98.3%), so removing it took covered statements out of the numerator.

It has since crept back up, 3.50% → 3.63%, with **no test added**. Measured per commit (`jest
--coverage`, statements):

| Commit | Change | Coverage | Covered / total |
|---|---|--:|--:|
| `3805007` | paraphraser deleted | 3.50% | 428 / 12,201 |
| `bcd5393` | RSS ingestion deleted | 3.58% | 428 / 11,937 |
| `59b875d` | contact and newsletter forms deleted | 3.63% | 428 / 11,772 |
| `b01d528` | SC-1 split | 3.63% | 428 / 11,760 |
| `d3ba8fa` | footer RSS link deleted | 3.64% | 428 / 11,756 |
| `9f3b76f` | after slices 1–2 (the chat barrel adds 3 uncovered statements) | 3.63% | 428 / 11,759 |
| `73e207f` | after Phase D (the admin and news barrels add 36 more) | 3.62% | 428 / 11,795 |

The covered count is 428 at every step; only the denominator moved. A rising coverage number is
not, by itself, evidence of progress — check the covered count.

---

### BL-004 — Editorial publishing hardcodes `country: ["us"]` and bypasses the filters

**Found:** Phase A review · **Owner decision (Q3):** keep the feature, fix later
**Files:** `apps/admin/src/app/api/admin/publish-article/route.ts`
**Status:** Open · **do not fix during the restructure**

Editorial publishing stays, and moves with the admin feature like any other
file. Two behaviours are logged rather than changed:

- Every published article is stored with `country: ["us"]`, regardless of what
  it is about. An India story published by an editor is therefore tagged
  United States.
- The route upserts straight into `articles`, skipping `saveArticlesToDB` and so
  every filter in the pipeline (paywall, horoscope, wire-spam, script). This is
  deliberate in the code — an editor's insert must not fail silently — but it
  means editorial content is the one path with no filtering at all.

**Pick up in:** after Phase D, as feature work. Needs a product call on whether
the editor chooses the country, and whether editorial content should pass the
script filter.

---

### BL-005 — Real contact and newsletter backends

**Found:** Phase A review · **Owner decision (Q4):** remove both UIs now
**Status:** Future feature work · UIs removed in `59b875d`

The contact form and both newsletter forms (footer strip and article sidebar)
were removed because each reported success while sending nothing — there was no
endpoint behind any of them (DEF-09).

If either returns, it returns with a real backend first: somewhere a message or
address is actually stored or delivered, and a UI that reports failure honestly.
Not before. The `/contact` page remains, listing the email addresses.

---

### BL-006 — Stored rows still carry paraphrased titles

**Found:** `3805007` (paraphraser removal) · **Status:** Open · self-heals

Headlines are now shown as the source published them. Rows written to Supabase
before `3805007` hold paraphrased titles. `upsert` on `article_id` overwrites a
title when the same article is fetched again; a row that is never re-fetched
keeps its paraphrased title until the 7-day purge removes it.

Until then, `dedupeArticlesByTitle` compares titles, so a stored paraphrased
title and its raw upstream twin will not be recognised as the same story — a
possible transient duplicate in the feed.

**Currently moot:** Supabase is unreachable (DEF-01), so no stored rows are read.
**Pick up:** only if duplicates are observed after the connection is restored.
Waiting seven days resolves it with no code change.

---

### BL-007 — The verify gate fails on stale route types after a route moves

**Found:** `bcd5393` (RSS removal) · **Status:** Open · **affects any change that
moves or deletes a route file**

`tsconfig.json` includes `.next/types/**/*.ts`, which `next build` generates.
`npm run verify` runs `typecheck` **before** `build`. So after a route file is
moved or deleted, `tsc` reads the previous build's validator, which still
imports the old path, and fails:

```
.next/types/validator.ts(242,39): error TS2307: Cannot find module
'../../src/app/api/cron/refresh-rss/route.js'
```

The source is fine. Clearing `.next/types` and re-running turns the gate green
with no source change. CI is unaffected (a fresh checkout has no `.next/`), but
every local change that moves or deletes a route under `src/app/` will hit it. Every restructure-2 slice
that touched `src/app/` did, and cleared `.next/types` first.

**Workaround until fixed:** `rm -rf .next/types` before `npm run verify` on any
slice that moves or deletes a route file.

**Fix:** Next 16 ships `next typegen`, which "generates TypeScript definitions
for your application's routes without performing a full build" — its own docs
name CI type-checking as the use case
(`node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md`).
Changing `typecheck` to `next typegen && tsc --noEmit` regenerates the types
from the current routes before checking them. A one-line config change; not
made here because it was outside the item that found it.

---

### BL-008 — Privacy policy describes data collection that no longer happens

**Found:** `59b875d` (form removal) · **Status:** Open · **needs owner or legal
review — not a code decision**
**Files:** `apps/web/src/app/privacy/page.tsx`

The policy still says email addresses are collected "when you subscribe to our
newsletter or submit the contact form", that updates are sent "if you've opted
in to our newsletter", and that readers can "unsubscribe from newsletter
emails". None of those forms exist any more.

A privacy policy that describes collection the product does not perform is
inaccurate in a document with legal weight. The correct wording is the owner's
or legal counsel's to choose, so it was deliberately not edited alongside the
UI removal.

---

### BL-009 — Residual references to removed features

**Found:** `bcd5393`, `59b875d` · **Status:** Open · cosmetic, low risk

Each was left alone because it was not required by the item that removed the
feature:

- ~~**Footer "RSS Feeds" link**~~ — **resolved**: the link and its separator were
  removed from `apps/web/src/components/Footer.tsx` at the owner's direction (Phase C
  review). It had pointed at `href="#"` and advertised a deleted feature.
- ~~**Dead translation keys**~~ — **resolved** in `a81d3c4` (restructure 2, S1, owner item
  B8): the six listed here (`rssFeeds`, `newsletterTitle`, `newsletterDesc`,
  `newsletterStripTagline`, `subscribedSuccess`, `newsletterEmailPlaceholder`)
  plus `subscribe`, which this list missed, removed from the interface and both
  languages. Sixteen more unread keys are BL-017.
- **`"use client"` on the contact page (`apps/web/src/app/contact/page.tsx`)** — no longer needed now the
  form's state is gone. Removing it changes the page's rendering mode, which is
  a behaviour change, not a cleanup.

**Pick up:** any time, as one small commit. Nothing left in this entry is
visible to a user. `rssFeeds` is now dead too — the link was its only reader.

---

### BL-010 — ESLint lints the generated `coverage/` directory

**Found:** Phase A review, reading the unabridged `npm run verify` log ·
**Status:** **Resolved** (Phase C review) — `"coverage/**"` added to `globalIgnores`.
With `coverage/` present on disk, lint now reports 14 warnings, all in source.

`eslint.config.mjs` ignores `.next/`, `out/`, `build/` and `next-env.d.ts`, but
not `coverage/`. After `npm run test:ci`, ESLint lints Istanbul's generated
report and emits:

```
C:\Users\DELL\TimesPrime\coverage\lcov-report\block-navigation.js
  1:1  warning  Unused eslint-disable directive (no problems were reported)
```

So the "15 warnings" reported throughout the restructure are **14 in source
plus 1 in a generated file**, and the total depends on whether `coverage/`
exists. CI runs Lint before Test, so CI sees 14 while a local run after
`test:ci` sees 15. Every filtered view of the lint output hid this; only the
full log shows the path.

**Fix:** add `"coverage/**"` to `globalIgnores` in `eslint.config.mjs`. One
line; not made here because it was outside the item that found it.

### BL-011 — `withSentryConfig` is imported from a deprecated path

**Found:** audit fix F-007, bumping @sentry/nextjs to 10.78.0 (`31f4a54`) · **Status:** **Resolved**
in `7e578e0` — imported from `@sentry/nextjs/config`; the warning no longer appears

Every build and test run now prints: *"Importing `withSentryConfig` from `@sentry/nextjs` is
deprecated and will stop working in v11. Import it from `@sentry/nextjs/config` instead."* The fix
is one line in `next.config.ts`. Not made in `31f4a54` because it was outside that finding; it
becomes mandatory only at v11, which is a major bump and needs owner approval anyway.

### BL-012 — `@types/node` is `^20` while the runtime is Node 24

**Found:** audit fix F-026 (`974b255`) · **Status:** **Resolved** in `0066f27` (owner approved) —
`@types/node` `^24`, resolving 24.19.2; typecheck clean with no source change

`.node-version`, `engines` and CI are on Node 24, but the type definitions still describe Node 20:
APIs added since 20 are untyped, and the compiler will not flag anything removed. Nothing fails
today. Moving to `@types/node@^24` is a major bump of the types package, which the audit-fix rules
reserve for the owner.

### BL-013 — The in-memory cache never evicts keys that are not read again

**Found:** Phase 1 of the audit fixes, checking how `cache.ts` behaves without Upstash (D1) ·
**Status:** **Resolved** in `e5754b5` (audit Phase 2, with F-020: a sweep every minute and at most
1,000 entries). Was: Open (audit-ledger observation N-03) — **deferred into audit Phase 2 with F-020** by the
owner

When Upstash is not configured — as on this machine — `cache.ts` falls back to a `Map` and deletes
an expired entry only when `get()` reads it again. Keys that are never re-read stay forever: every
distinct scraped URL, every search query. Memory grows with traffic, the same class of bug as
F-020 (the rate limiter). **Pick up in:** Phase 2, alongside F-020 (owner decision);
with Upstash configured in production the in-memory path is only a fallback.

### BL-014 — `db.ts` reports every failed Supabase operation to Sentry, unthrottled

**Found:** Phase 1, the D5 outage simulation (`679c72e`) · **Status:** **Resolved** in `cc1d479` —
throttled through the D5 limiter, one key per operation, not demoted to breadcrumbs (owner ruling);
a failing-DB test went from 15 events for three requests to one per operation per window

Each feed request during an outage produced five Sentry events from `db.ts` — freshness check,
purge, upsert, purge, select — on top of D5's single rate-limited fallback report. At real traffic
that is thousands of events an hour and a Sentry quota problem. Options: route them through the
same rate limiting as `reportFallback`, or demote them to breadcrumbs and let D5's report be the
event. Owner decision; it changes how errors are reported, not behaviour. The double purge in the
same trace is F-015, Phase 3.

### BL-015 — `urlValidation` goes to `packages/server/src/lib/` now, to `packages/shared/src/lib/` with F-005

**Found:** restructure 2, S0 judgement call 3 (owner, at the S0 approval) · **Status:** **Resolved** in
`2cd04c9` (moved to `packages/shared/src/lib/`, browser-safe; its DNS step is injected by
`packages/server/src/services/scrape/fetchPage.ts`), with F-005 as planned

Move map v2 put `urlValidation.ts` in `packages/server/src/lib/` because its only importer is the scraper,
`apps/web/src/app/api/news/scrape-article/route.ts`. The F-005 fix needs URL validation
on the frontend link sinks (`ArticleDetailView.tsx`'s `href={targetUrl}`); the module moves to
`packages/shared/src/lib/` then (owner decision).

One constraint for that move: `validateExternalUrl()` imports Node's `dns/promises` and `net` — it
resolves the hostname so it can reject private addresses (the SSRF guard) — and neither runs in the
browser. The checks that need no DNS (URL parsing, the http(s) allowlist, `localhost`) can move to
`shared/`; the resolution step stays server-side. So F-005 splits the module rather than moving it
whole.

### BL-016 — The article page fetches its own API over HTTP

**Found:** restructure 2, S0 (the F1 list) · **Status:** **Resolved** (the cleanup on
`chore/restructure`, 2026-11-02): the suggestions now call `getTopHeadlines`
(`packages/server/src/services/news/topHeadlines.ts`, the read path moved out of the route unchanged), so the
page makes no HTTP request to itself and `NEXT_PUBLIC_BASE_URL` is gone. The suggestions' cache is
now the feed's own 15-minute cache, not a 15-minute fetch cache over HTTP. Earlier: **resolved for
the scrape** in `65d3337` (owner, Phase 2 follow-up, to fix BL-021): the page calls `scrapeArticle`
(`packages/server/src/services/scrape/scrapeArticle.ts`) directly. **Still over HTTP:** the suggestions fetch
of `/api/news/top-headlines`, which has no per-IP limit and was not part of the fix. Re-checked
after Phase 3 (owner): neither the handler nor `apps/admin/src/proxy.ts` (matcher: admin paths only) limits that
route, so it has no shared bucket like BL-021's. **If a per-IP limit is ever added to
`top-headlines`, move this fetch to a direct call first**, or every reader shares the server's
bucket. The fetch also reads `NEXT_PUBLIC_BASE_URL`, not the `NEXT_PUBLIC_APP_URL` the rest of the
page uses

`apps/web/src/app/article/[slug]/page.tsx` is a server component, yet it reaches the scraper and the feed
over HTTP to its own deployment: `getArticleContent()` fetches `/api/news/scrape-article`
(`:38–42`, `revalidate: 3600`) and `getSuggestedArticles()` fetches `/api/news/top-headlines`
(`:58–62`, `revalidate: 900`), both at `NEXT_PUBLIC_BASE_URL`, falling back to
`http://localhost:3000`. Every uncached render costs two extra round trips. If the variable is
wrong or unset in an environment, both fetches fail and the page silently shows its placeholder
text and no suggestions.

Calling the backend code directly would remove the hop, but it also changes which caching and error
handling apply — and, once F-011 gives the scraper a limiter, which rate limit applies. That makes
it a behaviour change, not a move, so restructure 2 keeps the page as composition in `src/app/` and
leaves both fetches alone.

### BL-017 — Data nothing reads, left after the S1 cleanup

**Found:** restructure 2, S1 (`dc07a40`, `a81d3c4`) · **Status:** **Resolved** in `dbc4821` (the 16
keys), `6327110` (the two fields) and `c2ab97a` (the last key, `refresh`), owner-approved after a
dynamic-access check

- **Sixteen translation keys** in `packages/shared/src/config/translations.ts` have no reader, in the interface
  and in both languages: `liveFeed`, `edition`, `globalNewsHub`, `aiAssistant`,
  `storiesAvailable`, `trendingHighlights`; `footer.verifiedSources`, `footer.realtimeCaching`,
  `footer.newsCategories`, `footer.emailPlaceholder`; `articleView.backToHeadlines`,
  `originalSource`, `specialReport`, `verifiedDigest`, `visitPublisher`, `suggestedNews`. Same
  test as `a81d3c4`: no `.key` or `["key"]` access anywhere in `src/`, and the only dynamic
  indexing is `t.categories[...]`. Removing them shrinks the client JS of every page that loads
  the dictionary, as `a81d3c4` did (−962 bytes for seven keys).
- **The `bg` and `text` fields of `CATEGORY_COLORS`** (`packages/shared/src/config/categoryColors.ts`): unread
  since `dc07a40` deleted their two getters. 18 of their 22 class strings (`bg-orange-600`,
  `text-cyan-600`, …) appear in no other file, so Tailwind still emits CSS for classes no element
  carries. Removing the fields drops those rules; measure the CSS before and after.

The check that cleared them works by type, not text: it follows every value typed as the
dictionary, a section, `TRANSLATIONS`, `CategoryColorDef` or `CATEGORY_COLORS` through computed
lookups, destructuring, spreads, casts and calls. The only dynamic lookups are by language
(`TRANSLATIONS[language]`), by category id (`t.categories[...]`, whose keys all stay) and by
category name (`CATEGORY_COLORS[...]`, read only as `.hex` and `.badgeBg`). `6327110` removed 16
CSS rules; the other two of the 18 lived on in this entry's own text until `6a1382d` (BL-018).

**`refresh`, resolved in `c2ab97a`.** The same check proved the top-level `refresh` key
unreachable too; the text scan had counted `router.refresh()` as a reader. It was not on the first
approved list, so it waited for the owner, who approved its removal at the S2 review.

### BL-018 — Tailwind scans `docs/` and `scripts/`, so editing a document can change the CSS

**Found:** restructure 2, S1 (`26adbbd`) · **Status:** **Resolved** in `6a1382d` (owner-approved,
S2): `@source not` for `docs/`, `scripts/`, `database/`, `db/` and the four root `.md` files, each
proved by a probe build. The paths resolve from the stylesheet, so slices 1 and 10 rewrite them
when it moves (`SLICE_CHECKLIST` in `scripts/move-map.mjs`)

Tailwind v4 detects class names automatically in every file that is not git-ignored, Markdown
included. Deleting `docs/MOVE-MAP.md` removed one utility rule from the production CSS (−219
bytes): an ordinary English word in one of its sentences was the only place that utility's name
appeared. `26adbbd`'s message names it; this entry does not, because writing the word here
would put the rule back. Any documentation edit can add or drop a utility the same way, so a
docs-only commit can move the CSS, and a per-commit CSS comparison has to tell that apart from a
code change.

Fix: exclude the non-code folders in `globals.css` with `@source not "<path>"` (supported by the
installed Tailwind 4.3.3; the path resolves from the stylesheet), or use `source(none)` and list
the code folders. Either is a CSS configuration change, so it waits for the owner.

**Outside the approved list, so still scanned:** the code (`src/app/`, `frontend/`, `backend/`, `shared/`), comments and tests included,
and root tooling. Two cases so far: while `4ff0167` was being written, a test comment saying a
scan could not "shrink" emitted `.shrink` until it was reworded; and `.transform` is in the CSS
only because three `jest.config.ts` comments say "transform". Excluding test files or root
configs would be a further owner decision.

### BL-019 — An article-page trending image timed out at the image optimizer

**Found:** restructure 2, S3 (the smoke test after slice 11) · **Status:** Open — **no config
change** (owner, S4); act only if it recurs

In the slice-11 smoke test's screenshot of `/article/[slug]`, one thumbnail in the lists the page
builds from `/api/news/top-headlines` was empty. The `next start` log of that run has exactly one
image error:

    ⨯ upstream image response timed out for https://kubrick.htvapps.com/htv-prod/images/53baa842-b42a-46f7-96af-373e09efe30a.jpg

- **Host:** `kubrick.htvapps.com`. **It is in `imageDomains`**: `ALLOWED_IMAGE_HOSTNAMES` in
  `packages/shared/src/config/imageDomains.ts:34`. So `isAllowedImageUrl` handed the URL to `<Image>`, and
  `remotePatterns` (`{,*.}kubrick.htvapps.com`) let `/_next/image` fetch it. The allowlist is not
  the cause, and no slot is needed: `remotePatterns` holds 49 entries against the cap of 50.
- **What failed:** the optimizer's fetch from the publisher. `next/dist/server/image-optimizer.js:474`
  logs that line and answers 504 when the upstream does not respond within
  `images.imgOptTimeoutInSeconds`, default 7 (`next/dist/server/config-shared.js:229`). Fetched
  directly in S4, the same URL returned 200 in 0.31 s (35,448 bytes). The CDN was slow once; the
  image is not broken.
- **Not caused by the restructure:** `remotePatterns` is unchanged.

Nothing to fix for a one-off. If it recurs, the options are an `onError` fallback to the topic
image, which covers any publisher outage, or a longer `imgOptTimeoutInSeconds`, which only makes
readers wait longer. Either is a change for the owner to decide.

### BL-020 — A curated Sports topic image is gone from Unsplash (404)

**Found:** restructure 2, S3 (the smoke test after slice 1) · **Status:** **Resolved** in
`c3c4387` (owner-approved, S5): the slot now holds `photo-1593341646782-e0b495cff86d`, a batsman
hitting the ball, on the same host. It returned 200 before the commit

The slice-1 smoke test's `next start` log:

    ⨯ upstream image response failed for https://images.unsplash.com/photo-1540747913346-19212a729b62?w=1200&auto=format&fit=crop&q=80 404

That URL is the "Cricket" image, second of the four in the Sports bucket of `TOPIC_IMAGE_MAP`
(`packages/shared/src/config/topicImages.ts:75`). It still returned 404 when re-checked in S4. The other 44 of
the file's 45 Unsplash URLs (43 distinct, `GENERIC_NEWS_FALLBACK` included) returned 200.

Unlike BL-019, this one fails every time. Take an article whose own image is missing or not
allowlisted, whose headline matches the Sports keywords, and which `assignDedupedTopicImages`
gives that slot: its thumbnail renders empty.

Fixed by replacing the URL with a working photo that shows cricket being played. It is on the
same host, so `imageDomains` and `remotePatterns` are unchanged.

### BL-021 — The scraper's rate limit puts every reader in one bucket

**Found:** audit Phase 2, F-011 (`3b63a37`) · **Status:** **Resolved** in `65d3337` (BL-016,
owner-chosen): the article page no longer comes through the public route, so the route's per-IP
limit now sees only external callers

F-011 limits `/api/news/scrape-article` to 30 uncached scrapes a minute per client IP (owner
decision D1). The route's only caller today is the article page's server-side fetch of it
(`apps/web/src/app/article/[slug]/page.tsx:38–42`, BL-016). That request carries no reader IP, so every
reader's uncached article counts against one key: the server's own address in production, or
`unknown` locally. Next's data cache (`revalidate: 3600` per URL) and the 1-hour scrape cache keep
that traffic low, but a burst of distinct new articles could pass 30 a minute, and the page would
then show its placeholder text.

Options:
- **Call the backend directly from the page** (BL-016). The self-fetch goes away, and the public
  HTTP route keeps the limit for outside callers only. Recommended; it changes which caching applies,
  so it is a behaviour change to test first.
- Raise the limit, which weakens F-011 for direct callers.
- Have the page forward the reader's IP in a header the route trusts only alongside a server-side
  secret. More moving parts than the first option.

### BL-022 — A public scrape writes to the database

**Found:** audit Phase 2, F-003 tests · **Status:** **Kept** (owner, Phase 2 follow-up): it caches
scraped content to the stored article, and since `988c7fa` the public route scrapes only stored
articles, so it writes only to our own rows

Every uncached scrape that extracts an article also runs
`supabase.from("articles").update({ content }).eq("link", targetUrl)` in the background
(`apps/web/src/app/api/news/scrape-article/route.ts:537`). So a public GET writes to the database, and the row it
updates is chosen by the caller's `url` parameter. The value written is what the server scraped
from that very URL, so a caller can only make a stored article's content match its own link. Still
worth deciding: a local run writes to whatever project `.env.local` names, which may be production
(gotcha 3.18), and a public endpoint that writes is one more thing to rate-limit and audit. The
feed does return `content` with each row (`packages/server/src/repositories/db.ts:429`), so check its readers
before dropping the write.

Options: keep it, drop it, or move it behind the cron. Not changed in Phase 2: it is not part of any
audit finding.

### BL-023 — Signed article links, if the article page must survive a Supabase outage

**Found:** audit Phase 2, F-005 (`8d0b775`) · **Status:** Open — upgrade path, only if needed (owner)

F-005 trusts the article page's `?url=` only when it names a stored article (or a built-in mock
one). That is a database read per article page, so while Supabase is down, and for articles past
the 7-day purge, the page shows no publisher link and no scraped text: safe, but degraded.

If outage resilience is ever needed: the server attaches an HMAC of each article link to the feed
data it already sends (a new secret, for example `ARTICLE_LINK_SECRET`). Every place that builds an
`/article/...?url=` link adds `&sig=`, and the page verifies the signature instead of querying the
database. Costs: a new environment variable; an additive change to the feed responses; edits to
the six link builders (`ArticleCard` ×2, `CategoryMegaMenu`, `MarqueeTicker`, and the
related/trending lists in `ArticleDetailView`); and links shared before the change lose their
publisher link. The stored-article lookup was chosen instead (owner, Phase 2).

### BL-024 — Nullable columns the code treats as non-null (`breaking_news`, `admin_logs`)

**Found:** audit Phase 3, F-008 (`db28a46`) · **Status:** Open — deployment phase (owner)

`database/schema.sql` carries the DDL that lived in code comments unchanged, and it leaves these
columns nullable while the TypeScript types say they are always set:

- `breaking_news.is_active` and `breaking_news.created_at`
- `admin_logs.details`, `admin_logs.metadata` and `admin_logs.created_at`

The inserts always set them (or their defaults do), so the gap is about rows written some other
way. A `NOT NULL` migration must first check the live data for nulls
(`SELECT count(*) … WHERE <column> IS NULL` for each), which is deployment-phase work.

`admin_logs.action` is free text, while the code uses the `AdminAction` union. **Recommendation: keep
it free text.** A CHECK constraint would need a migration for every new action, and the column is
written only by `logAdminAction`, whose parameter type already restricts it.

### BL-025 — Without the service-role key, the app runs on the anon key and writes fail

**Found:** audit Phase 3, owner check of RLS against the live app · **Status:** Open

`packages/server/src/lib/supabase.ts` uses `SUPABASE_SERVICE_ROLE_KEY` when set and falls back to
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `isSupabaseConfigured()` is true with the anon key alone. With
RLS on, the anon key can only read `articles` and `breaking_news`. The cron's ingest and purge,
every admin write and the audit log all fail. Where anon still holds Supabase's default table
grants, some of these fail silently (0 rows, no error) instead of as `permission denied`.
The table of every access is in [the database runbook](#which-key-the-app-uses-and-what-rls-does-to-it).

No policy change fixes this, because the anon key is public by design. Options: fail loudly (a
startup or health warning when only the anon key is set, or report the writes as unavailable), or
keep it and rely on the runbook's pre-check that the key is set. Not changed: no audit finding
covers it.

### BL-026 — Headline translation

**Found:** audit F-024 · **Status:** Open — feature, not a defect (owner decision D3)

`translateHeadline(text, lang)` in `packages/shared/src/config/translations.ts` returned `text` unchanged. It
ran on every card title and description (`ArticleCard`) and on the mega-menu titles
(`CategoryMegaMenu`), so it looked like translation without doing any. F-024 removed it. Cards
and the mega menu show each article in the language its publisher wrote it in; the Hindi feed is
already chosen by script (`matchesLanguageScript` in `packages/server/src/repositories/db.ts`).

The only real translation is on the article page: `ArticleDetailView` translates the article's
title, description and paragraphs through `/api/translate` when the UI is in Hindi, cached per
title. Translating headlines in the feed would need the same: a batched `/api/translate` call per
feed load (the route allows 50 texts and 10,000 characters per request, F-010) and a cache, or
translated titles stored at ingest. Either costs translate-API quota on every new story.

### BL-027 — The first search result is never shown

**Found:** audit Phase 4, writing the F-021 characterization (`675ce1d`) · **Status:** **Resolved** in `96f192d`
(owner: fix now; while searching the grids start at index 0)

In `apps/web/src/components/home/HomeClient.tsx` the featured slot shows `articles[0]` only when no search is
active (`featuredArticle && !searchQuery`, `:424`), while Top Stories and Latest start at
`articles.slice(1, …)` (`:319`). So during a search the best match is filtered in and then never
rendered. `HomeClient.test.tsx` pins the current behaviour ("Budget passes" is dropped). Fix: start
the grids at index 0 while searching, and update that test.

### BL-028 — Theme ternaries still switch after hydration

**Found:** audit Phase 4, F-028 (`5ad891a`) · **Status:** Open

F-028's pre-paint script sets the `dark` class on `<html>`, so everything styled with `dark:`
variants is right from the first paint. Components that choose classes in JavaScript instead
(`isDark ? "…" : "…"` from `useTheme()`: 75 ternaries in 16 files under `frontend/`) still render
light until ThemeContext's effect runs after hydration. They cannot read the theme during render
without their server and client HTML differing. Fix: convert those ternaries to `dark:` variants,
file by file. Check the CSS budget, since most of the colours are already in the stylesheet.

### BL-029 — The seed route falls back to a public-prefixed NewsData key

**Found:** audit F-009 (ledger note) · **Status:** **Resolved** in `45223f0` (owner: remove; the Sentry
scrub list keeps the name, for an environment that still sets it)

`apps/admin/src/app/api/admin/seed-supabase/route.ts:15` reads `NEWSDATA_API_KEY || NEXT_PUBLIC_NEWSDATA_API_KEY`.
It runs on the server, so nothing leaks today. But the fallback invites putting a secret under a
`NEXT_PUBLIC_` name, and Next inlines such a name into any client bundle that reads it. F-009 lists
it in `.env.local.example` as "do not set it". Removing the fallback is a one-line change; it breaks
the seed route only for an environment that sets the public name alone.

### BL-030 — The chatbot ships on every route

**Found:** audit Phase 4, F-027 (`7ead49b`) · **Status:** Open — proposal, not started (owner)

`apps/web/src/app/layout.tsx` renders `FloatingAiAssistant` (`apps/web/src/components/chat`), which imports
`Chatbot` statically. So the chatbot's code is in a chunk every route loads, even though it is closed
until the reader clicks its button: `/admin/login` and `/_not-found` too. F-027 showed it. 418 bytes
of dark-mode class strings grew all 10 page bundles by the same amount: +1.40% on `/_not-found` and
+1.25% on `/admin/login`.

Proposal: keep the floating button in the layout, and load `Chatbot` only on the first open, with
`next/dynamic` (`ssr: false`) or a `React.lazy` import inside `FloatingAiAssistant`. The closed
state renders `null` already (`if (!isOpen) return null`), so nothing visible changes. The cost is a
short fetch on the first click, and the bundle check should show the chunk leaving every route. Check
the Next 16 `lazy-loading` guide in `node_modules/next/dist/docs/` first. Leaving `/admin` out of the
button (its own decision) is not part of this.

### BL-031 — New moderate advisories in dev and build tooling (`glob`, `minimatch`)

**Found:** audit Phase 5, final `npm audit` (2026-11-02) · **Status:** Open — owner decision

`npm audit` went from 5 low to 37: 0 critical, 0 high, 34 moderate, 3 low. The moderates come from two
advisories published after Phase 1:
- `glob` 9.0.0–14.0.1 ([GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)),
  through `@sentry/nextjs`'s build-time bundler plugin.
- `minimatch` <11.0.1 ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)),
  through `eslint` and `eslint-config-next`'s plugins.

Neither ships in the app. npm's only fixes are major-version changes (`eslint` 4.0.0, `@sentry/nextjs`
10.76.1), which the rules forbid without the owner. `npm audit fix --dry-run` without `--force` would
change 14 dev packages and leave the count at 37, so it was not run. Options: accept, as for the jest
lows; or wait for `@sentry/nextjs` and `eslint-config-next` releases that move to fixed versions, and
recheck then. CI does not run `npm audit`, so it is unaffected either way.

### BL-032 — A2 for new pages

**Found:** audit master prompt, Phase 5 · **Status:** **Moot** — restructure 4 (ADR 0005,
`chore/restructure`) removed the shims, A2, `SHIMS` and `check:boundaries`: every page holds its own
code, as the framework intends. The text below is kept as it was written.

A2 (`eslint.boundaries.mjs`, `boundaries/shim-only`) holds two kinds of file to re-exports and
literal segment config: every `src/app/**/route.ts`, and the pages whose bodies moved to
`src/app/` in restructure 2. Those pages are `SHIMS` in `scripts/move-map.mjs`, derived from
the move map. A `page.tsx` added later is in no move map, so A2 never sees it. Its logic can then grow
in `src/app/`, which is the routing shell. Proposal: apply A2 to every `src/app/**/page.tsx`, with the two
composition pages allowlisted by name (`apps/web/src/app/page.tsx` and `apps/web/src/app/article/[slug]/page.tsx`, which
combine backend data with a view, ADR 0002). `check:boundaries` and the jest coverage exclusion read
the same list, so change all three together, and prove the rule with a probe page.

### BL-033 — The 7-day purge deletes what Rule 19 says to keep for 60 days

**Found:** panel work, Step 1 report (2026-11-02), point 7 · **Status:** Open — decided in Panel 4/7

The reader feed keeps a 7-day rolling window. `purgeOldArticles` (`packages/server/src/repositories/db.ts`)
deletes every article whose `created_at` is older than 7 days, once per cron run
(`packages/server/src/services/news/refreshNews.ts`) and when the admin presses purge (`apps/admin/src/app/api/admin/db-stats/route.ts`).
the access rules (`docs/PANEL_DOCS.md`) (from the retired PANEL_PLAN.md) reads IT Rules Rule 19 as requiring content records for at least 60 days, and asks
for a 60-day purge floor. Today nothing of a purged article survives, so the two conflict.

Proposed direction (owner, 2026-11-02): the feed keeps its 7-day window. A separate `content_records`
table keeps a light record of every published item (title, link, source, published and unpublished
times, actor) for at least 60 days, and the purge floor applies to the records, not to the feed.
Not built now: the table, its writer and the floor belong to Panel 4 (Ingestion) or Panel 7
(Compliance), whichever comes first.

### BL-034 — Export the audit chain's head hash outside the database

**Found:** owner, Panel 0 design approval (2026-11-02) · **Status:** Open — after Panel 0

`audit_log` chains each row to the one before it (`prev_hash`, `row_hash`; design
[`panel-0-access-foundation.md`](PANEL_DOCS.md#panel-0-design-the-access-foundation) §1), and
`audit_verify_chain()` finds an edited or deleted row. It cannot find a **full rewrite**: someone
with owner access to the database could recompute every hash from the first row on, and the chain
would verify. The defence is a copy of the head that lives somewhere else. On a schedule (for
example daily, from the cron), record the latest `seq` and `row_hash` outside the database: a
log line to an external sink, a Sentry event, or a file in separate storage. A rewrite then shows as
a head that no longer matches the exported one. Needs a choice of destination that a database owner
cannot also edit.

### BL-035 — Statements in the docs that were already stale before restructure 3

**Found:** restructure 3, S3 (2026-11-03), while merging the docs · **Status:** Open — docs only

Restructure 3 carried the docs as they were, changing only what its own moves made wrong. These
statements were stale before it, for reasons outside its scope, and are left for the work that owns
them:

- "No route handler performs its own auth check" (System design §1, and the large-files note in the
  current status). Since Panel 0's first half (`dfcaf80`..`0bb4fbb`), 13 admin route bodies check a
  permission server-side through `backend/auth/requirePermission.ts`; the proxy is the first gate,
  not the only one.
- "What `backend/lib/` means" lists `urlValidation`, which F-005 moved to `backend/shared/validation/`,
  and omits `likePattern` and `readJsonBody`.
- Module responsibilities: `backend/repositories/` omits `staff.ts`, and `backend/auth/` describes
  only the admin session cookie.
- The panel index shows Panel 0 as *Planned*, while its first half is on `main` and the rest on
  `panel-0-access`.

Fix with the Panel 0 docs, when panel work resumes (the definition of done, item 6).

**Resolved by the merge into the apps/packages layout (2026-11-04):** the four statements above
were rewritten with the docs in restructure 5 (the module table in ARCHITECTURE, §6, names
`staff.ts`, the auth modules and `readJsonBody`, and `urlValidation` in `packages/shared`; the
panel index shows Panel 0 *In progress*). One more stale statement, recorded on `panel-0-access`
as its own BL-035: the root README's "Setup" said `database/schema.sql` "currently defines the
`articles` table only", which stopped being true at F-008 (`db28a46`); the setup now names the
database files in order and points at the runbooks instead.

### BL-036 — Runtime messages still tell the reader to set `.env.local`

**Found:** restructure 3, S3 (2026-11-03) · **Status:** Resolved (owner approval, 2026-11-03): every
string below names the env file (`frontend/.env` on main; the root `.env` since the merge into the
apps/packages layout); the login test asserts the 503 message, and `envExample.test.ts` fails if
any source file names `.env.local` again

Since restructure 3 the local env file is `frontend/.env`, but these strings, which the app prints or
returns, still name `.env.local`. They are output, not comments, so restructure 3 (behaviour-
preserving) left them:

- `backend/api/admin/login.ts`: the 503 JSON, "Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET in
  .env.local."
- `backend/api/news/top-headlines.ts` and `backend/services/news/fetchNews.ts`: the warning
  "NEWSDATA_API_KEY is not set — falling back to mock articles. Add it to .env.local."
- `backend/repositories/db.ts`: the warning "Supabase credentials not configured in .env.local yet."
  and the health note "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local".
- `database/seed/seed_supabase.mjs`: its usage line, `node --env-file=.env.local ...`, which now
  needs `--env-file=frontend/.env`.

Proposed: one change commit naming `frontend/.env` (or "the env file", which stays true in
production, where the values come from the Vercel project), with any test that asserts a message
updated in the same commit.

### BL-037 — Contrast in the public site's chrome

**Found:** Panel 0's accessibility tests (2026-11-02) · **Status:** Open — public site

axe (WCAG 2.1 AA) reports `color-contrast` (serious) on parts every page renders, outside Panel 0:
- `apps/web/src/components/news/BreakingNewsBanner.tsx`: the "🔴 BREAKING" label is white on red with
  `animate-pulse`, which lowers its opacity, so it falls below 4.5:1 for part of every cycle.
- `apps/web/src/components/news/Header.tsx`: the 10px red "EN"/"HI" language marker, and the 11px
  "Follow Us:" label in `text-slate-400` (dark theme).
- `apps/web/src/components/news/Footer.tsx`: the column headings and labels in `text-slate-400` at 10–11px.

`e2e/accessibility.spec.ts` excluded exactly these three from its check of the sign-in page, which
is Panel 0's; since the split (ADR 0006) the sign-in page is in `apps/admin`, which does not render
them, so the check excludes nothing. The defects remain on every reader page. The fix is darker text (slate-500 and up on white) and no opacity pulse on text, or a
pulse only under `prefers-reduced-motion: no-preference`.

### BL-038 — The login limit trusts the first `X-Forwarded-For` address

**Found:** Panel 0's browser tests (2026-11-02) · **Status:** Open — before the AWS deployment

`getClientIp` (`packages/server/src/lib/rateLimit.ts`) takes the first address in `X-Forwarded-For`, then
`X-Real-IP`. The sign-in limit (10 per 15 minutes) is counted per that address. On Vercel the
platform sets the header, so the first address is the client's. Behind an AWS load balancer the
balancer **appends** the client's address, and the first one is whatever the client sent: a
guesser can send a new address with each attempt and never reach the limit. The per-user MFA limit
(five codes per 15 minutes) is not affected. At the AWS move, read the address the balancer adds
(the last entry, or a header it sets that clients cannot), and test it with a forged header.

## Audit ledger

The audit (28 findings, F-001..F-028) was run at commit `0e7f1f7`, **before** both restructures, so
its own paths and line numbers are stale. Every location below is at today's paths. They were first
verified against the repo at `4cf5be6` (2026-10-30) and updated through Phase 1 at `679c72e`. Then,
after restructure 2, they were moved to the new layout and re-verified at `51bafd5` (2026-10-30).
Each cited line was re-located by its content at `679c72e`, with its surrounding lines as context,
not by adding offsets, and every claim without a line number was re-checked. Restructure 4
(2026-11-02, ADR 0005) rewrote the paths to the `src/` layout by a mechanical file-by-file map; a
route body's line numbers carry over to its `route.ts`, except `top-headlines`, whose body moved to
`packages/server/src/services/news/topHeadlines.ts` (+14 lines). Locate code through
[`ARCHITECTURE.md`](ARCHITECTURE.md#architecture) §4 and the editor, not through the audit.

**Status.** *Resolved* — fixed, with the commit. *Pending verification* — fixed in code; a check
that cannot run on this machine remains, and is named. *Partial* — part fixed, the rest named.
*Open* — not started. This file is updated as each finding is fixed; one finding per commit, prefixed with
its ID. Closed out in audit Phase 5 (2026-11-02): no finding is Open. What "Pending verification" needs is
listed in [Deployment](#deployment).

### Summary

| Status | Count | Findings |
|---|--:|---|
| Resolved | 22 | F-001, F-003, F-004, F-005, F-007, F-009, F-010, F-011, F-012, F-013, F-014, F-015, F-016, F-017, F-019, F-020, F-021, F-022, F-023, F-024, F-025, F-027 |
| Pending verification | 5 | F-002 (production check), F-006 (live probe), F-008 and F-018 (SQL not yet applied), F-026 (the production runtime's Node version) |
| Partial | 1 | F-028 (`isDark` ternaries, BL-028) |
| Deferred | 0 | — |
| Open | 0 | — |

### Ledger

| ID | Sev | Finding | Status | Evidence / current location | DEF |
|---|---|---|---|---|---|
| F-001 | Crit | Next.js 16.3.0 advisories, incl. 4 critical unauthenticated RCE | **Resolved** | `47e62ae`: `next` and `eslint-config-next` 16.4.3, the current latest. Four of the 13 advisories reached 16.4.0, so the 16.3.8 patch line was not enough. `npm audit` no longer lists `next`; route table identical; `next start` smoke test passed | DEF-11 |
| F-002 | Crit | Every Supabase call fails; app silently serves NewsData.io | **Pending verification** | **Connection:** working on 2026-10-30 with no code change — one real request returned HTTP 200, the app's own client path (service-role key) read 78 rows with the newest 13 min old, and the feed answered `X-Data-Source: supabase`, then `cache`. The earlier failure no longer reproduces, so its `err.cause` could not be captured. **Visibility:** `57fe578` adds `/api/health` (status only, 200/503) and `/api/admin/health` (detail, behind the session); `679c72e` reports each Supabase→NewsData fallback to Sentry, rate-limited (D5). **Needs:** in production, `/api/health` answering 200, and Sentry — with `NEXT_PUBLIC_SENTRY_DSN` set, which it is not locally — receiving a fallback event | DEF-01 |
| F-003 | **Crit** (audit: High) | Scraper follows up to 21 redirects, none revalidated | **Resolved** | `2e383cb`: the guard (`packages/shared/src/lib/urlValidation.ts`) now judges IPv6 literals directly, the IPv4 embedded in mapped/compatible/NAT64/6to4 forms, Teredo, documentation, multicast and 240/4, and rejects credentials; it returns the addresses it validated. `1145bca`: `packages/server/src/services/scrape/fetchPage.ts` follows at most 5 redirects by hand (`maxRedirects: 0`), revalidating every hop, and pins each connection to its hop's validated addresses through axios's `lookup`, so DNS rebinding is closed, not documented; a refused hop is 400. Proven against the real axios with a local server, including a negative control. The article page no longer sends an unverified `url` to the scraper at all (`8d0b775`, F-005), which narrows this surface further | DEF-02 |
| F-004 | High | Admin login unthrottled; password compare leaks length | **Resolved** | `487eb47` (tests first), `7eb9253`: `verifyAdminPassword` (`packages/server/src/auth/adminSession.ts`) compares SHA-256 digests with `timingSafeEqual`, so no length check leaks; `POST /api/admin/login` allows 10 attempts per 15 minutes per IP (owner decision D1: Redis fixed window via `checkRateLimit`, in-memory fallback, logged), 429 with Retry-After. README's "compared in constant time" is now true (N-02). Production behaviour on Redis is a deployment check | DEF-06 |
| F-005 | High | Branded phishing sink: unvalidated `targetUrl`, attacker `og:url` | **Resolved** | `8d0b775` (owner decision: trust anchor = the stored articles). `apps/web/src/app/article/[slug]/page.tsx` uses `?url=` only when `findKnownArticle` (`packages/server/src/services/news/knownArticle.ts`) finds it: an exact match on `articles.link` (read-only), or a built-in mock article. Otherwise the url is treated as absent: no publisher link, no scrape (no outbound request), no attacker title; `og:url` is always the page's own address. All four sinks in `apps/web/src/components/article/ArticleDetailView.tsx` also require `safePublisherHref` (`packages/shared/src/lib/urlValidation.ts`, moved there in `2cd04c9`). Probe: `https://evil.example.com/phish` renders no link and appears in no metadata or request. The app's own links match exactly (six shapes tested), so nothing is normalised. **Depends on** an index on `articles.link`, in the Phase 3 migration (F-018), not yet applied. **Trade-offs:** during a Supabase outage, or for an article past the 7-day window, the page shows no publisher link and no scraped text; signed links are the upgrade path if outage resilience is needed (BL-023) | DEF-03 |
| F-006 | High | PostgREST filter injection via search query | **Pending verification** | `4b33611`: the feed search (`searchFilter` in `packages/server/src/repositories/db.ts`) LIKE-escapes `\ % _`, drops `*`, and double-quotes the value, so `,` `.` `(` `)` cannot add PostgREST clauses; tested against crafted terms. `614e514` (owner: fix now): the admin article list uses the same escape (`containsPattern`, `packages/server/src/lib/likePattern.ts`). **Needs:** the injection probe re-run against the live database (never run locally: it may be production) | DEF-12 |
| F-007 | High | axios advisories (redirect SSRF, ReDoS) | **Resolved** | `56e7509`: axios 1.21.0 — 12 advisories, all fixed in 1.20.0, including "maxRedirects: 0 is not enforced by the fetch adapter", which F-003 relies on. The remaining advisories: `31f4a54` (@sentry/nextjs 10.78.0, tunnel-route bypass; `tunnelRoute` stays unset) and `5970692` (transitive, `npm audit fix` without `--force`) | DEF-13 |
| F-008 | High | `admin_logs` and `breaking_news` DDL only in code comments | **Pending verification** | `db28a46`: `database/schema.sql` creates all three tables `IF NOT EXISTS` and enables RLS; `database/policies.sql` drops and recreates every policy, idempotent, in one transaction; `packages/server/src/repositories/schema.test.ts` checks every column the code uses. Owner runbook the database runbook (`docs/OPERATIONS.md`) (`069bb5b`, `48ac2a2`): order, verify queries, the key each access uses, a snapshot and a rollback per step. **Needs:** the owner applying the files. Nullability gaps: BL-024; the anon-key fallback: BL-025 | DEF-07 |
| F-009 | High | Documented env ≠ actual env | **Resolved** | `10c8b47`: `.env.local.example` lists exactly the 20 variables the code reads (found by grep), one line each; `ADMIN_SECRET_TOKEN` removed, `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` added; `packages/shared/src/config/envExample.test.ts` keeps the two in step. `45223f0` (BL-029): the seed route no longer falls back to `NEXT_PUBLIC_NEWSDATA_API_KEY`. README (`ada0757`) was already right | DEF-14 |
| F-010 | High | No input size caps | **Resolved** | `58c7f7d`: request bodies are read through a byte-capped streaming reader (`packages/server/src/lib/readJsonBody.ts`): `/api/translate` 64 KB, 50 texts, 5,000 characters each and 10,000 in all; `/api/chat` 16 KB and a 2,000-character message, with the article context trimmed; scraped pages capped at 5 MB (`MAX_PAGE_BYTES`, `packages/server/src/services/scrape/fetchPage.ts`). Over a cap: 413 or 400 | DEF-15 |
| F-011 | High | Public scraper has no rate limit | **Resolved** | `3b63a37`: `/api/news/scrape-article` allows 30 uncached scrapes a minute per IP (owner decision D1: Redis fixed window, in-memory fallback), 429 with Retry-After; cached answers are never counted. `65d3337` (BL-016): the article page calls the scraper directly, so **the limit now applies only to external callers**, not to every reader through the server's own address (BL-021). `988c7fa`: the route scrapes only stored articles (the F-005 lookup), so it can no longer be used to fetch arbitrary sites; a refused URL costs no DNS lookup or fetch. Production behaviour on Redis is a deployment check | DEF-16 |
| F-012 | Med | Contact/newsletter forms send nothing | **Resolved** | `59b875d` removed all three forms. No `<form>` remains outside admin, search, chat and the AI panel. The leftover unused newsletter strings were removed in `a81d3c4` (restructure 2, S1) | DEF-09 |
| F-013 | **High** (audit: Med) | AI panel shows a canned "Key Takeaway" on failure | **Resolved** | `526fc07` (characterization), `86bdf78`: the article page's askTimesPrime panel shows "Sorry, that request failed: <reason>" (and Hindi) in an alert, as `Chatbot.tsx` does, instead of a made-up "Key Takeaway"; an empty answer says so instead of a canned insight | DEF-04 |
| F-014 | Med | Admin purge/sync show success from `catch`; `!res.ok` shows nothing | **Resolved** | `a093080` (characterization), `5997567`: sync and purge in `apps/admin/src/app/admin/page.tsx` report success only on `res.ok`; an error status shows the server's message, a thrown request its reason, in a red alert | DEF-17 |
| F-015 | Med | `purgeOldArticles()` awaited on read and write paths | **Resolved** | `2f31bad`: the purge is off the feed's read path (`getDBArticles`) and the upsert path (`saveArticlesToDB`); it runs once per cron run (`packages/server/src/services/news/refreshNews.ts`), whose response and audit entry carry the count. The admin's explicit purge action (`POST /api/admin/db-stats`) **stays, by owner decision**: the intent was "off the read path", and a deliberate admin action is fine | DEF-05 |
| F-016 | Med | Feed fetches 80, filters in JS, slices 40 | **Resolved** | `2e3fa0b`: `getDBArticles` reads pages of 80 newest-first until 40 rows pass the JS filters, the rows run out, or 5 pages are read; a later page's error serves what was found | DEF-08 |
| F-017 | Med | Scraper returns 200 with placeholder prose; UI string-matches | **Resolved** | `41c3ab0` (characterization), `b7f6fbc`: a failed scrape is 502 (504 on timeout) with `{ error }` (`ScrapeErrorResponse`, `packages/shared/src/types`); nothing to extract is 200 with empty content; the view no longer matches placeholder wording, and the page passes it no content on any failure. Accepted by the owner: external callers of the public route now see 502/504, and the cache key is `scrape:v2:` | DEF-10 |
| F-018 | Med | 2 indexes for 7 filtered columns | **Pending verification** | `4898da4`: `database/migrations/2026-11-02-indexes.sql` adds GIN on `category` and `country`, `pg_trgm` trigram GIN on `title` and `description`, and a btree on `link` (the F-005 lookup and the public scrape route depend on it; not unique, for the `#` placeholder links). Idempotent; verify with the runbook's `EXPLAIN`. **Needs:** the owner applying it | DEF-18 |
| F-019 | Med | Lint fails; no CI | **Resolved** | `bc556da` (lint 19 errors → 0), `506a4ab` (CI). Lint today: 0 errors, 13 warnings. GitHub Actions run 41010981658 on `4cf5be6`: success; CI has stayed green since | — |
| F-020 | Med | Rate limiter keys never evicted | **Resolved** | `b44203d`: the in-memory limiter (`packages/server/src/lib/rateLimit.ts`) sweeps expired keys every minute and holds at most 10,000. `e29cf0d`: chat and translate 429s send Retry-After. The in-memory cache got the same eviction (`e5754b5`, BL-013, N-03) | DEF-19 |
| F-021 | Med | Feed fetch races; no AbortController | **Resolved** | `675ce1d` (characterization), `9ce42bc`: `fetchNews` in `apps/web/src/components/home/HomeClient.tsx` aborts the previous request and applies a response only if no newer call started (sequence guard); the duplicate fetches on category change, Reset Category and URL sync are gone (owner accepted the effect change). Related: BL-027, the hidden first search result, fixed in `96f192d` | DEF-20 |
| F-022 | Low | Page title doubled | **Resolved** | `ef510f9`: the article page sets the bare title and the root layout's template adds the suffix once; `openGraph.title` keeps it. Rendered: "Monsoon arrives early \| TimesPrime News" | DEF-21 |
| F-023 | Low | Supabase SDK in client bundle | **Resolved** | `b01d528`; `GoTrueClient` in browser chunks 1 → 0. CODEMAP: 0 server-only modules in the client bundle; `server-only` guards since `e3753b3`, and on every backend module since `19d255c` | — |
| F-024 | Low | `translateHeadline()` ignores `lang` | **Resolved** | `3de9a1e` (owner decision D3): the `translateHeadline` no-op and its three call sites are gone; nothing renders differently. Headline translation is a feature: BL-026 | DEF-22 |
| F-025 | Low | Dead RSS subsystem | **Resolved** | `bcd5393` (code + 503 route, routes 27 → 26), `d3ba8fa` (footer link). Leftover: a historical comment in `packages/shared/src/config/imageDomains.ts:14`; the unused `rssFeeds` string was removed in `a81d3c4` | — |
| F-026 | Low | `.node-version` 20 vs runtime 24 | **Pending verification** | `974b255` (D2): `.node-version` 24, `package.json` `engines` `24.x`, and CI follows `.node-version`; the local runtime is 24.19.0. CI on Node 24 has been green since (latest: run 41046741477 on `5f6b0cc`). **Needs:** Node 24 on the production runtime, at the AWS deployment (nothing is deployed until the project is complete). `@types/node` is `^24` since `0066f27` (BL-012, resolved) | DEF-23 |
| F-027 | Low | Chatbot has no dark mode | **Resolved** | `7ead49b`: `Chatbot.tsx` has dark variants from the app's palette; a test checks every light surface has one. The growth (418 B of class strings on every route) was accepted; the chatbot shipping on every route is BL-030 | DEF-24 |
| F-028 | Low | Theme flash on load | **Partial** | `5ad891a`: an inline script in `<head>` (`THEME_INIT_SCRIPT`, `packages/shared/src/config/theme.ts`) sets the `dark` class and background before the first paint, so every `dark:` variant is right from the start; no CSP blocks it. **Remaining:** components that style with `isDark ?` ternaries (75 in 16 files) still switch after hydration, a visible flash for those elements: BL-028 (owner ruling) | DEF-25 |

### Contradictions between the audit and the PRD

*The PRD (`docs/PRD.md`) was retired on 4 Nov 2026; it is in git history.*

Recorded rather than silently resolved, then ruled on by the owner (Phase 0 approval):

- **Severity of F-003.** The audit rates it High; PRD DEF-02 rates it **Critical**.
- **Severity of F-013.** The audit rates it Medium; PRD DEF-04 rates it **High**.

**Ruling: the higher rating governs priority.** F-003 is treated as Critical and F-013 as High. Both
ratings stay visible in the ledger's Sev column.

### New observations (not in the audit)

Found during triage. Not fixed; listed for the owner.

| ID | Observation | Where | Status |
|---|---|---|---|
| N-01 | Sentry's secret scrubber redacted only `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `NEWSDATA_API_KEY` | `packages/shared/src/lib/sentryScrub.ts` | **Resolved** `f6c2016`: nine keys, found by grep, plus a test that fails if a new secret-named env var is read without being scrubbed |
| N-02 | README claims the admin password is "compared in constant time"; F-004 shows it is not yet | `README.md:102` | **Resolved** `7eb9253` (F-004): the comparison is now constant-time, so the claim is true |
| N-03 | The in-memory cache (used when Upstash is not configured, as locally) removes an expired entry only when it is read again, so keys that are never re-read — every distinct scraped URL, every search — accumulate. Same class as F-020 | `packages/server/src/lib/cache.ts` | **Resolved** `e5754b5` (BL-013): a sweep every minute and at most 1,000 entries |
| N-04 | During a Supabase outage, `db.ts` sends every failed operation to Sentry unthrottled: five events per feed request (freshness, purge, upsert, purge, select), observed in the D5 run. D5's single rate-limited report covers visibility; these are the noise | `packages/server/src/repositories/db.ts` | **Resolved** `cc1d479` (BL-014): at most one Sentry event per operation per 5-minute window, through the D5 limiter |
| N-05 | `npm audit fix` (`5970692`) moved jest 30.4.2 → 30.5.2, which adds `@parcel/watcher` 2.6.0, the tree's first new package with an install script since the baseline. npm 11 does not run the script | `package-lock.json` | **Investigated, no action.** See below |

#### N-05 — `@parcel/watcher` and its blocked install script

- **What it is for.** File watching in `jest --watch` / `--watchAll`, and nothing else. It is a
  dev-only dependency: `jest → @jest/core → jest-haste-map 30.5.1 → @parcel/watcher 2.6.0`.
  `jest-haste-map` loads it lazily inside `_subscribe()`, with the comment *"Watch mode is the only
  consumer of the native binding"*, so `npm test`, `npm run test:ci` and CI never load it. The app
  never ships it.
- **What the blocked script does.** `scripts/build-from-source.js` runs `node-gyp rebuild` **only**
  when `npm_config_build_from_source=true`; otherwise it exits doing nothing. (An earlier version
  of this row said it builds when no prebuilt binary exists; the script shows it does not.) The
  native binary arrives as a per-platform optional package — `@parcel/watcher-win32-x64` here,
  `-linux-x64-glibc` on the CI runner — so nothing depends on the script running.
- **Does anything break with it blocked?** No, checked on 2026-10-30: `npm test` exit 0 (9 suites,
  70 tests); `npm run build` exit 0 (28 routes); and the native binding itself loads from
  `@parcel/watcher-win32-x64` and delivered a file event (`update probe.txt`) in a probe, so
  `jest --watch` has what it needs. CI on Node 24 / npm 11 is green (run 41018035376).
- **npm settings:** unchanged, by owner instruction.

### npm audit

| When | Total | Critical | High | Low |
|---|--:|--:|--:|--:|
| 2026-10-30, before Phase 1 | 16 | 2 | 9 | 5 |
| after F-001 `47e62ae` (next, sharp) | 14 | 1 | 8 | 5 |
| after F-007 `56e7509` (axios) | 13 | 1 | 7 | 5 |
| after `31f4a54` (@sentry/nextjs, fast-uri) | 11 | 0 | 6 | 5 |
| after `5970692` (transitive) | **5** | **0** | **0** | 5 |
| 2026-11-02, Phase 5 close-out | 37 | 0 | 0 | 3 (+34 moderate) |

#### Accepted risk — the jest lows

`jest`, `jest-cli`, `jest-config`, `@jest/core` and `deepmerge`, all **low**, accepted by owner
ruling (Phase 0 approval). The reason: npm's only "fix" is jest **25.1.0**, a major *downgrade*
from the installed 30.x, and the code runs only at test time, never in the app. Never run
`npm audit fix --force` for them; recheck when a jest release clears them.

#### New since 2026-10-30 — 34 moderate, dev and build tooling only

Two advisories published after the Phase 1 audit:
- `glob` 9.0.0–14.0.1, [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4).
  It reaches us through `@sentry/nextjs`'s build-time bundler plugin.
- `minimatch` <11.0.1, [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
  It reaches us through `eslint` and `eslint-config-next`'s plugins.

Neither ships in the app. npm's only fixes are major-version changes (`eslint` 4.0.0, `@sentry/nextjs`
10.76.1). `npm audit fix --dry-run` without `--force` changes 14 dev packages and leaves the count at 37.
So nothing was changed: no upgrade without the owner (BL-031). The jest lows are now counted as 3
(`deepmerge`, `jest`, `jest-cli`).
