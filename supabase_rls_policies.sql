-- TimesPrime — Row Level Security migration for public.articles
-- Run this in the Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run against the table created by supabase_schema.sql; idempotent (drops policies before recreating them).
--
-- What this does:
--   - Enables RLS on public.articles (currently disabled, so any anon-key holder can read/write/delete every row)
--   - Everyone (anon + authenticated) can SELECT — this is a public news feed
--   - Only service_role can INSERT / UPDATE / DELETE — that's the role the Next.js server uses
--     (src/lib/supabase.ts prefers SUPABASE_SERVICE_ROLE_KEY when present, which this app's .env.local sets,
--     so server-side writes are unaffected by this change)
--   - Table-level GRANTs are tightened to match: anon/authenticated get SELECT only

BEGIN;

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

COMMIT;

-- Verify afterwards with:
--   SELECT * FROM pg_policies WHERE tablename = 'articles';
--   SELECT has_table_privilege('anon', 'public.articles', 'INSERT');  -- should be false
