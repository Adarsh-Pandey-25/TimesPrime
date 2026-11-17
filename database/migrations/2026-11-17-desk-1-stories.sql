-- TimesPrime: Panel 2 (the Desk), M1. The newsroom's own stories: sections, stories, their immutable
-- revisions, the workflow history, two-person requests, soft locks, authors and tags. Design: Panel 2's
-- design in docs/PANEL_DOCS.md, §2 and §3.
--
-- The owner applies this in Dashboard -> SQL Editor (as postgres), AFTER Panel 0's
-- 2026-11-02-access-1-foundation.sql (it uses public.staff_profiles and public.reject_change()) and
-- before deploying the Desk. Steps, checks and rollback: docs/OPERATIONS.md, Runbooks.
-- Idempotent: tables and indexes are IF NOT EXISTS, functions are CREATE OR REPLACE, triggers and
-- policies are dropped before they are created, constraints are added only when missing, and the
-- grants are restated in full. Safe to re-run.
--
-- What it guarantees, in the database, whatever the app does:
--   - a revision is never changed or deleted, and neither is a workflow transition (append-only);
--   - a story moves between states only through desk_transition(), which refuses a move from any
--     state but the one the caller saw, and writes the transition in the same transaction;
--   - a published story points at a revision of its own; a scheduled one has a time;
--   - a two-person request is never decided by the person who made it;
--   - readers (anon, authenticated) see published stories past their embargo, the published revision
--     of each, and nothing else: no drafts, no history, no staff ids.
--
-- The app reads and writes these tables as service_role, which bypasses RLS. Its gate is
-- requirePermission (packages/server/src/auth); RLS here protects direct reads with the anon key.

BEGIN;

-- ---- sections: one taxonomy for permission scope, the desk and the reader's URLs ----------------

CREATE TABLE IF NOT EXISTS public.sections (
  key TEXT PRIMARY KEY CHECK (key ~ '^[a-z_]+$'),
  label_en TEXT NOT NULL,
  label_hi TEXT NOT NULL,
  position INT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO public.sections (key, label_en, label_hi, position) VALUES
  ('india', 'India', 'भारत', 1),
  ('world', 'World', 'विदेश', 2),
  ('tech', 'Technology', 'तकनीक', 3),
  ('business', 'Business', 'व्यापार', 4),
  ('sports', 'Sports', 'खेल', 5),
  ('entertainment', 'Entertainment', 'मनोरंजन', 6),
  ('health', 'Health', 'स्वास्थ्य', 7),
  ('science', 'Science', 'विज्ञान', 8)
ON CONFLICT (key) DO UPDATE SET label_en = EXCLUDED.label_en, label_hi = EXCLUDED.label_hi, position = EXCLUDED.position;

-- ---- stories ------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  language TEXT NOT NULL CHECK (language IN ('en', 'hi')),
  section TEXT NOT NULL REFERENCES public.sections (key),
  format TEXT NOT NULL DEFAULT 'news' CHECK (format IN ('news', 'opinion', 'explainer', 'analysis',
    'interview', 'live_blog', 'gallery', 'video', 'fact_check', 'sponsored')),
  workflow_state TEXT NOT NULL CHECK (workflow_state IN ('pitch', 'assigned', 'draft', 'in_review',
    'desk_review', 'approved', 'scheduled', 'published', 'unpublished', 'retracted', 'killed')),
  translation_group_id UUID NULL,
  slug TEXT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 80),
  created_by UUID NOT NULL REFERENCES public.staff_profiles (user_id),
  assigned_to UUID NULL REFERENCES public.staff_profiles (user_id),
  last_edited_by UUID NULL REFERENCES public.staff_profiles (user_id),
  approved_by UUID NULL REFERENCES public.staff_profiles (user_id),
  approved_revision_id UUID NULL,
  published_by UUID NULL REFERENCES public.staff_profiles (user_id),
  current_revision_id UUID NULL,
  published_revision_id UUID NULL,
  scheduled_at TIMESTAMPTZ NULL,
  embargo_until TIMESTAMPTZ NULL,
  legal_hold BOOLEAN NOT NULL DEFAULT false,
  legal_review_required BOOLEAN NOT NULL DEFAULT false,
  content_label TEXT NULL,
  access TEXT NOT NULL DEFAULT 'free' CHECK (access IN ('free')),
  breaking BOOLEAN NOT NULL DEFAULT false,
  post_hoc_review_due BOOLEAN NOT NULL DEFAULT false,
  correction_note TEXT NULL,
  first_published_at TIMESTAMPTZ NULL,
  published_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT stories_published_has_revision CHECK (workflow_state <> 'published' OR published_revision_id IS NOT NULL),
  CONSTRAINT stories_scheduled_has_time CHECK (workflow_state <> 'scheduled' OR scheduled_at IS NOT NULL),
  CONSTRAINT stories_approved_has_revision CHECK (workflow_state NOT IN ('approved', 'scheduled') OR approved_revision_id IS NOT NULL)
);

