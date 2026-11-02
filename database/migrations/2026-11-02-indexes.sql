-- TimesPrime — indexes for the queries the feed and the admin panel actually run (F-018)
-- Run in the Supabase Dashboard -> SQL Editor -> New query -> Run, after database/schema.sql.
-- Idempotent (IF NOT EXISTS throughout), safe to re-run. Not applied by any code.
--
-- Before this, public.articles had two indexes (created_at, article_id) for a table that the feed
-- filters on array containment and substring search, and that the article page now looks up by link.
--
-- Plain CREATE INDEX, not CONCURRENTLY: the SQL editor runs a script as one transaction, which
-- CONCURRENTLY refuses, and the table holds a 7-day window of articles (low thousands of rows), so
-- the brief write lock while each index builds is acceptable. For a much larger table, run each
-- statement on its own with CONCURRENTLY instead.

-- Array containment (category @> '{top}', country @> '{"india"}'): the feed's category filter, the
-- India feed's country/category OR, and the admin article list's category and country filters
-- (backend/repositories/db.ts applyArticleFilters; backend/api/admin/articles.ts). A btree cannot
-- serve @>; GIN can.
CREATE INDEX IF NOT EXISTS idx_articles_category_gin ON public.articles USING GIN (category);
CREATE INDEX IF NOT EXISTS idx_articles_country_gin ON public.articles USING GIN (country);

-- Substring search (ILIKE '%term%'): the feed search on title OR description (searchFilter in
-- backend/repositories/db.ts, F-006) and the admin search on title (backend/api/admin/articles.ts).
-- A leading % defeats a btree; trigram GIN indexes serve it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_articles_title_trgm ON public.articles USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_articles_description_trgm ON public.articles USING GIN (description gin_trgm_ops);

-- Exact match on link. The F-005 lookup (findArticleByLink in backend/repositories/db.ts) runs it on
-- every article page, and the public scrape route (backend/api/news/scrape-article.ts) runs it on
-- every request, to accept only stored articles; the scraper's background content update matches on
-- link too. Without this index each of those is a full table scan. A plain btree, not UNIQUE: rows
-- whose source had no link are stored as "#" (saveArticlesToDB), so duplicates can exist and a
-- UNIQUE index would fail to build.
CREATE INDEX IF NOT EXISTS idx_articles_link ON public.articles (link);

-- Verify afterwards with:
--   SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'articles' ORDER BY indexname;
--   EXPLAIN SELECT title, link FROM public.articles WHERE link = 'https://example.com/x';  -- Index Scan using idx_articles_link
--   EXPLAIN SELECT id FROM public.articles WHERE category @> '{top}';                      -- Bitmap Index Scan on idx_articles_category_gin
--   EXPLAIN SELECT id FROM public.articles WHERE title ILIKE '%budget%';                   -- Bitmap Index Scan on idx_articles_title_trgm
-- (On a very small table the planner may still choose a sequential scan; that is expected.)
