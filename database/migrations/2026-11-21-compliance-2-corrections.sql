-- TimesPrime: Panel 7 (Compliance), M2. The corrections log: every public correction of a Desk story,
-- with its kind, kept for good, shown under its story and on /corrections, and linked to the
-- grievance that caused it. Design: Panel 7's design in docs/PANEL_DOCS.md, §2 and §4 (decision 6).
--
-- The owner applies this in Dashboard -> SQL Editor (as postgres), AFTER Panel 2's
-- 2026-11-17-desk-1-stories.sql and desk-3-corrections.sql, and Panel 7's
-- 2026-11-20-compliance-1-grievances.sql (public.grievances). The catalogue does not change. Steps,
-- the check and the rollback: docs/OPERATIONS.md, Runbooks.
-- Idempotent: the table and indexes are IF NOT EXISTS, functions are CREATE OR REPLACE, triggers are
-- dropped before they are created, the copy of earlier corrections skips what it already copied, and
-- the grants are restated in full. Safe to re-run.
--
-- What it guarantees, in the database, whatever the app does:
--   - a correction is history: never changed, never deleted; a wrong one is followed by another;
--   - each correction is one row of the story's history (workflow_transitions, action 'correct'),
--     made in the same transaction, and only on a live story; stories.correction_note still holds
--     the latest text, so nothing that reads it breaks;
--   - a correction a Sub-editor asked for names who asked, and was published by someone else;
--   - every correction already published before this file is copied in, with the kind 'correction';
--   - readers (anon) read the log only through corrections_log, which gives a story's headline and
--     address only while the story is live, and never who wrote or approved a correction.
--
-- The app reads and writes as service_role, which bypasses RLS. Its gate is requirePermission
-- (packages/server/src/auth); RLS here protects direct reads with the anon key.

BEGIN;

-- ---- corrections ----------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.stories (id),
  language TEXT NOT NULL CHECK (language IN ('en', 'hi')),
  kind TEXT NOT NULL CHECK (kind IN ('correction', 'clarification', 'update', 'editors_note', 'retraction')),
  text TEXT NOT NULL CHECK (length(trim(text)) > 0 AND char_length(text) <= 600),
  -- The story's live headline when it was made, for the record and the back office.
  headline TEXT NULL,
  revision_id UUID NULL REFERENCES public.story_revisions (id),
  grievance_id UUID NULL REFERENCES public.grievances (id),
  transition_id BIGINT NOT NULL UNIQUE REFERENCES public.workflow_transitions (id),
  published_by UUID NOT NULL REFERENCES public.staff_profiles (user_id),
  requested_by UUID NULL REFERENCES public.staff_profiles (user_id),
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT corrections_two_people CHECK (requested_by IS NULL OR requested_by <> published_by)
);

CREATE INDEX IF NOT EXISTS corrections_published ON public.corrections (published_at DESC);
CREATE INDEX IF NOT EXISTS corrections_story ON public.corrections (story_id, published_at);
CREATE INDEX IF NOT EXISTS corrections_grievance ON public.corrections (grievance_id) WHERE grievance_id IS NOT NULL;

