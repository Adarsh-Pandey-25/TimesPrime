# Applying the database files

For the owner, at deployment. Nothing in the app or its tooling applies these files; this runbook
is the only way they reach a database. Every file is idempotent, so a step that fails halfway can be
run again. Every step has a rollback, which relies on the snapshot you take in step 0.

**Before you start**
- Confirm which Supabase project you are connected to. Local `.env.local` may point at the
  production project (HANDOFF §11); apply to the project you mean to change.
- Confirm that `SUPABASE_SERVICE_ROLE_KEY` is set in the deployment's environment variables. Check
  only that it is present; never copy its value anywhere. See [Which key the app uses](#which-key-the-app-uses-and-what-rls-does-to-it):
  without it, Row Level Security makes the app's writes fail.
- Take a backup, or confirm point-in-time recovery is on (Dashboard → Database → Backups).
- Open Dashboard → SQL Editor → New query. Paste each file whole, then Run.

## Which key the app uses, and what RLS does to it

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

## 0. Snapshot the current state

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

## 1. `database/schema.sql` — the tables

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

## 2. `database/policies.sql` — who may read and write

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

## 3. `database/migrations/2026-11-02-indexes.sql` — the indexes (F-018)

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

## 4. In the app, afterwards

- `/admin` → the activity log loads, and adding a breaking-news item shows it on the homepage banner.
- Open an article from the feed: the page shows "Read on publisher's site" with the publisher's link.
- `GET /api/health` answers 200 with `{"status":"ok"}`. A 503 (`degraded`) means a dependency is
  down; the result is cached for 60 seconds, so wait a minute before checking again.

## 5. The Panel 0 access files

Three more files, for staff accounts, roles and the audit log:
`database/migrations/2026-11-02-access-1-foundation.sql`, `2026-11-02-access-2-catalog.sql` and
`2026-11-02-access-3-freeze-admin-logs.sql`, plus `database/bootstrap/super-admin.sql`. They have
an order relative to the code deploy (migrations before it, the freeze after it), so they are not
listed here. Follow [`staff-access.md`](staff-access.md), which gives each step's check and undo.
Each file also carries its own verification queries and rollback.

From the Panel 0 deploy, the activity log reads `audit_log` (`admin_logs` is history), and an admin
change that cannot write its audit row is refused with 503.

If the activity log is empty or fails right after an admin action, the app may be on the anon
fallback; see
[Which key the app uses](#which-key-the-app-uses-and-what-rls-does-to-it). Roll back step 1 for
`admin_logs` and `breaking_news` (if their snapshot showed RLS off) until the key is set.
