# Operations

Running, deploying and picking up TimesPrime:

1. [Environment variables](#environment-variables): every variable, where it is set, and which files
   hold them.
2. [Deployment](#deployment): Vercel, the owner's settings, and the go-live checklist.
3. [Runbooks](#runbooks): procedures for the owner, to follow under pressure.
4. [Current status](#current-status): where the work stands, the baselines, the gotchas, the
   history. **A new session starts here**, after [the README](README.md).
5. [Backlog](#backlog): deferred work, each item with the reason it was deferred.
6. [Audit ledger](#audit-ledger): the 28 audit findings and their status.

> **Paths in carried records.** The runbook, the backlog, the audit ledger and the history below
> were written before restructure 3 (2026-11-03) and keep the paths of their time, where they
> describe what happened then. Since then `app/` is `frontend/app/`, `shared/` is `backend/shared/`,
> `scripts/` is `backend/scripts/`, the Next.js root files are in `frontend/`, and `.env.local` is
> `frontend/.env`. Instructions meant for today use today's paths.

## Environment variables

**Files.** `frontend/.env` holds the owner's real values locally: it is git-ignored, and a session
never reads, prints, copies or edits it ([the working rules](README.md#working-rules-for-claude-code-sessions)).
Create it from `frontend/.env.example`, the committed template, which names every variable the code
reads; a test keeps the two in step (F-009, `10c8b47`). `frontend/.env.test`, committed with every
key empty, is the test environment: Next loads it before `.env` when `NODE_ENV` is `test`, and keeps
the first value it finds, so tests never see the real values. In production, the variables are set
in the Vercel project. **Never commit real values.** (Until 2026-11-03 the local file was
`.env.local` at the repository root, and the template `.env.local.example`.)

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public anon key; RLS restricts it to reads. Used only without the service-role key, and then every write fails (BL-025) |
| `SUPABASE_SERVICE_ROLE_KEY` | server, required in production | Bypasses RLS for server writes. Never expose to the client |
| `NEWSDATA_API_KEY` | yes | NewsData.io. Without it the app serves built-in mock articles |
| `ANTHROPIC_API_KEY` | yes | Powers `/api/chat` and category classification. Without it chat returns a clear "unavailable" message |
| `ADMIN_PASSWORD` | yes | The admin panel password, compared in constant time. Unset (or without `ADMIN_SESSION_SECRET`), login answers 503 and `/admin` stays locked |
| `ADMIN_SESSION_SECRET` | yes | HMAC key signing the 12-hour admin session cookie; changing it signs every admin out |
| `ADMIN_LEGACY_LOGIN` | optional | The two variables above are the shared password, retired in code at 2027-01-01 00:00 IST. Set this to `off` to retire it sooner |
| `CRON_SECRET` | prod | Gates `/api/cron/refresh-news`; Vercel Cron sends it as a bearer token. Unset, the endpoint fails closed (503) |
| `UPSTASH_REDIS_REST_URL` | optional | Shared cache and the shared rate-limit windows. Without it, an in-process cache is used (fine locally, not shared across serverless instances) |
| `UPSTASH_REDIS_REST_TOKEN` | optional | Pairs with the URL above |
| `NEXT_PUBLIC_SENTRY_DSN` | optional | Error reporting. Not a secret, but must be `NEXT_PUBLIC_` to reach the browser |
| `SENTRY_AUTH_TOKEN` | build | Source-map upload at build time only |
| `SENTRY_ORG` | build | Sentry org slug |
| `SENTRY_PROJECT` | build | Sentry project slug |
| `NEXT_PUBLIC_APP_URL` | prod | The site's public origin: the CORS allow-origin in production, and OpenGraph's `og:url` |
| `NEXT_PUBLIC_BASE_URL` | optional | Origin the article page fetches its suggested stories from (BL-016); defaults to `http://localhost:3000` |

`ADMIN_SECRET_TOKEN` and `MEDIASTACK_API_KEY` appear in some older env files and are **read by
nothing**; `NEXT_PUBLIC_NEWSDATA_API_KEY` is no longer read either (`45223f0`) and must never be
set. The code also reads `NODE_ENV`, `CI` and `NEXT_RUNTIME`, which the platform sets.

## Deployment

Hosted on Vercel: **Vercel Pro, region `bom1` (Mumbai)**, chosen in R0 of the release (owner,
2026-11-03). Set every variable from the table above in the project's environment settings.
`frontend/vercel.json` registers the cron at `*/30 * * * *` against `/api/cron/refresh-news`; that
path must not change without updating the file. Vercel runs crons only for production deployments.

### Vercel project settings (owner action)

The Next.js root is `frontend/`, but the one `package.json` and lockfile are at the repository root,
and `frontend/app` imports `backend/` ([ADR 0004](ARCHITECTURE.md#adr-0004--four-top-level-folders-four-documents)).

| Setting | Value |
|---|---|
| Framework Preset | Next.js |
| Root Directory | `frontend` |
| Include files outside the root directory in the Build Step | Enabled |
| Install Command (override) | `cd .. && npm ci` |
| Build Command (override) | `cd .. && npm run build` (which runs `cd frontend && next build`) |
| Output Directory | default (`.next`, inside `frontend/`) |
| Node.js Version | 24.x |
| Function region | `bom1` |

Vercel's documentation says an app "will not be able to access files outside" its Root Directory,
and does not say which `package.json` it reads when the Root Directory has none. So this setup is
proven by a preview deployment of the branch, not by the docs. In the build log: the install step
adds the packages; Next.js 16.4.3 is detected; the build compiles without a `Can't resolve
'../backend/...'`; the route table lists the 28 routes. If it fails, the fallback is npm workspaces
with a small `frontend/package.json` (owner decision 1).

### Go-live checklist

Nothing below can be done from this machine without touching production. It is the owner's list.

**Database** ([`runbooks/apply-database.md`](OPERATIONS.md#runbook-apply-the-database-files)):
1. Confirm `SUPABASE_SERVICE_ROLE_KEY` is set in the deployment (present, not copied). Without it the
   app falls back to the anon key and RLS refuses every write (BL-025).
2. Take the step 0 snapshot and confirm `service_role` has `rolbypassrls`.
3. Apply `database/schema.sql`, then `database/policies.sql`, then
   `database/migrations/2026-11-02-indexes.sql`. Verify each as the runbook shows. Each has a
   rollback. This closes F-008 and F-018 (the F-005 and scraper lookups use the link index).
4. Before any `NOT NULL` migration, count the nulls in live data (BL-024).
5. Re-run the F-006 injection probe, and an RLS check, against the live database.

**Environment and platform:**
- Confirm whether local and production use the same Supabase project (`frontend/.env` names
  `yhjotyxrdaqtcgsxigok`). If they do, set up a separate dev project: a local run writes to it (§3.18).
- Vercel: Node 24 (F-026), `NEXT_PUBLIC_SENTRY_DSN`, the Upstash variables, `CRON_SECRET`, and that
  the cron runs. No production cron entry has ever been seen in the database.
- Owner's `frontend/.env`: `ADMIN_SECRET_TOKEN` and `MEDIASTACK_API_KEY` can go; nothing reads them.
  Never set `NEXT_PUBLIC_NEWSDATA_API_KEY`.

**Production smoke test:**
- `/api/health` answers 200, and Sentry receives a Supabase fallback event (F-002).
- `X-Data-Source` shows `supabase` or `cache` for readers (NFR-01).
- The cron runs and its audit entry carries the purge count (F-015).
- The Redis limiter: the 11th login attempt in 15 minutes and the 31st uncached scrape in a minute
  answer 429 across instances (F-004, F-011).
- BL-019 (publisher image timeouts) under real traffic.

**Not covered by any audit:** accessibility (axe-core), a scraper replay against the 120-URL
publisher sample, a staging environment, Supabase backup and restore, end-to-end tests, and a bundle
budget in CI.

**Open with the owner:** the privacy policy (BL-008); BL-031 (accept the moderate advisories or wait);
Phase F (§6) is optional.

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
- **Cron not firing** — stale feed. Check `lastSyncAt` in `/api/admin/stats`
  against the 30-minute schedule in `vercel.json`.
- **Admin lockout** — `ADMIN_PASSWORD` or `ADMIN_SESSION_SECRET` unset makes
  `/api/admin/login` return 503 and every `/admin/*` path redirect to the login
  page.
- **Restoring the database** — schema from `database/schema.sql`, then
  `database/policies.sql`.

Written:

- [`apply-database.md`](OPERATIONS.md#runbook-apply-the-database-files) — apply the SQL files in `database/` in order, and verify each. Restoring the schema follows the same steps.

### Runbook: apply the database files

For the owner, at deployment. Nothing in the app or its tooling applies these files; this runbook
is the only way they reach a database. Every file is idempotent, so a step that fails halfway can be
run again. Every step has a rollback, which relies on the snapshot you take in step 0.

**Before you start**
- Confirm which Supabase project you are connected to. Local `frontend/.env` may point at the
  production project ([the go-live checklist](OPERATIONS.md#go-live-checklist)); apply to the project you mean to change.
- Confirm that `SUPABASE_SERVICE_ROLE_KEY` is set in the deployment's environment variables. Check
  only that it is present; never copy its value anywhere. See [Which key the app uses](#which-key-the-app-uses-and-what-rls-does-to-it):
  without it, Row Level Security makes the app's writes fail.
- Take a backup, or confirm point-in-time recovery is on (Dashboard → Database → Backups).
- Open Dashboard → SQL Editor → New query. Paste each file whole, then Run.

#### Which key the app uses, and what RLS does to it

Every database call is made by the server, through one client (`backend/lib/supabase.ts`). The
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
| `articles` | SELECT: the feed, the freshness check, the new-story count, the row count, the link lookup (F-005) | `backend/repositories/db.ts` | ✅ bypass | ✅ "Public read access" |
| `articles` | SELECT: health probe, admin list and stats, classifier column probe | `services/health`, `api/admin/articles.ts`, `api/admin/stats.ts`, `services/classify` | ✅ bypass | ✅ "Public read access" |
| `articles` | UPSERT: cron ingest, admin publish | `db.ts` `saveArticlesToDB`, `api/admin/publish-article.ts` | ✅ bypass | ❌ none |
| `articles` | UPDATE: admin edit, `category_mismatches`, scraped `content` | `api/admin/articles.ts`, `services/classify`, `services/scrape` | ✅ bypass | ❌ none |
| `articles` | DELETE: the 7-day purge, admin delete and bulk delete | `db.ts` `purgeOldArticles`, `api/admin/articles*.ts` | ✅ bypass | ❌ none |
| `breaking_news` | SELECT: the homepage banner (public `GET /api/admin/breaking-news`, CR-08) | `api/admin/breaking-news.ts` | ✅ bypass | ✅ "Public read access" |
| `breaking_news` | INSERT, UPDATE (`is_active = false`): admin set and remove | `api/admin/breaking-news.ts` | ✅ bypass | ❌ none |
| `admin_logs` | INSERT: every admin action and cron run | `backend/repositories/auditLog.ts` | ✅ bypass | ❌ none |
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

If the activity log is empty or fails right after an admin action, the app may be on the anon
fallback; see
[Which key the app uses](#which-key-the-app-uses-and-what-rls-does-to-it). Roll back step 1 for
`admin_logs` and `breaking_news` (if their snapshot showed RLS off) until the key is set.


### Runbooks still to come

- **Staff access** (the full order for Panel 0: migrations, then deploy, then bootstrap, then a staff
  sign-in) and **Sign-in broken** (what to do when the main sign-in flow breaks) are written on
  `panel-0-access`. They arrive here with the rest of Panel 0, as sections of this file.
- R1 adds the go-live items the owner asked for: the Anthropic monthly spend limit, the NewsData plan
  check, and the Supabase region check.

## Current status

**State as of 2026-11-03.**

> **Release in progress (owner, 2026-11-02).** The owner's senior asked for a deployment now. The
> release is built on `release/v1`, branched from `main`, in phases R0–R4, each ending at a STOP; it
> merges to `main` after the owner approves. **Panel work is paused** and resumes after the release:
> Panel 0's second half waits on `panel-0-access`.
>
> **The real database.** `frontend/.env` holds its credentials and the app uses them. Never read,
> print or edit it. Never write to the database yourself: no SQL, migrations, bootstrap, test users
> or destructive tests. Schema changes are owner actions in a runbook. The app's normal behaviour
> (reading, ingesting, caching scraped content) is fine. End-to-end tests are read-only.

> **⚠ `main` is not deployable until the Panel 0 migrations are applied; see the runbook.**
> Since `78e58b6` every admin route writes the audit log before it changes anything, and refuses
> (503) when it cannot. Until the owner applies `database/migrations/2026-11-02-access-1-foundation.sql`
> and `2026-11-02-access-2-catalog.sql`, the `audit_log` table does not exist, so every admin change
> answers 503. Reads and the shared-password login still work. Each SQL file carries its own apply,
> verify and rollback notes; the runbook steps for them (and a staff-access runbook with the full
> order: migrations, then deploy, then bootstrap, then a staff sign-in) arrive with the rest of
> Panel 0, built on the branch `panel-0-access`, which merges only when it is complete and approved.

**Where the release stands.**

- **R0** (assessment): approved, version 2. The hosting is Vercel Pro in `bom1`.
- **Hindi text fix** (`239e701`): Devanagari was cut off in clamped headlines; a Devanagari font and
  `:lang(hi)` line heights fixed it.
- **Restructure 3** (2026-11-03, branch `chore/four-folders`,
  [ADR 0004](ARCHITECTURE.md#adr-0004--four-top-level-folders-four-documents)): four top-level
  folders, four documents, `frontend/.env`. Merges back into `release/v1` after the owner approves.
  Owner actions: the Vercel project with the settings in [Deployment](#vercel-project-settings-owner-action),
  and a preview deployment to prove them. Done by the owner: `.env.local` moved to `frontend/.env`.
- **R1** (hosting config, env vars, cron, security headers, 404 and error pages, health checks, SEO
  basics, ngrok leftovers, suggested stories called directly; chat and translate on the shared
  Redis limit with a per-IP daily cap; staging as the Vercel preview behind Deployment Protection;
  go-live items; grievance officer and legal placeholders): approved, not started. It waits on four
  values from the owner: the Supabase region, the brand colour (`#B3121F` until then), the NewsData
  plan and its daily request limit, and the grievance officer's name and email (or "TBD").

### Baselines

At the end of restructure 3. Compare against these after any change.

| Measure | Value |
|---|---|
| Routes | **28**, identical to `backend/scripts/baseline-routes.txt` |
| Client JS | **976,120 bytes** in 18 chunks. Per route: `/admin` 162,502 · `/article/[slug]` 141,714 · `/` 125,854 · `/saved` 113,392 · `/contact` 100,660 · `/about`, `/privacy`, `/terms` 97,502 each · `/admin/login` 31,809 · `/_not-found` 28,318 · `/_global-error` 14,138 |
| CSS | **95,166 bytes**, one file, 928 selectors |
| Tests | **42 suites, 666 tests**, all passing |
| Coverage | **88 files** measured (the shims excluded) |
| Lint | **0 errors, 13 warnings** (all in source; BL-002 accounts for two) |
| Boundaries | `check:boundaries`: 0 violations, 311 import edges, 35 modules in the client bundle |

Client JS is the sum of `frontend/.next/static/chunks/**/*.js`. A route's JS is the chunks listed in
`entryJSFiles` of its `frontend/.next/server/app/**/page_client-reference-manifest.js`. Chunk bytes
move when module ids do ([gotcha 3.17](#317-turbopacks-chunk-bytes-move-when-module-ids-do)).

### 1. The project before the release (2026-11-02)

**For:** a fresh Claude session (or engineer) continuing this work with no prior context.
**State as of:** 2026-11-02. Branch `main`. Two restructures and all five audit phases are done:
- **Audit Phases 1–5** fixed the 28 audit findings. None is open: 22 are resolved, 5 await a check
  that needs production or the owner, and 1 (F-028) is partial. Status per finding:
  [`AUDIT-FINDINGS.md`](OPERATIONS.md#audit-ledger).
- **Restructure 2** is complete (S0–S5, [ADR 0002](ARCHITECTURE.md#adr-0002--frontend-backend-shared-and-database-separation-in-one-nextjs-app-2026-10-30-superseded-in-part-by-0004)
  accepted). The code is split into `app/`, `frontend/`, `backend/`, `shared/` and `database/`.
- **Restructure 1** (Phases A–E, [ADR 0001](ARCHITECTURE.md#adr-0001--feature-first-structure-with-layer-separation-and-a-ci-enforced-boundary-2026-10-30-superseded-by-0002), now superseded)
  came before it.

**Next: Panel 0 (Access foundation)**, the first panel of the back office: staff accounts, roles,
permissions, MFA, the audit log and the server-side permission check. The plan is
[`PANEL_PLAN.md`](PANEL_DOCS.md#panel-plan); progress and per-panel docs are in [`PANEL_DOCS.md`](PANEL_DOCS.md).
Panels are built one at a time, and Panel 0 starts with a design for the owner to approve. The
deployment phase (§11) stays on the owner's list. Run `git log --oneline -20` for the exact head.

Read §1 and §3 before touching anything. §3 in particular will save you from false conclusions
that have already been reached and discarded once.

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
  failure and UX findings, then closed out (§4). Every finding has a status in `AUDIT-FINDINGS.md`.
- **Restructure 2** answered the reviewer's request to make frontend, backend, database and docs
  visibly separate. One app, with `app/` as a routing shell
  ([`architecture.md`](ARCHITECTURE.md#system-design) §4):
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

**Key documents:** the four in `docs/`, listed in [the README](README.md#the-four-documents).

There is also a published audit artifact (28 findings, severity-filterable):
`https://claude.ai/artifact/Hpo9Q5pJg1vw7ZjXyuT8Ck` — private to the owner.

### 2. Environment

| | |
|---|---|
| Platform | Windows 11. Both PowerShell and Git Bash available |
| Node / npm | v24.19.0 / 11.17.0. **Node 24 everywhere** since `974b255`: `engines` `24.x` in `package.json`, which CI reads (`.node-version` too, until restructure 3) |
| Dependencies | Installed via `npm ci` |
| Dev server | **Stopped** during all three restructures (its Turbopack watcher can lock files during `git mv`). `npm run dev` to start |
| Line endings | **CRLF** in the working tree (`core.autocrlf=true`; the index is LF) |
| Git identity | Set locally for this repo: `Vivek Singh <vivektech.dev25@gmail.com>`. Not global |

The commands are in [the README](README.md#commands).

**Baselines at the audit Phase 5 close-out (2026-11-02)**, kept for the record; today's are in
[Baselines](#baselines):

| Measure | Value |
|---|---|
| Routes | **28**, identical to `_baseline-routes.txt` |
| Client JS | **976,061 bytes** in 18 chunks (restructure 2 ended at 974,067). Per route: `/admin` 162,443 · `/article/[slug]` 141,655 · `/` 125,795 · `/saved` 113,333 · `/contact` 100,601 · `/about`, `/privacy`, `/terms` 97,443 each · `/admin/login` 31,750 · `/_not-found` 28,259 |
| CSS | **93,540 bytes**, one file, 921 selectors (+1 in F-027: `dark:hover:text-white`) |
| Tests | **32 suites, 388 tests**, all passing |
| Coverage | **80 files** (the shims excluded): 47.01% of statements (5,968 of 12,694), 71.33% of branches, 61.84% of functions. `backend/` + `shared/`: 61.51% (3,448 of 5,606) |
| Lint | **0 errors, 13 warnings** (all in source; BL-002 accounts for two) |
| Boundaries | `check:boundaries`: 0 violations. CODEMAP: 0 server-only modules in the client bundle |
| `npm audit` | **37: 0 critical, 0 high, 34 moderate, 3 low**. The moderates are dev and build tooling (BL-031); the lows are the accepted jest set |

Client JS is the sum of `.next/static/chunks/**/*.js`. A route's JS is the chunks listed in
`entryJSFiles` of its `.next/server/app/**/page_client-reference-manifest.js`. Chunk bytes move
when module ids do (§3.17).

```
tsc --noEmit             exit 0
eslint                   exit 0   (0 errors, 13 warnings)
check:boundaries         exit 0   (0 violations)
jest --ci                32 suites, 388 tests passed
next build               exit 0   (28 routes)
```

### 3. Gotchas that have already burned time

These are not theoretical. Each one caused a wrong conclusion or a failed command in an earlier
session.

#### 3.1 This is not the Next.js you were trained on

Next 16.4 postdates most published material. **The working rules in the README require reading
`node_modules/next/dist/docs/` before relying on any framework convention.** Known traps:

| Looks wrong | Actually correct |
|---|---|
| `proxy.ts` instead of `middleware.ts` | Next 16 **renamed Middleware to Proxy**. Correct as-is, in `frontend/` beside `app/` |
| `preload` prop on `next/image` | Correct. **`priority` is deprecated as of v16.0.0** — the familiar prop is the wrong one |
| `remotePatterns` hostnames using `{,*.}host` glob | Correct. Hostnames are matched with **picomatch**, not string equality (`next/dist/shared/lib/match-remote-pattern.js`) |
| A route file that is one line, `export { GET } from "@/backend/api/…"` | Correct. Restructure 2's shims (A2); the body lives in `backend/api/` |

`remotePatterns` is capped at **50 entries** (zod `.max(50)` in `next/dist/server/config-schema.js`).
The list in `backend/shared/config/imageDomains.ts` holds 49. One slot free.

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
Also check `frontend/.next/dev/logs/next-development.log` for the actual errors.

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
Restructure 2 measures the whole repo by glob (`7ef8ab8`), excludes the 25 one-line shims by name
from the move map (`2b0f86c`), and the audit fixes added tests: **9.27%** of statements at the end
of restructure 2. The oversized files in §6 still read **0%**.

#### 3.7 `eslint-disable-next-line` placement

It disables the **next line**, including a comment line. Putting it at the top of a multi-line
explanation block disables the comment, not the code. The explanation goes first; the directive sits
immediately above the statement.

#### 3.8 Two npm postinstall scripts are blocked

`@sentry/cli` and `unrs-resolver` were blocked by sandbox policy. **This does not break anything** —
`npm run build` and `npm run lint` both work. (An earlier claim that it might break the build was
wrong.) `npm approve-scripts --allow-scripts-pending` if source-map upload is ever needed.

#### 3.9 Never print `frontend/.env`

It holds real credentials (it was `.env.local` at the repository root until 2026-11-03). It is
never read, printed, copied, edited or moved by a session, including for worktrees and probe builds
(owner instruction); a probe build runs without it. `.claude/settings.json` denies Claude Code's
Read and Edit on it. Keys set at the last check (names only):
`ADMIN_PASSWORD`, `ADMIN_SECRET_TOKEN`, `ADMIN_SESSION_SECRET`, `CRON_SECRET`,
`MEDIASTACK_API_KEY`, `NEWSDATA_API_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

Note `ADMIN_SECRET_TOKEN` is set but **read by nothing** — leftover from the stale
`.env.local.example` that the README now corrects.

#### 3.10 Moving or deleting a route breaks `typecheck` until `.next/types` is cleared

`npm run verify` runs `typecheck` **before** `build`, and `frontend/tsconfig.json` includes the previous
build's generated route types. After a route file moves or is deleted, `tsc` reads a stale validator
still importing the old path:

```
.next/types/validator.ts: error TS2307: Cannot find module '../../src/app/.../route.js'
```

The source is fine — do not "fix" it. `rm -rf frontend/.next/types` and re-run. It hit the RSS deletion
(`bcd5393`), and every restructure-2 slice that touched `app/` cleared `.next/types` first. Durable
fix: `next typegen` in the `typecheck` script (BL-007).

#### 3.11 Verify claims against the build, not just the graph

`check:boundaries`' client-bundle closure is a static cross-check. When it matters, check the
production bundle: `grep -l <distinctive-string> frontend/.next/static/chunks/*.js`, then find which
route loads that chunk in `frontend/.next/server/app/**/page_client-reference-manifest.js`. That is how the Supabase SDK in
`/admin`'s chunk was confirmed (`GoTrueClient`), with server-only strings as a negative control, and
how S5 confirmed a same-length image URL change actually shipped.

#### 3.12 A barrel imported by a server component ships every client component it re-exports

Measured in restructure 1, slice 5: `app/layout.tsx` importing `BreakingNewsBanner` from the admin
feature's barrel put all five admin dashboard components on **every** route (+46 KB on `/`).
`"use client"` on the barrel does not help — the module count drops but the bytes stay. What fixes
it is the `package.json` in each feature folder: today `{ "sideEffects": false }` in each
`frontend/features/*/` (`bae6f8a`). Restructure 2 measured it again with the field removed: every
route got heavier, by +457 bytes to +84,579 bytes. **Do not delete those files as clutter**, and do
not put a side-effect-only import (CSS, polyfill) inside a feature.

#### 3.13 `sed -i` silently converts CRLF files to LF

Git Bash's `sed -i` rewrites the line endings of every file it touches. The index is LF
(`core.autocrlf=true`), so commits are unaffected, but the working copy drifts. Rewrite with a Node
script that detects and restores `\r\n`, and check with `git ls-files --eol <file>`.

#### 3.14 Path-keyed lists in the scripts go stale silently on a move

`generate-codemap.mjs` keys `PURPOSE`, `SERVER_ONLY` and its table groups by path, through the move
map. Each throws if an entry names a missing file or a module matches no group (`ab8661b`,
`21c8951`). Keep it that way: a policy list that tolerates a stale path reports success while
checking nothing. `scripts/move-map.mjs` itself now has consumers: `SHIMS` drives the coverage
exclusion (`jest.config.ts`) and A2 in lint (`eslint.boundaries.mjs`).

*Since restructure 3,* `generate-codemap.mjs` and `move-map.mjs` are deleted. The lesson stands, and
`backend/scripts/shims.mjs` avoids the problem: it reads its list from disk instead of keeping one.

#### 3.15 Directory renames fail on Windows while the editor watches them

`git mv src/app app` failed with "Permission denied": VS Code's TypeScript server holds watch
handles on the directories. Restructure 2 moved files one by one instead (`git mv` per file, with
`GIT_LITERAL_PATHSPECS=1` for paths like `[slug]`), then removed the empty folders. Do not kill
editor processes to get around it (owner instruction).

#### 3.16 Tailwind v4 scans every file that is not git-ignored

Class detection is automatic and reads Markdown and comments too. A word in a document once removed
a CSS rule when the document was deleted (BL-018). `frontend/styles/globals.css` now excludes
`docs/`, `backend/scripts/` and `database/` with `@source not`, with paths relative to the
stylesheet. Since restructure 3 it also adds the whole repository with `@source "../.."`: Next runs
in `frontend/`, where detection would otherwise start, and `backend/shared/config/categoryColors.ts`
holds utilities. Code comments and tests are still scanned: `.transform` is in the CSS only because
`frontend/jest.config.ts` comments say "transform".

#### 3.17 Turbopack's chunk bytes move when module ids do

Module ids derive from paths, so a pure move changes chunk bytes with no code change. Restructure 2
compared a **normalised** JS size per route (digits, hashes, chunk names and UUIDs neutralised) to
tell that noise from real growth. In S3 the normalised size moved only where the code really
changed; the one growth kept was the X1 entry point on `/` (109 bytes at slice 9, 50 by the end of
S3; ADR 0002).

#### 3.18 `next start` reads `frontend/.env`, so a local run uses the real Supabase

Next loads `frontend/.env` itself (`.env.local` until 2026-11-03). A local `next start` therefore runs the app's normal flow against
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

#### 3.20 Next.js and Jest run in `frontend/`, not at the root

Restructure 3 made `frontend/` the Next.js root, and the npm scripts `cd` into it. Running
`next build frontend` from the root fails: Next compiles `next.config.ts` into a module with no
filename, so Node resolves the config's relative imports against the working directory, and
`../backend/shared/config/imageDomains` is then looked for one folder above the repository. Jest
loads the same config through `next/jest`, so it runs from `frontend/` too. Tests that read repo
files resolve the root from their own folder (`path.resolve(__dirname, ...)`), never from
`process.cwd()`. Lint and the typecheck run from the root (`eslint -c frontend/eslint.config.mjs`,
`tsc -p frontend`).

### 4. Commits — restructure 2, audit Phases 2–5, restructure 3

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

Every commit passed `npm run verify`. Every commit that touched `app/` or deleted anything was
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

**Retired:** `docs/TimesPrime-PRD-and-Architecture.pdf` was committed in `ddbcc9f`, then untracked
and git-ignored at the owner's direction. `docs/PRD.md` is the only canonical spec — do not consult
the PDF if a copy exists on disk.

**Restructure 3** (2026-11-03, `chore/four-folders`, [ADR 0004](ARCHITECTURE.md#adr-0004--four-top-level-folders-four-documents)).
Every commit passed `npm run verify`, matched the route table and the segment config, and reported
client JS (+0 bytes on every route) and CSS (byte-identical).

| Stage | Commits | What it did |
|---|---|---|
| **S1** moves | `69304f8`..`8461fce` | `shared/` and `scripts/` into `backend/` (70 imports to `@/backend/shared/*`); `check-boundaries.mjs` replaces the move map, with A1's entry points and A2 for every page (BL-032); the lint rules and the jest setup folded into their configs; the CODEMAP, the move map and their scripts deleted; the Next.js app into `frontend/`, with Next and Jest run there; the Turbopack and tracing roots stated; `agentRules: false` |
| **S2** env and clutter | `4d5964b`..`66a2a74` | `frontend/.env.example`; `frontend/.env.test` and its guard tests, before the owner moved `.env.local` to `frontend/.env`; CI reads the Node version from `package.json`; `.node-version` deleted; `.claude/settings.json` denies Read and Edit on the env files |
| **S3** docs | `44f1e5c`..this file | Thirteen Markdown files merged into four; `check:docs` in `verify`; the doc paths in code comments |

### 5. Architecture

The flows, the layout, the rules and each folder's responsibilities are in
[the system design](ARCHITECTURE.md#system-design); the tree is in [the README](README.md#folder-structure).

**Authorisation is still the one choke point:** `proxy.ts`, matcher `/admin/*` and
`/api/admin/*`. No route handler does its own auth check, so a route outside the matcher is public.

#### Files over 500 lines

| File | LOC | Statements covered |
|---|--:|--:|
| `frontend/views/article/ArticleDetailView.tsx` | 970 | tested (F-005, F-013, F-017) |
| `frontend/features/admin/ArticlesTable.tsx` | 751 | 0% |
| `backend/repositories/db.ts` | 678 | 71.8% |
| `backend/services/scrape/scrapeArticle.ts` | 580 | 87.1% |
| `frontend/features/news/Header.tsx` | 568 | stubbed in tests |
| `frontend/views/home/HomeClient.tsx` | 561 | tested (F-021, BL-027) |
| `frontend/views/admin/AdminView.tsx` | 521 | tested (F-014) |

Per-file coverage: `npm run test:ci` writes it to `coverage/`.

---

### 6. Structural work — where it stands

| Work | Status |
|---|---|
| Restructure 1: Phases 0, 1, A, C, D, E | ✅ Done (ADR 0001, superseded) |
| Restructure 2: S0 design, S1 cleanup, S2 tooling, S3 moves, S4 enforcement, S5 docs | ✅ Done (ADR 0002, accepted) |
| Restructure 3: four folders, four documents, `frontend/.env` (S0–S3) | ✅ Done on `chore/four-folders` (ADR 0004, accepted) |
| **Phase F** — decompose the oversized files; move route-body logic into services | Optional, not started; needs an owner decision |

#### Phase F candidates

Decomposing any of the files above edits a module body, so each needs a characterization test of
what it splits. The audit phases added most of them: `ArticleDetailView` (links, the AI panel, the
story area), `HomeClient` (the feed's fetches and search), `AdminView` (sync and purge),
`scrapeArticle` and `db.ts` (through their route and repository tests). Still untested:
`ArticlesTable.tsx`, whose two modals already sit at module scope and can move to their own files as
a pure move, and `Header.tsx`.

---

### 7. Known defects — current behaviour that is NOT intended

Numbered to match `docs/PRD.md` §11, which now carries a Status column. Of DEF-01..25, all but six
are resolved:

| ID | What remains | Status |
|---|---|---|
| DEF-01 | Supabase reachable again and no longer silent; `/api/health` 200 and a Sentry fallback event in production | Pending verification (F-002) |
| DEF-07 | `breaking_news` and `admin_logs` DDL in `database/schema.sql`; the owner applies it | Pending verification (F-008) |
| DEF-12 | Search escaping fixed; the injection probe against the live database | Pending verification (F-006) |
| DEF-18 | The index migration; the owner applies it | Pending verification (F-018) |
| DEF-23 | The Vercel project's Node version | Pending verification (F-026) |
| DEF-25 | `dark:` classes right before paint; 75 `isDark` ternaries still switch after hydration | Partial (F-028, BL-028) |

**`npm audit`:** 0 critical, 0 high. 34 moderate in dev and build tooling, published after Phase 1 (BL-031), and the 3 accepted jest lows.

---

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
  BL-031 (the new moderate advisories), BL-035 (docs statements stale before restructure 3),
  BL-036 (runtime messages that still say `.env.local`).

**Resolved:** BL-003, BL-010, BL-011, BL-012, BL-013, BL-014, BL-015, BL-017, BL-018, BL-020, BL-021,
BL-027, BL-029, BL-032.

### 12. Quick reference

#### Useful probes

```bash
# which tier answered
curl -s -D - -o /dev/null "http://localhost:3000/api/news/top-headlines?refresh=true" | grep -i x-data-source

# real runtime errors
tail -40 frontend/.next/dev/logs/next-development.log

# route table drift vs the baseline: backend/scripts/baseline-routes.txt is the BUILT URL table
# (f/o + path), so compare the "Route (app)" block of `next build` output, not a file list
git ls-files 'frontend/app/**/page.tsx' 'frontend/app/**/route.ts' | sort

# the boundary rules, with the rule ID in every message
npm run lint && npm run check:boundaries

# confirm framework behaviour instead of guessing
node -e "const pm=require('next/dist/compiled/picomatch'); console.log(pm.makeRe('{,*.}newsdata.io').test('i.newsdata.io'))"
```

#### Test suite

32 files, 388 tests, all passing at the audit close-out (today's numbers are in
[Baselines](#baselines)). Every security module has tests: `urlValidation` (73),
`fetchPage` (real axios against a local server), `adminSession`, the login and scrape routes, the
rate limiter (memory and Redis), the size-capped body reader, and the search escaping. Repo-reading
tests keep the SQL in step with the code (`backend/repositories/schema.test.ts`, including the
runbook's rollback), and `frontend/.env.example` in step with `process.env`
(`backend/shared/config/envExample.test.ts`), which also holds the `.env.test` guards. Untested: `proxy.ts` (0%), `ArticlesTable.tsx` and `Header.tsx`.

## Backlog

Debt deliberately deferred rather than fixed in place, with the reason it was
deferred and the phase that should pick it up. Added to when a rule in the
restructure plan ("no while-I-am-here fixes") stops a fix from happening in the
commit that found it.

---

### BL-001 — `db.ts` row mapping relies on `any` to hide unhandled nulls

**Found:** Phase 0b (lint baseline)
**Files:** `backend/repositories/db.ts` — the two `.map()` calls in `saveArticlesToDB` and `getDBArticles`
**Status:** Open · two `eslint-disable-next-line @typescript-eslint/no-explicit-any` in place

`database/schema.sql` declares `link`, `pub_date`, `description`, `content`,
`image_url`, `source_id`, `source_name`, `category`, `country` and `language` as
nullable. `Article` (in `shared/types/index.ts`) declares `link: string` and
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
**Files:** `frontend/views/saved/SavedView.tsx:21`, `frontend/features/news/ArticleCard.tsx:83` (the two warnings `npm run lint` reports)
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
less the one-line `app/` shims) and is correspondingly, accurately, much lower.

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
**Files:** `backend/api/admin/publish-article.ts`
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
every local change that moves or deletes a route under `app/` will hit it. Every restructure-2 slice
that touched `app/` did, and cleared `.next/types` first.

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
**Files:** `frontend/views/privacy/PrivacyView.tsx` (`app/privacy/page.tsx` re-exports it)

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
  removed from `src/components/Footer.tsx` at the owner's direction (Phase C
  review). It had pointed at `href="#"` and advertised a deleted feature.
- ~~**Dead translation keys**~~ — **resolved** in `a81d3c4` (restructure 2, S1, owner item
  B8): the six listed here (`rssFeeds`, `newsletterTitle`, `newsletterDesc`,
  `newsletterStripTagline`, `subscribedSuccess`, `newsletterEmailPlaceholder`)
  plus `subscribe`, which this list missed, removed from the interface and both
  languages. Sixteen more unread keys are BL-017.
- **`"use client"` on the contact page (`frontend/views/contact/ContactView.tsx`)** — no longer needed now the
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

### BL-015 — `urlValidation` goes to `backend/lib/` now, to `shared/validation/` with F-005

**Found:** restructure 2, S0 judgement call 3 (owner, at the S0 approval) · **Status:** **Resolved** in
`2cd04c9` (moved to `shared/validation/`, browser-safe; its DNS step is injected by
`backend/services/scrape/fetchPage.ts`), with F-005 as planned

Move map v2 put `urlValidation.ts` in `backend/lib/` because its only importer is the scraper,
`backend/api/news/scrape-article.ts`. The F-005 fix needs URL validation
on the frontend link sinks (`ArticleDetailView.tsx`'s `href={targetUrl}`); the module moves to
`shared/validation/` then (owner decision).

One constraint for that move: `validateExternalUrl()` imports Node's `dns/promises` and `net` — it
resolves the hostname so it can reject private addresses (the SSRF guard) — and neither runs in the
browser. The checks that need no DNS (URL parsing, the http(s) allowlist, `localhost`) can move to
`shared/`; the resolution step stays server-side. So F-005 splits the module rather than moving it
whole.

### BL-016 — The article page fetches its own API over HTTP

**Found:** restructure 2, S0 (the F1 list) · **Status:** **Resolved for the scrape** in `65d3337`
(owner, Phase 2 follow-up, to fix BL-021): the page calls `scrapeArticle`
(`backend/services/scrape/scrapeArticle.ts`) directly. **Still over HTTP:** the suggestions fetch
of `/api/news/top-headlines`, which has no per-IP limit and was not part of the fix. Re-checked
after Phase 3 (owner): neither the handler nor `proxy.ts` (matcher: admin paths only) limits that
route, so it has no shared bucket like BL-021's. **If a per-IP limit is ever added to
`top-headlines`, move this fetch to a direct call first**, or every reader shares the server's
bucket. The fetch also reads `NEXT_PUBLIC_BASE_URL`, not the `NEXT_PUBLIC_APP_URL` the rest of the
page uses

`app/article/[slug]/page.tsx` is a server component, yet it reaches the scraper and the feed
over HTTP to its own deployment: `getArticleContent()` fetches `/api/news/scrape-article`
(`:38–42`, `revalidate: 3600`) and `getSuggestedArticles()` fetches `/api/news/top-headlines`
(`:58–62`, `revalidate: 900`), both at `NEXT_PUBLIC_BASE_URL`, falling back to
`http://localhost:3000`. Every uncached render costs two extra round trips. If the variable is
wrong or unset in an environment, both fetches fail and the page silently shows its placeholder
text and no suggestions.

Calling the backend code directly would remove the hop, but it also changes which caching and error
handling apply — and, once F-011 gives the scraper a limiter, which rate limit applies. That makes
it a behaviour change, not a move, so restructure 2 keeps the page as composition in `app/` and
leaves both fetches alone.

### BL-017 — Data nothing reads, left after the S1 cleanup

**Found:** restructure 2, S1 (`dc07a40`, `a81d3c4`) · **Status:** **Resolved** in `dbc4821` (the 16
keys), `6327110` (the two fields) and `c2ab97a` (the last key, `refresh`), owner-approved after a
dynamic-access check

- **Sixteen translation keys** in `src/config/translations.ts` have no reader, in the interface
  and in both languages: `liveFeed`, `edition`, `globalNewsHub`, `aiAssistant`,
  `storiesAvailable`, `trendingHighlights`; `footer.verifiedSources`, `footer.realtimeCaching`,
  `footer.newsCategories`, `footer.emailPlaceholder`; `articleView.backToHeadlines`,
  `originalSource`, `specialReport`, `verifiedDigest`, `visitPublisher`, `suggestedNews`. Same
  test as `a81d3c4`: no `.key` or `["key"]` access anywhere in `src/`, and the only dynamic
  indexing is `t.categories[...]`. Removing them shrinks the client JS of every page that loads
  the dictionary, as `a81d3c4` did (−962 bytes for seven keys).
- **The `bg` and `text` fields of `CATEGORY_COLORS`** (`src/config/categoryColors.ts`): unread
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

**Outside the approved list, so still scanned:** the code (`app/`, `frontend/`, `backend/`, `shared/`), comments and tests included,
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
  `shared/config/imageDomains.ts:34`. So `isAllowedImageUrl` handed the URL to `<Image>`, and
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
(`shared/config/topicImages.ts:75`). It still returned 404 when re-checked in S4. The other 44 of
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
(`app/article/[slug]/page.tsx:38–42`, BL-016). That request carries no reader IP, so every
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
(`backend/api/news/scrape-article.ts:537`). So a public GET writes to the database, and the row it
updates is chosen by the caller's `url` parameter. The value written is what the server scraped
from that very URL, so a caller can only make a stored article's content match its own link. Still
worth deciding: a local run writes to whatever project `.env.local` names, which may be production
(HANDOFF §3.18), and a public endpoint that writes is one more thing to rate-limit and audit. The
feed does return `content` with each row (`backend/repositories/db.ts:429`), so check its readers
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

`backend/lib/supabase.ts` uses `SUPABASE_SERVICE_ROLE_KEY` when set and falls back to
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `isSupabaseConfigured()` is true with the anon key alone. With
RLS on, the anon key can only read `articles` and `breaking_news`. The cron's ingest and purge,
every admin write and the audit log all fail. Where anon still holds Supabase's default table
grants, some of these fail silently (0 rows, no error) instead of as `permission denied`.
The table of every access is in `docs/runbooks/apply-database.md`.

No policy change fixes this, because the anon key is public by design. Options: fail loudly (a
startup or health warning when only the anon key is set, or report the writes as unavailable), or
keep it and rely on the runbook's pre-check that the key is set. Not changed: no audit finding
covers it.

### BL-026 — Headline translation

**Found:** audit F-024 · **Status:** Open — feature, not a defect (owner decision D3)

`translateHeadline(text, lang)` in `shared/config/translations.ts` returned `text` unchanged. It
ran on every card title and description (`ArticleCard`) and on the mega-menu titles
(`CategoryMegaMenu`), so it looked like translation without doing any. F-024 removed it. Cards
and the mega menu show each article in the language its publisher wrote it in; the Hindi feed is
already chosen by script (`matchesLanguageScript` in `backend/repositories/db.ts`).

The only real translation is on the article page: `ArticleDetailView` translates the article's
title, description and paragraphs through `/api/translate` when the UI is in Hindi, cached per
title. Translating headlines in the feed would need the same: a batched `/api/translate` call per
feed load (the route allows 50 texts and 10,000 characters per request, F-010) and a cache, or
translated titles stored at ingest. Either costs translate-API quota on every new story.

### BL-027 — The first search result is never shown

**Found:** audit Phase 4, writing the F-021 characterization (`675ce1d`) · **Status:** **Resolved** in `96f192d`
(owner: fix now; while searching the grids start at index 0)

In `frontend/views/home/HomeClient.tsx` the featured slot shows `articles[0]` only when no search is
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

`backend/api/admin/seed-supabase.ts:15` reads `NEWSDATA_API_KEY || NEXT_PUBLIC_NEWSDATA_API_KEY`.
It runs on the server, so nothing leaks today. But the fallback invites putting a secret under a
`NEXT_PUBLIC_` name, and Next inlines such a name into any client bundle that reads it. F-009 lists
it in `.env.local.example` as "do not set it". Removing the fallback is a one-line change; it breaks
the seed route only for an environment that sets the public name alone.

### BL-030 — The chatbot ships on every route

**Found:** audit Phase 4, F-027 (`7ead49b`) · **Status:** Open — proposal, not started (owner)

`app/layout.tsx` renders `FloatingAiAssistant` (`frontend/features/chat`), which imports
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

**Found:** audit master prompt, Phase 5 · **Status:** Resolved in restructure 3 (`2af4339`): A2 covers
every route and every page but the composition pages, read from disk (`backend/scripts/shims.mjs`)

A2 (`eslint.boundaries.mjs`, `boundaries/shim-only`) holds two kinds of file to re-exports and
literal segment config: every `app/**/route.ts`, and the pages whose bodies moved to
`frontend/views/` in restructure 2. Those pages are `SHIMS` in `scripts/move-map.mjs`, derived from
the move map. A `page.tsx` added later is in no move map, so A2 never sees it. Its logic can then grow
in `app/`, which is the routing shell. Proposal: apply A2 to every `app/**/page.tsx`, with the two
composition pages allowlisted by name (`app/page.tsx` and `app/article/[slug]/page.tsx`, which
combine backend data with a view, ADR 0002). `check:boundaries` and the jest coverage exclusion read
the same list, so change all three together, and prove the rule with a probe page.

### BL-033 — The 7-day purge deletes what Rule 19 says to keep for 60 days

**Found:** panel work, Step 1 report (2026-11-02), point 7 · **Status:** Open — decided in Panel 4/7

The reader feed keeps a 7-day rolling window. `purgeOldArticles` (`backend/repositories/db.ts`)
deletes every article whose `created_at` is older than 7 days, once per cron run
(`backend/api/cron/refresh-news.ts`) and when the admin presses purge (`backend/api/admin/db-stats.ts`).
`docs/PANEL_PLAN.md` reads IT Rules Rule 19 as requiring content records for at least 60 days, and asks
for a 60-day purge floor. Today nothing of a purged article survives, so the two conflict.

Proposed direction (owner, 2026-11-02): the feed keeps its 7-day window. A separate `content_records`
table keeps a light record of every published item (title, link, source, published and unpublished
times, actor) for at least 60 days, and the purge floor applies to the records, not to the feed.
Not built now: the table, its writer and the floor belong to Panel 4 (Ingestion) or Panel 7
(Compliance), whichever comes first.

### BL-034 — Export the audit chain's head hash outside the database

**Found:** owner, Panel 0 design approval (2026-11-02) · **Status:** Open — after Panel 0

`audit_log` chains each row to the one before it (`prev_hash`, `row_hash`; design
[`panel-0-access-foundation.md`](PANEL_DOCS.md#panel-0-design-the-access-foundation-approved-2026-11-02) §1), and
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

### BL-036 — Runtime messages still tell the reader to set `.env.local`

**Found:** restructure 3, S3 (2026-11-03) · **Status:** Open — needs owner approval (changes app output)

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

## Audit ledger

The audit (28 findings, F-001..F-028) was run at commit `0e7f1f7`, **before** both restructures, so
its own paths and line numbers are stale. Every location below is at today's paths. They were first
verified against the repo at `4cf5be6` (2026-10-30) and updated through Phase 1 at `679c72e`. Then,
after restructure 2, they were moved to the new layout and re-verified at `51bafd5` (2026-10-30).
Each cited line was re-located by its content at `679c72e`, with its surrounding lines as context,
not by adding offsets, and every claim without a line number was re-checked. Locate code by
searching the repository (`CODEMAP.md`, the generated module map, was retired in restructure 3),
not through the audit.

**Status.** *Resolved* — fixed, with the commit. *Pending verification* — fixed in code; a check
that cannot run on this machine remains, and is named. *Partial* — part fixed, the rest named.
*Open* — not started. This file is updated as each finding is fixed; one finding per commit, prefixed with
its ID. Closed out in audit Phase 5 (2026-11-02): no finding is Open. What "Pending verification" needs is
listed in [HANDOFF.md](OPERATIONS.md#current-status) §11, the deployment list.

### Summary

| Status | Count | Findings |
|---|--:|---|
| Resolved | 22 | F-001, F-003, F-004, F-005, F-007, F-009, F-010, F-011, F-012, F-013, F-014, F-015, F-016, F-017, F-019, F-020, F-021, F-022, F-023, F-024, F-025, F-027 |
| Pending verification | 5 | F-002 (production check), F-006 (live probe), F-008 and F-018 (SQL not yet applied), F-026 (Vercel setting) |
| Partial | 1 | F-028 (`isDark` ternaries, BL-028) |
| Deferred | 0 | — |
| Open | 0 | — |

### Ledger

| ID | Sev | Finding | Status | Evidence / current location | DEF |
|---|---|---|---|---|---|
| F-001 | Crit | Next.js 16.3.0 advisories, incl. 4 critical unauthenticated RCE | **Resolved** | `47e62ae`: `next` and `eslint-config-next` 16.4.3, the current latest. Four of the 13 advisories reached 16.4.0, so the 16.3.8 patch line was not enough. `npm audit` no longer lists `next`; route table identical; `next start` smoke test passed | DEF-11 |
| F-002 | Crit | Every Supabase call fails; app silently serves NewsData.io | **Pending verification** | **Connection:** working on 2026-10-30 with no code change — one real request returned HTTP 200, the app's own client path (service-role key) read 78 rows with the newest 13 min old, and the feed answered `X-Data-Source: supabase`, then `cache`. The earlier failure no longer reproduces, so its `err.cause` could not be captured. **Visibility:** `57fe578` adds `/api/health` (status only, 200/503) and `/api/admin/health` (detail, behind the session); `679c72e` reports each Supabase→NewsData fallback to Sentry, rate-limited (D5). **Needs:** in production, `/api/health` answering 200, and Sentry — with `NEXT_PUBLIC_SENTRY_DSN` set, which it is not locally — receiving a fallback event | DEF-01 |
| F-003 | **Crit** (audit: High) | Scraper follows up to 21 redirects, none revalidated | **Resolved** | `2e383cb`: the guard (`shared/validation/urlValidation.ts`) now judges IPv6 literals directly, the IPv4 embedded in mapped/compatible/NAT64/6to4 forms, Teredo, documentation, multicast and 240/4, and rejects credentials; it returns the addresses it validated. `1145bca`: `backend/services/scrape/fetchPage.ts` follows at most 5 redirects by hand (`maxRedirects: 0`), revalidating every hop, and pins each connection to its hop's validated addresses through axios's `lookup`, so DNS rebinding is closed, not documented; a refused hop is 400. Proven against the real axios with a local server, including a negative control. The article page no longer sends an unverified `url` to the scraper at all (`8d0b775`, F-005), which narrows this surface further | DEF-02 |
| F-004 | High | Admin login unthrottled; password compare leaks length | **Resolved** | `487eb47` (tests first), `7eb9253`: `verifyAdminPassword` (`backend/auth/adminSession.ts`) compares SHA-256 digests with `timingSafeEqual`, so no length check leaks; `POST /api/admin/login` allows 10 attempts per 15 minutes per IP (owner decision D1: Redis fixed window via `checkRateLimit`, in-memory fallback, logged), 429 with Retry-After. README's "compared in constant time" is now true (N-02). Production behaviour on Redis is a deployment check | DEF-06 |
| F-005 | High | Branded phishing sink: unvalidated `targetUrl`, attacker `og:url` | **Resolved** | `8d0b775` (owner decision: trust anchor = the stored articles). `app/article/[slug]/page.tsx` uses `?url=` only when `findKnownArticle` (`backend/services/news/knownArticle.ts`) finds it: an exact match on `articles.link` (read-only), or a built-in mock article. Otherwise the url is treated as absent: no publisher link, no scrape (no outbound request), no attacker title; `og:url` is always the page's own address. All four sinks in `frontend/views/article/ArticleDetailView.tsx` also require `safePublisherHref` (`shared/validation/urlValidation.ts`, moved there in `2cd04c9`). Probe: `https://evil.example.com/phish` renders no link and appears in no metadata or request. The app's own links match exactly (six shapes tested), so nothing is normalised. **Depends on** an index on `articles.link`, in the Phase 3 migration (F-018), not yet applied. **Trade-offs:** during a Supabase outage, or for an article past the 7-day window, the page shows no publisher link and no scraped text; signed links are the upgrade path if outage resilience is needed (BL-023) | DEF-03 |
| F-006 | High | PostgREST filter injection via search query | **Pending verification** | `4b33611`: the feed search (`searchFilter` in `backend/repositories/db.ts`) LIKE-escapes `\ % _`, drops `*`, and double-quotes the value, so `,` `.` `(` `)` cannot add PostgREST clauses; tested against crafted terms. `614e514` (owner: fix now): the admin article list uses the same escape (`containsPattern`, `backend/lib/likePattern.ts`). **Needs:** the injection probe re-run against the live database (never run locally: it may be production) | DEF-12 |
| F-007 | High | axios advisories (redirect SSRF, ReDoS) | **Resolved** | `56e7509`: axios 1.21.0 — 12 advisories, all fixed in 1.20.0, including "maxRedirects: 0 is not enforced by the fetch adapter", which F-003 relies on. The remaining advisories: `31f4a54` (@sentry/nextjs 10.78.0, tunnel-route bypass; `tunnelRoute` stays unset) and `5970692` (transitive, `npm audit fix` without `--force`) | DEF-13 |
| F-008 | High | `admin_logs` and `breaking_news` DDL only in code comments | **Pending verification** | `db28a46`: `database/schema.sql` creates all three tables `IF NOT EXISTS` and enables RLS; `database/policies.sql` drops and recreates every policy, idempotent, in one transaction; `backend/repositories/schema.test.ts` checks every column the code uses. Owner runbook `docs/runbooks/apply-database.md` (`069bb5b`, `48ac2a2`): order, verify queries, the key each access uses, a snapshot and a rollback per step. **Needs:** the owner applying the files. Nullability gaps: BL-024; the anon-key fallback: BL-025 | DEF-07 |
| F-009 | High | Documented env ≠ actual env | **Resolved** | `10c8b47`: `.env.local.example` lists exactly the 20 variables the code reads (found by grep), one line each; `ADMIN_SECRET_TOKEN` removed, `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` added; `shared/config/envExample.test.ts` keeps the two in step. `45223f0` (BL-029): the seed route no longer falls back to `NEXT_PUBLIC_NEWSDATA_API_KEY`. README (`ada0757`) was already right | DEF-14 |
| F-010 | High | No input size caps | **Resolved** | `58c7f7d`: request bodies are read through a byte-capped streaming reader (`backend/lib/readJsonBody.ts`): `/api/translate` 64 KB, 50 texts, 5,000 characters each and 10,000 in all; `/api/chat` 16 KB and a 2,000-character message, with the article context trimmed; scraped pages capped at 5 MB (`MAX_PAGE_BYTES`, `backend/services/scrape/fetchPage.ts`). Over a cap: 413 or 400 | DEF-15 |
| F-011 | High | Public scraper has no rate limit | **Resolved** | `3b63a37`: `/api/news/scrape-article` allows 30 uncached scrapes a minute per IP (owner decision D1: Redis fixed window, in-memory fallback), 429 with Retry-After; cached answers are never counted. `65d3337` (BL-016): the article page calls the scraper directly, so **the limit now applies only to external callers**, not to every reader through the server's own address (BL-021). `988c7fa`: the route scrapes only stored articles (the F-005 lookup), so it can no longer be used to fetch arbitrary sites; a refused URL costs no DNS lookup or fetch. Production behaviour on Redis is a deployment check | DEF-16 |
| F-012 | Med | Contact/newsletter forms send nothing | **Resolved** | `59b875d` removed all three forms. No `<form>` remains outside admin, search, chat and the AI panel. The leftover unused newsletter strings were removed in `a81d3c4` (restructure 2, S1) | DEF-09 |
| F-013 | **High** (audit: Med) | AI panel shows a canned "Key Takeaway" on failure | **Resolved** | `526fc07` (characterization), `86bdf78`: the article page's askTimesPrime panel shows "Sorry, that request failed: <reason>" (and Hindi) in an alert, as `Chatbot.tsx` does, instead of a made-up "Key Takeaway"; an empty answer says so instead of a canned insight | DEF-04 |
| F-014 | Med | Admin purge/sync show success from `catch`; `!res.ok` shows nothing | **Resolved** | `a093080` (characterization), `5997567`: sync and purge in `frontend/views/admin/AdminView.tsx` report success only on `res.ok`; an error status shows the server's message, a thrown request its reason, in a red alert | DEF-17 |
| F-015 | Med | `purgeOldArticles()` awaited on read and write paths | **Resolved** | `2f31bad`: the purge is off the feed's read path (`getDBArticles`) and the upsert path (`saveArticlesToDB`); it runs once per cron run (`backend/api/cron/refresh-news.ts`), whose response and audit entry carry the count. The admin's explicit purge action (`POST /api/admin/db-stats`) **stays, by owner decision**: the intent was "off the read path", and a deliberate admin action is fine | DEF-05 |
| F-016 | Med | Feed fetches 80, filters in JS, slices 40 | **Resolved** | `2e3fa0b`: `getDBArticles` reads pages of 80 newest-first until 40 rows pass the JS filters, the rows run out, or 5 pages are read; a later page's error serves what was found | DEF-08 |
| F-017 | Med | Scraper returns 200 with placeholder prose; UI string-matches | **Resolved** | `41c3ab0` (characterization), `b7f6fbc`: a failed scrape is 502 (504 on timeout) with `{ error }` (`ScrapeErrorResponse`, `shared/types`); nothing to extract is 200 with empty content; the view no longer matches placeholder wording, and the page passes it no content on any failure. Accepted by the owner: external callers of the public route now see 502/504, and the cache key is `scrape:v2:` | DEF-10 |
| F-018 | Med | 2 indexes for 7 filtered columns | **Pending verification** | `4898da4`: `database/migrations/2026-11-02-indexes.sql` adds GIN on `category` and `country`, `pg_trgm` trigram GIN on `title` and `description`, and a btree on `link` (the F-005 lookup and the public scrape route depend on it; not unique, for the `#` placeholder links). Idempotent; verify with the runbook's `EXPLAIN`. **Needs:** the owner applying it | DEF-18 |
| F-019 | Med | Lint fails; no CI | **Resolved** | `bc556da` (lint 19 errors → 0), `506a4ab` (CI). Lint today: 0 errors, 13 warnings. GitHub Actions run 41010981658 on `4cf5be6`: success; CI has stayed green since | — |
| F-020 | Med | Rate limiter keys never evicted | **Resolved** | `b44203d`: the in-memory limiter (`backend/lib/rateLimit.ts`) sweeps expired keys every minute and holds at most 10,000. `e29cf0d`: chat and translate 429s send Retry-After. The in-memory cache got the same eviction (`e5754b5`, BL-013, N-03) | DEF-19 |
| F-021 | Med | Feed fetch races; no AbortController | **Resolved** | `675ce1d` (characterization), `9ce42bc`: `fetchNews` in `frontend/views/home/HomeClient.tsx` aborts the previous request and applies a response only if no newer call started (sequence guard); the duplicate fetches on category change, Reset Category and URL sync are gone (owner accepted the effect change). Related: BL-027, the hidden first search result, fixed in `96f192d` | DEF-20 |
| F-022 | Low | Page title doubled | **Resolved** | `ef510f9`: the article page sets the bare title and the root layout's template adds the suffix once; `openGraph.title` keeps it. Rendered: "Monsoon arrives early \| TimesPrime News" | DEF-21 |
| F-023 | Low | Supabase SDK in client bundle | **Resolved** | `b01d528`; `GoTrueClient` in browser chunks 1 → 0. CODEMAP: 0 server-only modules in the client bundle; `server-only` guards since `e3753b3`, and on every backend module since `19d255c` | — |
| F-024 | Low | `translateHeadline()` ignores `lang` | **Resolved** | `3de9a1e` (owner decision D3): the `translateHeadline` no-op and its three call sites are gone; nothing renders differently. Headline translation is a feature: BL-026 | DEF-22 |
| F-025 | Low | Dead RSS subsystem | **Resolved** | `bcd5393` (code + 503 route, routes 27 → 26), `d3ba8fa` (footer link). Leftover: a historical comment in `shared/config/imageDomains.ts:14`; the unused `rssFeeds` string was removed in `a81d3c4` | — |
| F-026 | Low | `.node-version` 20 vs runtime 24 | **Pending verification** | `974b255` (D2): `.node-version` 24, `package.json` `engines` `24.x`, and CI follows `.node-version`; the local runtime is 24.19.0. CI on Node 24 has been green since (latest: run 41046741477 on `5f6b0cc`). **Needs:** the owner setting the Vercel project to 24. `@types/node` is `^24` since `0066f27` (BL-012, resolved) | DEF-23 |
| F-027 | Low | Chatbot has no dark mode | **Resolved** | `7ead49b`: `Chatbot.tsx` has dark variants from the app's palette; a test checks every light surface has one. The growth (418 B of class strings on every route) was accepted; the chatbot shipping on every route is BL-030 | DEF-24 |
| F-028 | Low | Theme flash on load | **Partial** | `5ad891a`: an inline script in `<head>` (`THEME_INIT_SCRIPT`, `shared/config/theme.ts`) sets the `dark` class and background before the first paint, so every `dark:` variant is right from the start; no CSP blocks it. **Remaining:** components that style with `isDark ?` ternaries (75 in 16 files) still switch after hydration, a visible flash for those elements: BL-028 (owner ruling) | DEF-25 |

### Contradictions between the audit and the PRD

Recorded rather than silently resolved, then ruled on by the owner (Phase 0 approval):

- **Severity of F-003.** The audit rates it High; PRD DEF-02 rates it **Critical**.
- **Severity of F-013.** The audit rates it Medium; PRD DEF-04 rates it **High**.

**Ruling: the higher rating governs priority.** F-003 is treated as Critical and F-013 as High. Both
ratings stay visible in the ledger's Sev column.

### New observations (not in the audit)

Found during triage. Not fixed; listed for the owner.

| ID | Observation | Where | Status |
|---|---|---|---|
| N-01 | Sentry's secret scrubber redacted only `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `NEWSDATA_API_KEY` | `shared/validation/sentryScrub.ts` | **Resolved** `f6c2016`: nine keys, found by grep, plus a test that fails if a new secret-named env var is read without being scrubbed |
| N-02 | README claims the admin password is "compared in constant time"; F-004 shows it is not yet | `README.md:102` | **Resolved** `7eb9253` (F-004): the comparison is now constant-time, so the claim is true |
| N-03 | The in-memory cache (used when Upstash is not configured, as locally) removes an expired entry only when it is read again, so keys that are never re-read — every distinct scraped URL, every search — accumulate. Same class as F-020 | `backend/lib/cache.ts` | **Resolved** `e5754b5` (BL-013): a sweep every minute and at most 1,000 entries |
| N-04 | During a Supabase outage, `db.ts` sends every failed operation to Sentry unthrottled: five events per feed request (freshness, purge, upsert, purge, select), observed in the D5 run. D5's single rate-limited report covers visibility; these are the noise | `backend/repositories/db.ts` | **Resolved** `cc1d479` (BL-014): at most one Sentry event per operation per 5-minute window, through the D5 limiter |
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
