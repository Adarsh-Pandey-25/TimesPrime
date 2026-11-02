# Applying the database files

For the owner, at deployment. Nothing in the app or its tooling applies these files; this runbook
is the only way they reach a database. Every file is idempotent, so a step that fails halfway can be
run again.

**Before you start**
- Confirm which Supabase project you are connected to. Local `.env.local` may point at the
  production project (HANDOFF §11); apply to the project you mean to change.
- Take a backup, or confirm point-in-time recovery is on (Dashboard → Database → Backups).
- Open Dashboard → SQL Editor → New query. Paste each file whole, then Run.

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
WHERE relname IN ('articles', 'breaking_news', 'admin_logs');
```

Expected: 3 rows, every `relrowsecurity` = `true`.

## 2. `database/policies.sql` — who may read and write

Drops and recreates the policies on all three tables, and sets the table grants. `articles` and
`breaking_news` get public read access, `admin_logs` gets none, and only `service_role` writes.
Runs as one transaction: either all of it applies or none of it does.

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

## 4. In the app, afterwards

- `/admin` → the activity log loads, and adding a breaking-news item shows it on the homepage banner.
- Open an article from the feed: the page shows "Read on publisher's site" with the publisher's link.
- `GET /api/health` answers 200 with `{"status":"ok"}`. A 503 (`degraded`) means a dependency is
  down; the result is cached for 60 seconds, so wait a minute before checking again.
