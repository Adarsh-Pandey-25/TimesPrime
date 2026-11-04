-- TimesPrime News Aggregator — Supabase tables
-- Copy and paste this into your Supabase SQL Editor (https://supabase.com/dashboard -> Project -> SQL Editor -> New query -> Run),
-- then run database/policies.sql for the Row Level Security policies and grants.
--
-- Idempotent: every statement is IF NOT EXISTS or harmless to repeat, so it is safe to re-run
-- against a project that already has some or all of these tables. On an existing table,
-- CREATE TABLE IF NOT EXISTS changes nothing (it does not add columns or constraints).

CREATE TABLE IF NOT EXISTS public.articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  link TEXT,
  description TEXT,
  content TEXT,
  pub_date TEXT,
  image_url TEXT,
  source_id TEXT,
  source_name TEXT,
  category TEXT[],
  country TEXT[],
  language TEXT DEFAULT 'english',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  -- Which of this article's category[] tags an LLM (Haiku) determined the
  -- content does NOT genuinely relate to. NULL = not yet classified (or
  -- classification failed) — every read path treats that as "no mismatches",
  -- i.e. visible everywhere it's tagged (fail-open, never hides content on
  -- error). Empty array = classified, all tags fit. See categoryClassifier.ts.
  category_mismatches TEXT[] DEFAULT NULL
);

-- Index for high-performance 7-day retention filtering
CREATE INDEX IF NOT EXISTS idx_articles_created_at ON public.articles (created_at);
CREATE INDEX IF NOT EXISTS idx_articles_article_id ON public.articles (article_id);
-- Further indexes (the feed's filters, the article-link lookup): database/migrations/.

-- The homepage breaking-news banner. Written by the admin panel
-- (src/app/api/admin/breaking-news/route.ts); read publicly by its GET, which the
-- proxy leaves open for the banner (CR-08). Its DDL lived only in a comment
-- in that file until F-008.
CREATE TABLE IF NOT EXISTS public.breaking_news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- The admin activity log. Written by src/server/repositories/auditLog.ts, read
-- and cleared by src/app/api/admin/logs/route.ts; never public. Its DDL lived only
-- in a comment in logs.ts until F-008.
CREATE TABLE IF NOT EXISTS public.admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  details TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Row Level Security on every table; the policies and grants are in database/policies.sql.
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.breaking_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;
