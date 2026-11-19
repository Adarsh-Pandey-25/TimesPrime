-- TimesPrime: Panel 1 (Administration), M3. The quarterly access review's record: a Super Admin
-- goes through every live assignment and completes the review, which keeps who did it, when, a
-- note, and a snapshot of every row reviewed with what was decided. Design: Panel 1's design in
-- docs/PANEL_DOCS.md, §6, as approved on 19 Nov 2026 (a review every 90 days).
--
-- The owner applies this in Dashboard -> SQL Editor (as postgres), after
-- 2026-11-19-admin-1-access-requests.sql. Steps and checks: docs/OPERATIONS.md, "Panel 1: applying
-- admin-2". Idempotent: the table and index are IF NOT EXISTS, the triggers are dropped before they
-- are created, and the grants are restated. Safe to re-run.
--
-- What it guarantees, in the database, whatever the app does:
--   - a review, once recorded, is never edited, deleted or truncated (append-only, like audit_log);
--   - readers and signed-in users cannot see reviews; the app may read and add them, nothing more.

BEGIN;

CREATE TABLE IF NOT EXISTS public.access_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  completed_by UUID NOT NULL REFERENCES public.staff_profiles (user_id),
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  note TEXT NULL CHECK (note IS NULL OR length(note) <= 2000),
  -- Every assignment reviewed (person, role, scope, expiry, flags) and the decision: keep, revoked, renewal asked.
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'array')
);

CREATE INDEX IF NOT EXISTS access_reviews_completed_at ON public.access_reviews (completed_at DESC);

-- Append-only: access-1's reject_change raises on any update, delete or truncate.
DROP TRIGGER IF EXISTS access_reviews_no_change ON public.access_reviews;
CREATE TRIGGER access_reviews_no_change
  BEFORE UPDATE OR DELETE ON public.access_reviews
  FOR EACH ROW EXECUTE FUNCTION public.reject_change();

DROP TRIGGER IF EXISTS access_reviews_no_truncate ON public.access_reviews;
CREATE TRIGGER access_reviews_no_truncate
  BEFORE TRUNCATE ON public.access_reviews
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_change();

ALTER TABLE public.access_reviews ENABLE ROW LEVEL SECURITY;

-- Supabase's default privileges grant everything on a new public table to anon, authenticated and
-- service_role (desk-6's lesson): start from nothing. The app reads reviews and adds them.
REVOKE ALL ON public.access_reviews FROM anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.access_reviews TO service_role;

COMMIT;

-- ---- Verify (one query; expect 1, false, false, true) ------------------------------------------
--   SELECT (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename = 'access_reviews') AS has_reviews,
--          has_table_privilege('authenticated', 'public.access_reviews', 'SELECT') AS users_read_reviews,
--          has_table_privilege('service_role', 'public.access_reviews', 'UPDATE') AS app_edits_reviews,
--          has_table_privilege('service_role', 'public.access_reviews', 'INSERT') AS app_adds_reviews;
--
-- ---- Rollback: before the first review ---------------------------------------------------------
--   BEGIN;
--   DROP TABLE IF EXISTS public.access_reviews;
--   COMMIT;
