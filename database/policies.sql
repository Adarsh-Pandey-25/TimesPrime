-- TimesPrime — Row Level Security policies and grants for every table
-- Run this in the Supabase Dashboard -> SQL Editor -> New query -> Run, after database/schema.sql.
-- Idempotent: each policy is dropped before it is created, so it is safe to re-run.
--
-- What this does:
--   - public.articles: everyone (anon + authenticated) can SELECT — this is a public news feed;
--     only service_role can INSERT / UPDATE / DELETE — that's the role the Next.js server uses
--     (backend/lib/supabase.ts prefers SUPABASE_SERVICE_ROLE_KEY when present, which this app's frontend/.env sets,
--     so server-side writes are unaffected by this change)
--   - public.breaking_news: public SELECT (the homepage banner reads it without a session, CR-08);
--     only service_role writes
--   - public.admin_logs: service_role only — no public access at all
--   - Table-level GRANTs are tightened to match: anon/authenticated get SELECT at most
--
-- The breaking_news and admin_logs policies lived only in code comments until F-008; they are
-- carried over unchanged, plus the same REVOKE as articles for defense in depth.

BEGIN;

-- ---- articles -------------------------------------------------------------

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON public.articles;
DROP POLICY IF EXISTS "Service role insert" ON public.articles;
DROP POLICY IF EXISTS "Service role update" ON public.articles;
DROP POLICY IF EXISTS "Service role delete" ON public.articles;

CREATE POLICY "Public read access"
  ON public.articles
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Service role insert"
  ON public.articles
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update"
  ON public.articles
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role delete"
  ON public.articles
  FOR DELETE
  TO service_role
  USING (true);

-- Defense in depth: even if a policy were misconfigured, anon/authenticated
-- shouldn't hold table-level write grants at all.
REVOKE INSERT, UPDATE, DELETE ON public.articles FROM anon, authenticated;
GRANT SELECT ON public.articles TO anon, authenticated;
GRANT ALL PRIVILEGES ON public.articles TO service_role, postgres;

-- ---- breaking_news --------------------------------------------------------

ALTER TABLE public.breaking_news ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON public.breaking_news;
DROP POLICY IF EXISTS "Service role full access" ON public.breaking_news;

CREATE POLICY "Public read access"
  ON public.breaking_news
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Service role full access"
  ON public.breaking_news
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE ON public.breaking_news FROM anon, authenticated;
GRANT SELECT ON public.breaking_news TO anon, authenticated;
GRANT ALL ON public.breaking_news TO service_role;

-- ---- admin_logs -----------------------------------------------------------

ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON public.admin_logs;

CREATE POLICY "Service role full access"
  ON public.admin_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.admin_logs FROM anon, authenticated;
GRANT ALL ON public.admin_logs TO service_role;

COMMIT;

-- Verify afterwards with:
--   SELECT tablename, policyname, cmd, roles FROM pg_policies
--     WHERE tablename IN ('articles', 'breaking_news', 'admin_logs') ORDER BY tablename, policyname;
--   SELECT has_table_privilege('anon', 'public.articles', 'INSERT');       -- should be false
--   SELECT has_table_privilege('anon', 'public.breaking_news', 'SELECT');  -- should be true
--   SELECT has_table_privilege('anon', 'public.admin_logs', 'SELECT');     -- should be false