-- ---- story_revisions: immutable --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.story_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.stories (id),
  body JSONB NOT NULL,
  headline TEXT NOT NULL,
  dek TEXT NULL,
  seo_title TEXT NULL,
  seo_description TEXT NULL,
  editor_id UUID NOT NULL REFERENCES public.staff_profiles (user_id),
  is_substantive BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The story's pointers into its revisions, added once both tables exist.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stories_current_revision_fk') THEN
    ALTER TABLE public.stories ADD CONSTRAINT stories_current_revision_fk
      FOREIGN KEY (current_revision_id) REFERENCES public.story_revisions (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stories_approved_revision_fk') THEN
    ALTER TABLE public.stories ADD CONSTRAINT stories_approved_revision_fk
      FOREIGN KEY (approved_revision_id) REFERENCES public.story_revisions (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stories_published_revision_fk') THEN
    ALTER TABLE public.stories ADD CONSTRAINT stories_published_revision_fk
      FOREIGN KEY (published_revision_id) REFERENCES public.story_revisions (id);
  END IF;
END;
$$;

-- ---- workflow_transitions: append-only history; the four-eyes check reads it ---------------------

CREATE TABLE IF NOT EXISTS public.workflow_transitions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES public.stories (id),
  action TEXT NOT NULL CHECK (action ~ '^[a-z_]+$'),
  from_state TEXT NULL,
  to_state TEXT NOT NULL,
  actor_id UUID NULL REFERENCES public.staff_profiles (user_id),
  actor_label TEXT NOT NULL,
  revision_id UUID NULL REFERENCES public.story_revisions (id),
  reason TEXT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- pending_actions: the matrix's A, one person asks and a different one decides -----------------

CREATE TABLE IF NOT EXISTS public.pending_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.stories (id),
  action TEXT NOT NULL CHECK (action IN ('restore', 'correction')),
  requested_by UUID NOT NULL REFERENCES public.staff_profiles (user_id),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by UUID NULL REFERENCES public.staff_profiles (user_id),
  decided_at TIMESTAMPTZ NULL,
  outcome TEXT NULL CHECK (outcome IN ('approved', 'declined')),
  CONSTRAINT pending_actions_two_people CHECK (decided_by IS NULL OR decided_by <> requested_by),
  CONSTRAINT pending_actions_decided_together CHECK ((decided_by IS NULL) = (decided_at IS NULL) AND (decided_at IS NULL) = (outcome IS NULL))
);

-- ---- story_locks: soft lock while someone edits --------------------------------------------------

CREATE TABLE IF NOT EXISTS public.story_locks (
  story_id UUID PRIMARY KEY REFERENCES public.stories (id),
  holder_id UUID NOT NULL REFERENCES public.staff_profiles (user_id),
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- authors and bylines: authors are not staff accounts ----------------------------------------

CREATE TABLE IF NOT EXISTS public.authors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name_en TEXT NOT NULL CHECK (length(trim(display_name_en)) > 0),
  display_name_hi TEXT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('staff', 'columnist', 'freelancer', 'agency')),
  staff_user_id UUID NULL REFERENCES public.staff_profiles (user_id),
  bio_en TEXT NULL,
  bio_hi TEXT NULL,
  beat TEXT NULL,
  links JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.story_authors (
  story_id UUID NOT NULL REFERENCES public.stories (id),
  author_id UUID NOT NULL REFERENCES public.authors (id),
  role TEXT NOT NULL CHECK (role IN ('byline', 'additional_reporting', 'translated_by')),
  position INT NOT NULL DEFAULT 0,
  PRIMARY KEY (story_id, author_id, role)
);

-- ---- tags ----------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  language TEXT NOT NULL CHECK (language IN ('en', 'hi')),
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  label TEXT NOT NULL,
  UNIQUE (language, slug)
);

