-- TimesPrime: Panel 3 (the Front page), M3. Live blogs: a story with the format live_blog takes short
-- updates, posted without a second approver (decision 6), until the desk ends it.
-- Design: Panel 3's design in docs/PANEL_DOCS.md, §2 and §3 (decisions 6 and 7).
--
-- The owner applies this in Dashboard -> SQL Editor (as postgres), AFTER Panel 2's
-- 2026-11-17-desk-1-stories.sql (it uses public.stories, public.staff_profiles,
-- public.workflow_transitions and public.reject_change()), and re-applies the regenerated catalogue
-- (2026-11-02-access-2-catalog.sql) for live_update.post. Steps, the check and the rollback:
-- docs/OPERATIONS.md, Runbooks.
-- Idempotent: the column, table and indexes are IF NOT EXISTS, functions are CREATE OR REPLACE,
-- triggers and the policy are dropped before they are created, and the grants are restated in full.
-- Safe to re-run.
--
-- What it guarantees, in the database, whatever the app does:
--   - an update is history: it is never deleted, a removed update stays removed (with who, when and
--     why), and its story, author and time never change;
--   - at most one update of a story is pinned, and a removed one never is;
--   - live_post and live_edit write only to a published live blog that has not ended; live_end ends
--     one, once, and records it in the story's history; live_remove takes an update off the page at
--     any time;
--   - readers (anon, authenticated) see the updates of a live, published story that are not removed,
--     without who wrote, changed or removed them.
--
-- The app reads and writes as service_role, which bypasses RLS. Its gate is requirePermission
-- (packages/server/src/auth); RLS here protects direct reads with the anon key.

BEGIN;

-- ---- when a live blog ended --------------------------------------------------------------------

ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS live_ended_at TIMESTAMPTZ NULL;

-- ---- live_updates ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.live_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.stories (id),
  headline TEXT NULL CHECK (headline IS NULL OR (length(trim(headline)) > 0 AND char_length(headline) <= 110)),
  body JSONB NOT NULL CHECK (jsonb_typeof(body) = 'object'),
  is_key_event BOOLEAN NOT NULL DEFAULT false,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  posted_by UUID NOT NULL REFERENCES public.staff_profiles (user_id),
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_by UUID NULL REFERENCES public.staff_profiles (user_id),
  edited_at TIMESTAMPTZ NULL,
  removed_by UUID NULL REFERENCES public.staff_profiles (user_id),
  removed_at TIMESTAMPTZ NULL,
  removed_reason TEXT NULL CHECK (removed_reason IS NULL OR length(trim(removed_reason)) > 0),
  CONSTRAINT live_updates_edited_together CHECK ((edited_by IS NULL) = (edited_at IS NULL)),
  CONSTRAINT live_updates_removed_together CHECK ((removed_by IS NULL) = (removed_at IS NULL) AND (removed_at IS NULL) = (removed_reason IS NULL)),
  CONSTRAINT live_updates_removed_unpinned CHECK (removed_at IS NULL OR NOT is_pinned)
);

CREATE INDEX IF NOT EXISTS live_updates_story ON public.live_updates (story_id, posted_at DESC);
-- At most one pinned update per story (a removed one is never pinned: the CHECK above).
CREATE UNIQUE INDEX IF NOT EXISTS live_updates_one_pinned ON public.live_updates (story_id) WHERE is_pinned;

