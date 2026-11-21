-- TimesPrime: Panel 7 (Compliance), M3. The monthly grievance report (Rule 18(3) of the IT Rules: a
-- periodic compliance report every month, on the grievances received and the action taken). The app
-- computes a month's figures; the Grievance Officer (or Legal) checks and publishes them, at
-- /grievance-report. Published figures never change: a reissue is a new version.
-- Design: Panel 7's design in docs/PANEL_DOCS.md, §2 and §5 (decision 7).
--
-- The owner applies this in Dashboard -> SQL Editor (as postgres), AFTER Panel 7's
-- 2026-11-20-compliance-1-grievances.sql and 2026-11-21-compliance-2-corrections.sql (the figures
-- read both). The catalogue does not change: grievance.report is in it since Panel 0. Steps, the
-- check and the rollback: docs/OPERATIONS.md, Runbooks.
-- Idempotent: the table is IF NOT EXISTS, functions are CREATE OR REPLACE, triggers and the policy
-- are dropped before they are created, and the grants are restated in full. Safe to re-run.
--
-- What it guarantees, in the database, whatever the app does:
--   - a published report is history: never changed, never deleted; a month published again is the
--     next version, and the first stays;
--   - only a month that has ended (in India) is published, and its figures are computed in the same
--     transaction, from the grievances received in it and the corrections published in it;
--   - the figures hold counts only: no name, email, text or ticket;
--   - readers (anon) see every report, without who published it.
--
-- The app reads and writes as service_role, which bypasses RLS. Its gate is requirePermission
-- (packages/server/src/auth); RLS here protects direct reads with the anon key.

BEGIN;

-- ---- grievance_reports ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.grievance_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The month's first day.
  month DATE NOT NULL CHECK (month = date_trunc('month', month)::date),
  version INTEGER NOT NULL CHECK (version >= 1),
  figures JSONB NOT NULL CHECK (jsonb_typeof(figures) = 'object'),
  note TEXT NULL CHECK (note IS NULL OR (length(trim(note)) > 0 AND char_length(note) <= 1000)),
  published_by UUID NOT NULL REFERENCES public.staff_profiles (user_id),
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT grievance_reports_month_version UNIQUE (month, version)
);

-- ---- history: never changed, never deleted (reject_change() is Panel 0's) --------------------------

DROP TRIGGER IF EXISTS grievance_reports_append_only ON public.grievance_reports;
CREATE TRIGGER grievance_reports_append_only
  BEFORE UPDATE OR DELETE ON public.grievance_reports
  FOR EACH ROW EXECUTE FUNCTION public.reject_change();

DROP TRIGGER IF EXISTS grievance_reports_no_truncate ON public.grievance_reports;
CREATE TRIGGER grievance_reports_no_truncate
  BEFORE TRUNCATE ON public.grievance_reports
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_change();

-- ---- a month's figures (design §5) ------------------------------------------------------------------
-- The month in India (IST). From the grievances received in it: how many, by category, language and
-- channel; of those, how many are decided (by outcome; within their 15 days or late; the median days
-- to decide) and how many are still open (and late), as of now. The corrections published in it, by
-- kind. Every key is present, zero or not. Counts only.

CREATE OR REPLACE FUNCTION public.grievance_month_figures(p_month DATE)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  WITH bounds AS (
    SELECT (date_trunc('month', p_month)::timestamp AT TIME ZONE 'Asia/Kolkata') AS starts,
           ((date_trunc('month', p_month) + interval '1 month')::timestamp AT TIME ZONE 'Asia/Kolkata') AS ends
  ),
  g AS (
    SELECT x.category, x.language, x.channel, x.state, x.outcome, x.received_at, x.decided_at, x.decide_due_at
      FROM public.grievances x, bounds b
     WHERE x.received_at >= b.starts AND x.received_at < b.ends
  ),
  c AS (
    SELECT y.kind
      FROM public.corrections y, bounds b
     WHERE y.published_at >= b.starts AND y.published_at < b.ends
  )
  SELECT jsonb_build_object(
    'month', to_char(date_trunc('month', p_month), 'YYYY-MM'),
    'as_of', now(),
    'received', jsonb_build_object(
      'total', (SELECT count(*) FROM g),
      'by_category', (SELECT jsonb_object_agg(k, (SELECT count(*) FROM g WHERE g.category = k))
                        FROM unnest(ARRAY['factual_error', 'defamation_privacy', 'obscene_harmful', 'copyright', 'other']) AS k),
      'by_language', (SELECT jsonb_object_agg(k, (SELECT count(*) FROM g WHERE g.language = k))
                        FROM unnest(ARRAY['en', 'hi']) AS k),
      'by_channel', (SELECT jsonb_object_agg(k, (SELECT count(*) FROM g WHERE g.channel = k))
                       FROM unnest(ARRAY['web', 'email', 'post', 'other']) AS k)
    ),
    'decided', jsonb_build_object(
      'total', (SELECT count(*) FROM g WHERE g.state = 'decided'),
      'by_outcome', (SELECT jsonb_object_agg(k, (SELECT count(*) FROM g WHERE g.outcome = k))
                       FROM unnest(ARRAY['upheld', 'partly_upheld', 'not_upheld', 'outside_scope', 'withdrawn', 'duplicate', 'spam']) AS k),
      'within_15_days', (SELECT count(*) FROM g WHERE g.state = 'decided' AND g.decided_at <= g.decide_due_at),
      'late', (SELECT count(*) FROM g WHERE g.state = 'decided' AND g.decided_at > g.decide_due_at),
      'median_days', (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM g.decided_at - g.received_at) / 86400))::numeric, 1)
                        FROM g WHERE g.state = 'decided')
    ),
    'open', jsonb_build_object(
      'total', (SELECT count(*) FROM g WHERE g.state = 'open'),
      'late', (SELECT count(*) FROM g WHERE g.state = 'open' AND g.decide_due_at <= now())
    ),
    'corrections', jsonb_build_object(
      'total', (SELECT count(*) FROM c),
      'by_kind', (SELECT jsonb_object_agg(k, (SELECT count(*) FROM c WHERE c.kind = k))
                    FROM unnest(ARRAY['correction', 'clarification', 'update', 'editors_note', 'retraction']) AS k)
    )
  );
