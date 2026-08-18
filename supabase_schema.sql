-- TimesPrime News Aggregator Supabase SQL Schema & Permissions Fix
-- Copy and paste this into your Supabase SQL Editor (https://supabase.com/dashboard -> Project -> SQL Editor -> New query -> Run)

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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for high-performance 7-day retention filtering
CREATE INDEX IF NOT EXISTS idx_articles_created_at ON public.articles (created_at);
CREATE INDEX IF NOT EXISTS idx_articles_article_id ON public.articles (article_id);

-- Row Level Security: public read, server-only (service_role) write.
-- See supabase_rls_policies.sql for the full policy set and rationale.
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON public.articles
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Service role insert" ON public.articles
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role update" ON public.articles
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role delete" ON public.articles
  FOR DELETE TO service_role USING (true);

GRANT SELECT ON public.articles TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.articles TO service_role, postgres;