CREATE TABLE IF NOT EXISTS public.story_tags (
  story_id UUID NOT NULL REFERENCES public.stories (id),
  tag_id UUID NOT NULL REFERENCES public.tags (id),
  PRIMARY KEY (story_id, tag_id)
);

-- ---- indexes ---------------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS stories_desk_list ON public.stories (workflow_state, language, section, updated_at DESC);
CREATE INDEX IF NOT EXISTS stories_due ON public.stories (scheduled_at) WHERE workflow_state = 'scheduled';
CREATE INDEX IF NOT EXISTS stories_published ON public.stories (published_at DESC) WHERE workflow_state = 'published';
CREATE INDEX IF NOT EXISTS stories_translation_group ON public.stories (translation_group_id) WHERE translation_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS story_revisions_story ON public.story_revisions (story_id, created_at DESC);
CREATE INDEX IF NOT EXISTS workflow_transitions_story ON public.workflow_transitions (story_id, at);
CREATE INDEX IF NOT EXISTS pending_actions_open ON public.pending_actions (story_id) WHERE decided_at IS NULL;
CREATE INDEX IF NOT EXISTS story_authors_author ON public.story_authors (author_id);
CREATE INDEX IF NOT EXISTS story_tags_tag ON public.story_tags (tag_id);

-- ---- append-only: revisions and transitions (reject_change() is Panel 0's) -----------------------

DROP TRIGGER IF EXISTS story_revisions_no_change ON public.story_revisions;
CREATE TRIGGER story_revisions_no_change
  BEFORE UPDATE OR DELETE ON public.story_revisions
  FOR EACH ROW EXECUTE FUNCTION public.reject_change();

DROP TRIGGER IF EXISTS story_revisions_no_truncate ON public.story_revisions;
CREATE TRIGGER story_revisions_no_truncate
  BEFORE TRUNCATE ON public.story_revisions
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_change();

DROP TRIGGER IF EXISTS workflow_transitions_no_change ON public.workflow_transitions;
CREATE TRIGGER workflow_transitions_no_change
  BEFORE UPDATE OR DELETE ON public.workflow_transitions
  FOR EACH ROW EXECUTE FUNCTION public.reject_change();

DROP TRIGGER IF EXISTS workflow_transitions_no_truncate ON public.workflow_transitions;
CREATE TRIGGER workflow_transitions_no_truncate
  BEFORE TRUNCATE ON public.workflow_transitions
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_change();

-- A decided request stays decided.
CREATE OR REPLACE FUNCTION public.pending_actions_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'pending_actions: DELETE is not allowed';
  END IF;
  IF OLD.decided_at IS NOT NULL THEN
    RAISE EXCEPTION 'pending_actions: % is already decided', OLD.id;
  END IF;
  IF (NEW.id, NEW.story_id, NEW.action, NEW.requested_by, NEW.reason, NEW.payload, NEW.requested_at)
     IS DISTINCT FROM (OLD.id, OLD.story_id, OLD.action, OLD.requested_by, OLD.reason, OLD.payload, OLD.requested_at) THEN
    RAISE EXCEPTION 'pending_actions: only the decision may be set';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pending_actions_guard ON public.pending_actions;
CREATE TRIGGER pending_actions_guard
  BEFORE UPDATE OR DELETE ON public.pending_actions
  FOR EACH ROW EXECUTE FUNCTION public.pending_actions_guard();

-- ---- the workflow's writes, each in one transaction ----------------------------------------------
-- The app decides who may act (requirePermission and the workflow rules in packages/server); these
-- functions make each change atomic and refuse a story that moved since the caller read it.

-- A new story, with its first revision and its first transition.
CREATE OR REPLACE FUNCTION public.desk_create_story(
  p_actor UUID, p_language TEXT, p_section TEXT, p_format TEXT, p_state TEXT,
  p_headline TEXT, p_dek TEXT, p_body JSONB, p_translation_group_id UUID
)
RETURNS public.stories
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  s public.stories;
  r_id UUID;
BEGIN
  IF p_state NOT IN ('pitch', 'draft') THEN
    RAISE EXCEPTION 'desk_create_story: a story starts as pitch or draft, not %', p_state;
  END IF;
  INSERT INTO public.stories (language, section, format, workflow_state, translation_group_id, created_by, last_edited_by)
  VALUES (p_language, p_section, p_format, p_state, p_translation_group_id, p_actor, p_actor)
  RETURNING * INTO s;
  INSERT INTO public.story_revisions (story_id, body, headline, dek, editor_id, is_substantive)
  VALUES (s.id, p_body, p_headline, p_dek, p_actor, true)
  RETURNING id INTO r_id;
  UPDATE public.stories SET current_revision_id = r_id WHERE id = s.id RETURNING * INTO s;
  INSERT INTO public.workflow_transitions (story_id, action, from_state, to_state, actor_id, actor_label, revision_id)
  VALUES (s.id, 'create', NULL, p_state, p_actor, 'staff:' || p_actor::text, r_id);
  RETURN s;
END;
$$;

-- A new revision. p_expected_revision is the revision the editor started from: if someone saved
-- since, the save is refused (no silent overwrite). Saving an approved story voids the approval.
CREATE OR REPLACE FUNCTION public.desk_save_revision(
  p_story UUID, p_actor UUID, p_expected_revision UUID,
  p_headline TEXT, p_dek TEXT, p_body JSONB, p_seo_title TEXT, p_seo_description TEXT, p_is_substantive BOOLEAN
)
RETURNS public.stories
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  s public.stories;
  r_id UUID;
  prev_state TEXT;
  next_state TEXT;
BEGIN
  SELECT * INTO s FROM public.stories WHERE id = p_story FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'desk: story % not found', p_story USING ERRCODE = 'no_data_found';
  END IF;
  IF s.current_revision_id IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'desk: story % changed since revision %', p_story, p_expected_revision USING ERRCODE = 'serialization_failure';
  END IF;
  IF s.workflow_state IN ('unpublished', 'retracted', 'killed', 'scheduled') THEN
    RAISE EXCEPTION 'desk: a % story cannot be saved', s.workflow_state USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.story_revisions (story_id, body, headline, dek, seo_title, seo_description, editor_id, is_substantive)
  VALUES (p_story, p_body, p_headline, p_dek, p_seo_title, p_seo_description, p_actor, p_is_substantive)
  RETURNING id INTO r_id;
  prev_state := s.workflow_state;
  next_state := CASE WHEN prev_state = 'approved' THEN 'desk_review' ELSE prev_state END;
  -- An approval binds to one revision (design §3): a later save voids it, live stories included.
  UPDATE public.stories
     SET current_revision_id = r_id, last_edited_by = p_actor, updated_at = now(), workflow_state = next_state,
         approved_by = NULL, approved_revision_id = NULL
   WHERE id = p_story
  RETURNING * INTO s;
  INSERT INTO public.workflow_transitions (story_id, action, from_state, to_state, actor_id, actor_label, revision_id)
  VALUES (p_story, 'save', prev_state, next_state, p_actor, 'staff:' || p_actor::text, r_id);
  RETURN s;
END;
$$;

-- A move from p_from to p_to, with the fields the move sets (only those named in p_fields, from the
-- list below). Refused if the story is not in p_from any more.
CREATE OR REPLACE FUNCTION public.desk_transition(
  p_story UUID, p_action TEXT, p_from TEXT, p_to TEXT, p_actor UUID, p_actor_label TEXT, p_reason TEXT, p_fields JSONB
)
RETURNS public.stories
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  s public.stories;
  f JSONB := coalesce(p_fields, '{}'::jsonb);
  unknown TEXT;
BEGIN
  SELECT key INTO unknown FROM jsonb_object_keys(f) AS key
   WHERE key NOT IN ('assigned_to', 'approved_by', 'approved_revision_id', 'published_by', 'published_revision_id',
                     'scheduled_at', 'embargo_until', 'published_at', 'first_published_at', 'breaking',
                     'post_hoc_review_due', 'correction_note', 'legal_review_required', 'slug')
   LIMIT 1;
  IF unknown IS NOT NULL THEN
    RAISE EXCEPTION 'desk_transition: % is not a field a move may set', unknown;
  END IF;
  UPDATE public.stories SET
    workflow_state = p_to,
    updated_at = now(),
    assigned_to = CASE WHEN f ? 'assigned_to' THEN (f->>'assigned_to')::uuid ELSE assigned_to END,
    approved_by = CASE WHEN f ? 'approved_by' THEN (f->>'approved_by')::uuid ELSE approved_by END,
    approved_revision_id = CASE WHEN f ? 'approved_revision_id' THEN (f->>'approved_revision_id')::uuid ELSE approved_revision_id END,
    published_by = CASE WHEN f ? 'published_by' THEN (f->>'published_by')::uuid ELSE published_by END,
    published_revision_id = CASE WHEN f ? 'published_revision_id' THEN (f->>'published_revision_id')::uuid ELSE published_revision_id END,
    scheduled_at = CASE WHEN f ? 'scheduled_at' THEN (f->>'scheduled_at')::timestamptz ELSE scheduled_at END,
    embargo_until = CASE WHEN f ? 'embargo_until' THEN (f->>'embargo_until')::timestamptz ELSE embargo_until END,
    published_at = CASE WHEN f ? 'published_at' THEN (f->>'published_at')::timestamptz ELSE published_at END,
    first_published_at = CASE WHEN f ? 'first_published_at' THEN (f->>'first_published_at')::timestamptz ELSE first_published_at END,
    breaking = CASE WHEN f ? 'breaking' THEN (f->>'breaking')::boolean ELSE breaking END,
    post_hoc_review_due = CASE WHEN f ? 'post_hoc_review_due' THEN (f->>'post_hoc_review_due')::boolean ELSE post_hoc_review_due END,
    correction_note = CASE WHEN f ? 'correction_note' THEN f->>'correction_note' ELSE correction_note END,
    legal_review_required = CASE WHEN f ? 'legal_review_required' THEN (f->>'legal_review_required')::boolean ELSE legal_review_required END,
    slug = CASE WHEN f ? 'slug' THEN f->>'slug' ELSE slug END
  WHERE id = p_story AND workflow_state = p_from
  RETURNING * INTO s;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'desk: story % is not % any more', p_story, p_from USING ERRCODE = 'serialization_failure';
  END IF;
  INSERT INTO public.workflow_transitions (story_id, action, from_state, to_state, actor_id, actor_label, revision_id, reason)
  VALUES (p_story, p_action, p_from, p_to, p_actor, p_actor_label,
          coalesce((f->>'published_revision_id')::uuid, (f->>'approved_revision_id')::uuid, s.current_revision_id), p_reason);
  RETURN s;
END;
$$;

-- ---- RLS, grants -----------------------------------------------------------------------------------

ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_tags ENABLE ROW LEVEL SECURITY;

-- Supabase's default privileges grant everything on new public tables. Start from nothing.
REVOKE ALL ON public.sections, public.stories, public.story_revisions, public.workflow_transitions,
              public.pending_actions, public.story_locks, public.authors, public.story_authors,
              public.tags, public.story_tags
  FROM anon, authenticated, service_role;

-- The app (service_role): what the Desk needs, and no UPDATE or DELETE on the history.
GRANT SELECT ON public.sections TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.stories TO service_role;
GRANT SELECT, INSERT ON public.story_revisions, public.workflow_transitions TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.pending_actions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_locks TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.authors, public.tags TO service_role;
GRANT SELECT, INSERT, DELETE ON public.story_authors, public.story_tags TO service_role;

-- Readers: published stories past their embargo, their published revision, bylines and tags. Column
-- grants keep staff ids and desk flags out of reach.
GRANT SELECT ON public.sections TO anon, authenticated;
GRANT SELECT (id, public_id, language, section, format, translation_group_id, slug, published_revision_id,
              content_label, access, breaking, correction_note, first_published_at, published_at, updated_at,
              workflow_state, embargo_until)
  ON public.stories TO anon, authenticated;
GRANT SELECT (id, story_id, body, headline, dek, seo_title, seo_description, created_at)
  ON public.story_revisions TO anon, authenticated;
GRANT SELECT (id, display_name_en, display_name_hi, kind, bio_en, bio_hi, beat, links, active)
  ON public.authors TO anon, authenticated;
GRANT SELECT ON public.story_authors, public.tags, public.story_tags TO anon, authenticated;

DROP POLICY IF EXISTS sections_read ON public.sections;
CREATE POLICY sections_read ON public.sections FOR SELECT TO anon, authenticated USING (active);

DROP POLICY IF EXISTS stories_read_published ON public.stories;
CREATE POLICY stories_read_published ON public.stories FOR SELECT TO anon, authenticated
  USING (workflow_state = 'published' AND (embargo_until IS NULL OR embargo_until <= now()));

DROP POLICY IF EXISTS story_revisions_read_published ON public.story_revisions;
CREATE POLICY story_revisions_read_published ON public.story_revisions FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.stories s
                  WHERE s.published_revision_id = story_revisions.id AND s.workflow_state = 'published'
                    AND (s.embargo_until IS NULL OR s.embargo_until <= now())));