-- ---- history: never changed, never deleted (reject_change() is Panel 0's) --------------------------

DROP TRIGGER IF EXISTS corrections_append_only ON public.corrections;
CREATE TRIGGER corrections_append_only
  BEFORE UPDATE OR DELETE ON public.corrections
  FOR EACH ROW EXECUTE FUNCTION public.reject_change();

DROP TRIGGER IF EXISTS corrections_no_truncate ON public.corrections;
CREATE TRIGGER corrections_no_truncate
  BEFORE TRUNCATE ON public.corrections
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_change();

-- ---- the corrections already published (decision 6): copied in, once -----------------------------

INSERT INTO public.corrections (story_id, language, kind, text, headline, revision_id, transition_id, published_by, published_at)
SELECT t.story_id, s.language, 'correction', btrim(t.reason), r.headline, t.revision_id, t.id, t.actor_id, t.at
  FROM public.workflow_transitions t
  JOIN public.stories s ON s.id = t.story_id
  LEFT JOIN public.story_revisions r ON r.id = t.revision_id
 WHERE t.action = 'correct' AND t.actor_id IS NOT NULL
   AND length(btrim(coalesce(t.reason, ''))) > 0 AND char_length(btrim(t.reason)) <= 600
ON CONFLICT (transition_id) DO NOTHING;

-- ---- the Desk's two ways to correct, each one transaction -----------------------------------------
-- The app decides who may act (correction.publish in the story's desk) and checks the text, the kind
-- and the grievance first; these make each correction atomic and refuse a story that is not live.

-- A correction published at once (S or F): the story's note, its history row, and the log's row.
CREATE OR REPLACE FUNCTION public.desk_correct(
  p_story UUID, p_actor UUID, p_actor_label TEXT, p_kind TEXT, p_text TEXT, p_grievance UUID
)
RETURNS public.corrections
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  s public.stories;
  c public.corrections;
  v_text TEXT := btrim(p_text);
  v_transition BIGINT;
  v_headline TEXT;
BEGIN
  UPDATE public.stories SET correction_note = v_text, updated_at = now()
   WHERE id = p_story AND workflow_state = 'published'
  RETURNING * INTO s;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'desk_correct: story % is not published', p_story USING ERRCODE = 'serialization_failure';
  END IF;
  INSERT INTO public.workflow_transitions (story_id, action, from_state, to_state, actor_id, actor_label, revision_id, reason)
  VALUES (p_story, 'correct', 'published', 'published', p_actor, p_actor_label, s.published_revision_id, v_text)
  RETURNING id INTO v_transition;
  SELECT r.headline INTO v_headline FROM public.story_revisions r WHERE r.id = s.published_revision_id;
  INSERT INTO public.corrections (story_id, language, kind, text, headline, revision_id, grievance_id, transition_id, published_by)
  VALUES (p_story, s.language, p_kind, v_text, v_headline, s.published_revision_id, p_grievance, v_transition, p_actor)
  RETURNING * INTO c;
  RETURN c;
END;
$$;

-- desk-3's function, with the correction's kind and grievance from the request's payload and the
-- log's row. The restore branch is unchanged.
CREATE OR REPLACE FUNCTION public.desk_decide_pending(
  p_action UUID, p_decider UUID, p_decider_label TEXT, p_outcome TEXT, p_reason TEXT
)
RETURNS public.stories
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  a public.pending_actions;
  s public.stories;
  v_note TEXT;
  v_kind TEXT;
  v_grievance UUID;
  v_transition BIGINT;
  v_headline TEXT;
BEGIN
  IF p_outcome NOT IN ('approved', 'declined') THEN
    RAISE EXCEPTION 'desk: a decision is approved or declined, not %', p_outcome USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO a FROM public.pending_actions WHERE id = p_action FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'desk: request % not found', p_action USING ERRCODE = 'no_data_found';
  END IF;
  IF a.decided_at IS NOT NULL THEN
    RAISE EXCEPTION 'desk: request % is already decided', p_action USING ERRCODE = 'serialization_failure';
  END IF;
  IF a.requested_by = p_decider THEN
    RAISE EXCEPTION 'desk: the person who asked cannot decide' USING ERRCODE = 'check_violation';
  END IF;
  IF a.action NOT IN ('restore', 'correction') THEN
    RAISE EXCEPTION 'desk: % requests are not decided here', a.action USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.pending_actions
     SET decided_by = p_decider, decided_at = now(), outcome = p_outcome
   WHERE id = p_action;

  IF p_outcome = 'approved' AND a.action = 'restore' THEN
    UPDATE public.stories
       SET workflow_state = 'published', published_by = p_decider, published_at = now(), updated_at = now()
     WHERE id = a.story_id AND workflow_state = 'unpublished' AND published_revision_id IS NOT NULL
    RETURNING * INTO s;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'desk: story % is not unpublished any more', a.story_id USING ERRCODE = 'serialization_failure';
    END IF;
    INSERT INTO public.workflow_transitions (story_id, action, from_state, to_state, actor_id, actor_label, revision_id, reason)
    VALUES (a.story_id, 'restore', 'unpublished', 'published', p_decider, p_decider_label, s.published_revision_id,
            coalesce(p_reason, a.reason));
  ELSIF p_outcome = 'approved' AND a.action = 'correction' THEN
    v_note := btrim(a.payload ->> 'note');
    IF v_note IS NULL OR v_note = '' THEN
      RAISE EXCEPTION 'desk: correction request % has no note', p_action USING ERRCODE = 'check_violation';
    END IF;
    v_kind := coalesce(a.payload ->> 'kind', 'correction');
    v_grievance := nullif(a.payload ->> 'grievance_id', '')::uuid;
    UPDATE public.stories
       SET correction_note = v_note, updated_at = now()
     WHERE id = a.story_id AND workflow_state = 'published'
    RETURNING * INTO s;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'desk: story % is not published any more', a.story_id USING ERRCODE = 'serialization_failure';
    END IF;
    INSERT INTO public.workflow_transitions (story_id, action, from_state, to_state, actor_id, actor_label, revision_id, reason)
    VALUES (a.story_id, 'correct', 'published', 'published', p_decider, p_decider_label, s.published_revision_id, v_note)
    RETURNING id INTO v_transition;
    SELECT r.headline INTO v_headline FROM public.story_revisions r WHERE r.id = s.published_revision_id;
    INSERT INTO public.corrections (story_id, language, kind, text, headline, revision_id, grievance_id, transition_id, published_by, requested_by)
    VALUES (a.story_id, s.language, v_kind, v_note, v_headline, s.published_revision_id, v_grievance, v_transition, p_decider, a.requested_by);
  ELSE
    SELECT * INTO s FROM public.stories WHERE id = a.story_id;
  END IF;
  RETURN s;
END;
$$;

-- ---- the readers' log: one function (design §2) ----------------------------------------------------
-- SECURITY DEFINER: it runs as its owner, so readers need no right on the table. Newest first, at
-- most 100 at a time, before a time for the next page; one story's when p_story is given. A story's
-- headline and address only while it is live: a withdrawn story's headline may be what was wrong.

CREATE OR REPLACE FUNCTION public.corrections_log(p_story UUID, p_before TIMESTAMPTZ, p_limit INTEGER)
RETURNS TABLE (
  id UUID, kind TEXT, text TEXT, language TEXT, published_at TIMESTAMPTZ, story_live BOOLEAN,
  headline TEXT, section TEXT, slug TEXT, public_id BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH picked AS (
    SELECT c.id, c.kind, c.text, c.language, c.published_at,
           (s.workflow_state = 'published' AND (s.embargo_until IS NULL OR s.embargo_until <= now())) AS live,
           r.headline AS live_headline, s.section, s.slug, s.public_id
      FROM public.corrections c
      JOIN public.stories s ON s.id = c.story_id
      LEFT JOIN public.story_revisions r ON r.id = s.published_revision_id
     WHERE (p_story IS NULL OR c.story_id = p_story)
       AND (p_before IS NULL OR c.published_at < p_before)
     ORDER BY c.published_at DESC
     LIMIT least(greatest(coalesce(p_limit, 30), 1), 100)
  )
  SELECT p.id, p.kind, p.text, p.language, p.published_at, p.live,
         CASE WHEN p.live THEN p.live_headline END,
         CASE WHEN p.live THEN p.section END,
         CASE WHEN p.live THEN p.slug END,
         CASE WHEN p.live THEN p.public_id END
    FROM picked p
   ORDER BY p.published_at DESC;
$$;

-- ---- RLS, grants -----------------------------------------------------------------------------------

ALTER TABLE public.corrections ENABLE ROW LEVEL SECURITY;

-- Supabase's default privileges grant everything on new public tables. Start from nothing.
REVOKE ALL ON public.corrections FROM anon, authenticated, service_role;

-- The app (service_role): read and add; never UPDATE or DELETE (the triggers refuse them too).
-- Readers get no right on the table, and no policy: they read through corrections_log.
GRANT SELECT, INSERT ON public.corrections TO service_role;

-- Functions: Supabase exposes public functions as RPC to anon and authenticated by default.
REVOKE ALL ON FUNCTION
  public.desk_correct(UUID, UUID, TEXT, TEXT, TEXT, UUID),
  public.desk_decide_pending(UUID, UUID, TEXT, TEXT, TEXT),
  public.corrections_log(UUID, TIMESTAMPTZ, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corrections_log(UUID, TIMESTAMPTZ, INTEGER) TO anon, service_role;
GRANT EXECUTE ON FUNCTION
  public.desk_correct(UUID, UUID, TEXT, TEXT, TEXT, UUID),
  public.desk_decide_pending(UUID, UUID, TEXT, TEXT, TEXT)
  TO service_role;

COMMIT;

-- ---- Verify (one query; expect true, false, false, false, true, false, true, true) -----------------
--   SELECT (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'corrections') AS rls_on,
--          has_table_privilege('service_role', 'public.corrections', 'UPDATE') AS app_can_change,
--          has_table_privilege('service_role', 'public.corrections', 'DELETE') AS app_can_delete,
--          has_table_privilege('anon', 'public.corrections', 'SELECT') AS readers_can_read_table,
--          has_function_privilege('anon', 'public.corrections_log(uuid,timestamptz,integer)', 'EXECUTE') AS readers_can_read_log,
--          has_function_privilege('anon', 'public.desk_correct(uuid,uuid,text,text,text,uuid)', 'EXECUTE') AS readers_can_correct,
--          has_function_privilege('service_role', 'public.desk_correct(uuid,uuid,text,text,text,uuid)', 'EXECUTE') AS app_can_correct,
--          (SELECT count(*) FROM public.corrections) =
--            (SELECT count(*) FROM public.workflow_transitions WHERE action = 'correct') AS every_correction_copied;
--
-- ---- Rollback: before the first correction made through this file -------------------------------
-- The log is the public record of what was corrected. Once a correction is made through it, the
-- table is kept. Before that, this undoes the file (and desk-3's function comes back by running
-- 2026-11-17-desk-3-corrections.sql again):
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.corrections_log(UUID, TIMESTAMPTZ, INTEGER),
--                           public.desk_correct(UUID, UUID, TEXT, TEXT, TEXT, UUID);
--   DROP TABLE IF EXISTS public.corrections;
--   COMMIT;
--   -- then run 2026-11-17-desk-3-corrections.sql whole.
-- Then confirm nothing is left:
--   SELECT to_regclass('public.corrections') IS NULL AS table_gone;   -- true