$$;

-- Publishes a month's report: its figures, computed now, as the month's next version. Only a month
-- that has ended in India. One publication of a month at a time.
CREATE OR REPLACE FUNCTION public.grievance_report_publish(p_month DATE, p_actor UUID, p_note TEXT)
RETURNS public.grievance_reports
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_month DATE := date_trunc('month', p_month)::date;
  v_version INTEGER;
  r public.grievance_reports;
BEGIN
  IF v_month >= date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'grievance_report_publish: % has not ended yet', to_char(v_month, 'YYYY-MM') USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('grievance_report:' || v_month::text));
  SELECT coalesce(max(x.version), 0) + 1 INTO v_version FROM public.grievance_reports x WHERE x.month = v_month;
  INSERT INTO public.grievance_reports (month, version, figures, note, published_by)
  VALUES (v_month, v_version, public.grievance_month_figures(v_month), nullif(btrim(p_note), ''), p_actor)
  RETURNING * INTO r;
  RETURN r;
END;
$$;

-- ---- RLS, grants -----------------------------------------------------------------------------------

ALTER TABLE public.grievance_reports ENABLE ROW LEVEL SECURITY;

-- Supabase's default privileges grant everything on new public tables. Start from nothing.
REVOKE ALL ON public.grievance_reports FROM anon, authenticated, service_role;

-- The app (service_role): read and publish; never UPDATE or DELETE (the triggers refuse them too).
GRANT SELECT, INSERT ON public.grievance_reports TO service_role;

-- Readers: every report, without who published it.
GRANT SELECT (id, month, version, figures, note, published_at) ON public.grievance_reports TO anon, authenticated;

DROP POLICY IF EXISTS grievance_reports_public ON public.grievance_reports;
CREATE POLICY grievance_reports_public ON public.grievance_reports FOR SELECT TO anon, authenticated USING (true);

-- Functions: Supabase exposes public functions as RPC to anon and authenticated by default.
REVOKE ALL ON FUNCTION
  public.grievance_month_figures(DATE),
  public.grievance_report_publish(DATE, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.grievance_month_figures(DATE),
  public.grievance_report_publish(DATE, UUID, TEXT)
  TO service_role;

COMMIT;

-- ---- Verify (one query; expect true, false, true, false, false, true, 0) ---------------------------
--   SELECT (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'grievance_reports') AS rls_on,
--          has_table_privilege('service_role', 'public.grievance_reports', 'UPDATE') AS app_can_change,
--          has_column_privilege('anon', 'public.grievance_reports', 'figures', 'SELECT') AS readers_see_figures,
--          has_column_privilege('anon', 'public.grievance_reports', 'published_by', 'SELECT') AS readers_see_who,
--          has_function_privilege('anon', 'public.grievance_report_publish(date,uuid,text)', 'EXECUTE') AS readers_can_publish,
--          has_function_privilege('service_role', 'public.grievance_report_publish(date,uuid,text)', 'EXECUTE') AS app_can_publish,
--          (SELECT count(*) FROM public.grievance_reports) AS reports;
--
-- ---- Rollback: before the first report -------------------------------------------------------------
-- A published report is a public record. Once the first is published, the table is kept. Before
-- that, this undoes the file:
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.grievance_report_publish(DATE, UUID, TEXT), public.grievance_month_figures(DATE);
--   DROP TABLE IF EXISTS public.grievance_reports;
--   COMMIT;
-- Then confirm nothing is left:
--   SELECT to_regclass('public.grievance_reports') IS NULL AS table_gone;   -- true