DROP POLICY IF EXISTS authors_read ON public.authors;
CREATE POLICY authors_read ON public.authors FOR SELECT TO anon, authenticated USING (active);

DROP POLICY IF EXISTS story_authors_read_published ON public.story_authors;
CREATE POLICY story_authors_read_published ON public.story_authors FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_authors.story_id AND s.workflow_state = 'published'
                    AND (s.embargo_until IS NULL OR s.embargo_until <= now())));

DROP POLICY IF EXISTS tags_read ON public.tags;
CREATE POLICY tags_read ON public.tags FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS story_tags_read_published ON public.story_tags;
CREATE POLICY story_tags_read_published ON public.story_tags FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_tags.story_id AND s.workflow_state = 'published'
                    AND (s.embargo_until IS NULL OR s.embargo_until <= now())));

-- Functions: Supabase exposes public functions as RPC to anon and authenticated by default.
REVOKE ALL ON FUNCTION
  public.pending_actions_guard(),
  public.desk_create_story(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, UUID),
  public.desk_save_revision(UUID, UUID, UUID, TEXT, TEXT, JSONB, TEXT, TEXT, BOOLEAN),
  public.desk_transition(UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.desk_create_story(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, UUID),
  public.desk_save_revision(UUID, UUID, UUID, TEXT, TEXT, JSONB, TEXT, TEXT, BOOLEAN),
  public.desk_transition(UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, JSONB)
  TO service_role;

COMMIT;

-- ---- Verify (each line says what to expect) ---------------------------------------------------
--   SELECT count(*) FROM public.sections;                                          -- 8
--   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'
--     AND tablename IN ('sections','stories','story_revisions','workflow_transitions','pending_actions',
--                       'story_locks','authors','story_authors','tags','story_tags');
--                                                                  -- ten rows, rowsecurity true
--   SELECT has_table_privilege('service_role', 'public.story_revisions', 'UPDATE');       -- false
--   SELECT has_table_privilege('service_role', 'public.workflow_transitions', 'DELETE');  -- false
--   SELECT has_table_privilege('anon', 'public.pending_actions', 'SELECT');               -- false
--   SELECT has_column_privilege('anon', 'public.stories', 'created_by', 'SELECT');        -- false
--   SELECT has_column_privilege('anon', 'public.stories', 'slug', 'SELECT');              -- true
--   SELECT has_function_privilege('anon', 'public.desk_transition(uuid,text,text,text,uuid,text,text,jsonb)', 'EXECUTE');  -- false
-- With a test staff member's id in <me> (on a test project, never on production data):
--   BEGIN;
--   SELECT id, current_revision_id FROM public.desk_create_story('<me>', 'en', 'india', 'news', 'draft',
--     'Test', NULL, '{"type":"doc","content":[]}'::jsonb, NULL);           -- one row
--   UPDATE public.story_revisions SET headline = 'x';                      -- ERROR: append-only
--   DELETE FROM public.workflow_transitions;                               -- ERROR: append-only
--   ROLLBACK;
--
-- ---- Rollback: ONLY before the first real story ------------------------------------------------
-- Stories and their revisions are the newsroom's record (the 60-day content-record duty, Rule 19):
-- once real stories exist they are never dropped. Before that, this undoes the file:
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.desk_transition(UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, JSONB),
--                           public.desk_save_revision(UUID, UUID, UUID, TEXT, TEXT, JSONB, TEXT, TEXT, BOOLEAN),
--                           public.desk_create_story(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, UUID);
--   DROP TABLE IF EXISTS public.story_tags, public.tags, public.story_authors, public.authors,
--                        public.story_locks, public.pending_actions, public.workflow_transitions;
--   ALTER TABLE IF EXISTS public.stories DROP CONSTRAINT IF EXISTS stories_current_revision_fk,
--     DROP CONSTRAINT IF EXISTS stories_approved_revision_fk, DROP CONSTRAINT IF EXISTS stories_published_revision_fk;
--   DROP TABLE IF EXISTS public.story_revisions, public.stories, public.sections;
--   DROP FUNCTION IF EXISTS public.pending_actions_guard();
--   COMMIT;
-- Then confirm nothing is left:
--   SELECT tablename FROM pg_tables WHERE schemaname = 'public'
--     AND tablename IN ('sections','stories','story_revisions','workflow_transitions','pending_actions',
--                       'story_locks','authors','story_authors','tags','story_tags');   -- no rows