-- ---- history: never deleted; a removed update stays removed (reject_change() is Panel 0's) -------

CREATE OR REPLACE FUNCTION public.live_updates_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'live_updates: DELETE is not allowed; remove the update instead';
  END IF;
  IF OLD.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'live_updates: update % was removed', OLD.id;
  END IF;
  IF (NEW.id, NEW.story_id, NEW.posted_by, NEW.posted_at) IS DISTINCT FROM (OLD.id, OLD.story_id, OLD.posted_by, OLD.posted_at) THEN
    RAISE EXCEPTION 'live_updates: an update keeps its story, author and time';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS live_updates_guard ON public.live_updates;
CREATE TRIGGER live_updates_guard
  BEFORE UPDATE OR DELETE ON public.live_updates
  FOR EACH ROW EXECUTE FUNCTION public.live_updates_guard();

DROP TRIGGER IF EXISTS live_updates_no_truncate ON public.live_updates;
CREATE TRIGGER live_updates_no_truncate
  BEFORE TRUNCATE ON public.live_updates
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_change();

-- ---- the writes, each in one transaction -----------------------------------------------------------
-- The app decides who may act (requirePermission in the story's desk) and checks the update's text
-- (packages/editor/src/live.ts); these functions make each change atomic and refuse a story that is
-- not an open live blog. Each locks the story's row, so a post and the blog's end cannot cross.

-- Posts an update. Pinning it unpins the story's other pinned update.
CREATE OR REPLACE FUNCTION public.live_post(
  p_story UUID, p_actor UUID, p_headline TEXT, p_body JSONB, p_key_event BOOLEAN, p_pinned BOOLEAN
)
RETURNS public.live_updates
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  s public.stories;
  u public.live_updates;
BEGIN
  SELECT * INTO s FROM public.stories WHERE id = p_story FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'live_post: story % not found', p_story USING ERRCODE = 'no_data_found';
  END IF;
  IF s.format <> 'live_blog' OR s.workflow_state <> 'published' OR s.live_ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'live_post: story % is not an open live blog', p_story USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF p_pinned THEN
    UPDATE public.live_updates SET is_pinned = false WHERE story_id = p_story AND is_pinned;
  END IF;
  INSERT INTO public.live_updates (story_id, headline, body, is_key_event, is_pinned, posted_by)
  VALUES (p_story, p_headline, p_body, coalesce(p_key_event, false), coalesce(p_pinned, false), p_actor)
  RETURNING * INTO u;
  RETURN u;
END;
$$;

-- Changes an update's text and flags: the whole of each, as the caller sends them.
CREATE OR REPLACE FUNCTION public.live_edit(
  p_update UUID, p_actor UUID, p_headline TEXT, p_body JSONB, p_key_event BOOLEAN, p_pinned BOOLEAN
)
RETURNS public.live_updates
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  s public.stories;
  u public.live_updates;
BEGIN
  SELECT * INTO u FROM public.live_updates WHERE id = p_update;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'live_edit: update % not found', p_update USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO s FROM public.stories WHERE id = u.story_id FOR UPDATE;
  IF s.format <> 'live_blog' OR s.workflow_state <> 'published' OR s.live_ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'live_edit: story % is not an open live blog', u.story_id USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  SELECT * INTO u FROM public.live_updates WHERE id = p_update FOR UPDATE;
  IF u.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'live_edit: update % was removed', p_update USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF p_pinned THEN
    UPDATE public.live_updates SET is_pinned = false WHERE story_id = u.story_id AND is_pinned AND id <> p_update;
  END IF;
  UPDATE public.live_updates
     SET headline = p_headline, body = p_body, is_key_event = coalesce(p_key_event, false),
         is_pinned = coalesce(p_pinned, false), edited_by = p_actor, edited_at = now()
   WHERE id = p_update
  RETURNING * INTO u;
  RETURN u;
END;
$$;

-- Takes an update off the page, with a reason (decision 7): at any time, also after the blog ended.
CREATE OR REPLACE FUNCTION public.live_remove(p_update UUID, p_actor UUID, p_reason TEXT)
RETURNS public.live_updates
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  u public.live_updates;
BEGIN
  SELECT * INTO u FROM public.live_updates WHERE id = p_update FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'live_remove: update % not found', p_update USING ERRCODE = 'no_data_found';
  END IF;
  IF u.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'live_remove: update % was already removed', p_update USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  UPDATE public.live_updates
     SET removed_by = p_actor, removed_at = now(), removed_reason = p_reason, is_pinned = false
   WHERE id = p_update
  RETURNING * INTO u;
  RETURN u;
END;
$$;

-- Ends a live blog: it takes no more updates. Recorded in the story's history as end_live.
CREATE OR REPLACE FUNCTION public.live_end(p_story UUID, p_actor UUID)
RETURNS public.stories
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  s public.stories;
BEGIN
  SELECT * INTO s FROM public.stories WHERE id = p_story FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'live_end: story % not found', p_story USING ERRCODE = 'no_data_found';
  END IF;
  IF s.format <> 'live_blog' OR s.workflow_state <> 'published' OR s.live_ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'live_end: story % is not an open live blog', p_story USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  UPDATE public.stories SET live_ended_at = now(), updated_at = now() WHERE id = p_story RETURNING * INTO s;
  INSERT INTO public.workflow_transitions (story_id, action, from_state, to_state, actor_id, actor_label, revision_id)
  VALUES (p_story, 'end_live', 'published', 'published', p_actor, 'staff:' || p_actor::text, s.published_revision_id);
  RETURN s;
END;
$$;

-- ---- RLS, grants -----------------------------------------------------------------------------------

ALTER TABLE public.live_updates ENABLE ROW LEVEL SECURITY;

-- Supabase's default privileges grant everything on new public tables. Start from nothing.
REVOKE ALL ON public.live_updates FROM anon, authenticated, service_role;

-- The app (service_role): read, post, change and remove; never DELETE (the guard refuses it too).
-- Its UPDATE on stories (desk-1) covers live_ended_at.
GRANT SELECT, INSERT, UPDATE ON public.live_updates TO service_role;

-- Readers: a live story's updates that are not removed, without who wrote, changed or removed them;
-- and when a live blog ended.
GRANT SELECT (id, story_id, headline, body, is_key_event, is_pinned, posted_at, edited_at)
  ON public.live_updates TO anon, authenticated;
GRANT SELECT (live_ended_at) ON public.stories TO anon, authenticated;

DROP POLICY IF EXISTS live_updates_read_published ON public.live_updates;
CREATE POLICY live_updates_read_published ON public.live_updates FOR SELECT TO anon, authenticated
  USING (removed_at IS NULL AND EXISTS (SELECT 1 FROM public.stories s
                                         WHERE s.id = live_updates.story_id AND s.workflow_state = 'published'
                                           AND (s.embargo_until IS NULL OR s.embargo_until <= now())));

-- Functions: Supabase exposes public functions as RPC to anon and authenticated by default.
REVOKE ALL ON FUNCTION
  public.live_updates_guard(),
  public.live_post(UUID, UUID, TEXT, JSONB, BOOLEAN, BOOLEAN),
  public.live_edit(UUID, UUID, TEXT, JSONB, BOOLEAN, BOOLEAN),
  public.live_remove(UUID, UUID, TEXT),
  public.live_end(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.live_post(UUID, UUID, TEXT, JSONB, BOOLEAN, BOOLEAN),
  public.live_edit(UUID, UUID, TEXT, JSONB, BOOLEAN, BOOLEAN),
  public.live_remove(UUID, UUID, TEXT),
  public.live_end(UUID, UUID)
  TO service_role;

COMMIT;

-- ---- Verify (one query; expect true, true, false, false, true, false, true, 0) --------------------
--   SELECT EXISTS (SELECT 1 FROM information_schema.columns
--                  WHERE table_schema = 'public' AND table_name = 'stories' AND column_name = 'live_ended_at') AS has_live_ended_at,
--          (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'live_updates') AS rls_on,
--          has_table_privilege('service_role', 'public.live_updates', 'DELETE') AS app_can_delete,
--          has_column_privilege('anon', 'public.live_updates', 'posted_by', 'SELECT') AS readers_see_who,
--          has_column_privilege('anon', 'public.live_updates', 'body', 'SELECT') AS readers_see_body,
--          has_function_privilege('anon', 'public.live_post(uuid,uuid,text,jsonb,boolean,boolean)', 'EXECUTE') AS readers_can_post,
--          has_function_privilege('service_role', 'public.live_post(uuid,uuid,text,jsonb,boolean,boolean)', 'EXECUTE') AS app_can_post,
--          (SELECT count(*) FROM public.live_updates) AS updates;
--
-- ---- Rollback: before the first update ------------------------------------------------------------
-- Updates are the newsroom's record of what a live page said (the 60-day content-record duty). Once a
-- live blog takes updates, the table is kept. Before that, this undoes the file:
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.live_end(UUID, UUID), public.live_remove(UUID, UUID, TEXT),
--                           public.live_edit(UUID, UUID, TEXT, JSONB, BOOLEAN, BOOLEAN),
--                           public.live_post(UUID, UUID, TEXT, JSONB, BOOLEAN, BOOLEAN);
--   DROP TABLE IF EXISTS public.live_updates;
--   DROP FUNCTION IF EXISTS public.live_updates_guard();
--   REVOKE SELECT (live_ended_at) ON public.stories FROM anon, authenticated;
--   ALTER TABLE public.stories DROP COLUMN IF EXISTS live_ended_at;
--   COMMIT;
-- Then confirm nothing is left:
--   SELECT to_regclass('public.live_updates') IS NULL AS table_gone,
--          NOT EXISTS (SELECT 1 FROM information_schema.columns
--                      WHERE table_schema = 'public' AND table_name = 'stories' AND column_name = 'live_ended_at') AS column_gone;   -- true, true
