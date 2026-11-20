-- TimesPrime: Panel 3 (the Front page), M2. Pinned slots: an editor pins a published Desk story above
-- the automatic order of the home page or a section page, in one language, until a set time.
-- Design: Panel 3's design in docs/PANEL_DOCS.md, §2 and §3 (decisions 1 to 3).
--
-- The owner applies this in Dashboard -> SQL Editor (as postgres), AFTER Panel 2's
-- 2026-11-17-desk-1-stories.sql (it uses public.sections, public.stories, public.staff_profiles and
-- public.reject_change()). Steps, the check and the rollback: docs/OPERATIONS.md, Runbooks.
-- Idempotent: the table and indexes are IF NOT EXISTS, functions are CREATE OR REPLACE, triggers and
-- the policy are dropped before they are created, and the grants are restated in full. Safe to re-run.
--
-- What it guarantees, in the database, whatever the app does:
--   - a pin is history: it is never deleted, and of a pin only its end may be set, and only moved
--     earlier, until it has passed;
--   - a pin always ends, at most 7 days after it starts; its slot is 1 to 3 on the home page
--     (section NULL) and 1 to 2 on a section page (decision 2);
--   - front_pin() pins in one transaction: the story must be published, in the page's language and,
--     on a section page, in that section, and not pinned in another slot of the page at the same
--     time; a pin of the slot whose time overlaps is ended (one already showing stops when the new
--     one starts; one not started yet is cancelled);
--   - readers (anon, authenticated) see the pins showing now, and only their page, slot, story and
--     times: not who pinned or ended them.
--
-- The app reads and writes the table as service_role, which bypasses RLS. Its gate is
-- requirePermission (packages/server/src/auth); RLS here protects direct reads with the anon key.

BEGIN;

-- ---- front_page_pins ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.front_page_pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  language TEXT NOT NULL CHECK (language IN ('en', 'hi')),
  section TEXT NULL REFERENCES public.sections (key),
  slot INT NOT NULL,
  story_id UUID NOT NULL REFERENCES public.stories (id),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  pinned_by UUID NOT NULL REFERENCES public.staff_profiles (user_id),
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_by UUID NULL REFERENCES public.staff_profiles (user_id),
  ended_at TIMESTAMPTZ NULL,
  end_reason TEXT NULL CHECK (end_reason IN ('unpinned', 'replaced')),
  CONSTRAINT front_page_pins_slot CHECK (slot >= 1 AND slot <= CASE WHEN section IS NULL THEN 3 ELSE 2 END),
  CONSTRAINT front_page_pins_window CHECK (ends_at > starts_at AND ends_at <= starts_at + interval '7 days'),
  CONSTRAINT front_page_pins_ended_together CHECK ((ended_at IS NULL) = (ended_by IS NULL) AND (ended_at IS NULL) = (end_reason IS NULL))
);

CREATE INDEX IF NOT EXISTS front_page_pins_page ON public.front_page_pins (language, section, slot, ends_at);
CREATE INDEX IF NOT EXISTS front_page_pins_story ON public.front_page_pins (story_id);

-- ---- history: never deleted; only the end is set (reject_change() is Panel 0's) ------------------

CREATE OR REPLACE FUNCTION public.front_page_pins_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'front_page_pins: DELETE is not allowed; end the pin instead';
  END IF;
  IF OLD.ended_at IS NOT NULL AND OLD.ended_at <= now() THEN
    RAISE EXCEPTION 'front_page_pins: pin % has already ended', OLD.id;
  END IF;
  IF NEW.ended_at IS NULL OR (OLD.ended_at IS NOT NULL AND NEW.ended_at > OLD.ended_at) THEN
    RAISE EXCEPTION 'front_page_pins: an end is set once, and only moved earlier';
  END IF;
  IF (NEW.id, NEW.language, NEW.section, NEW.slot, NEW.story_id, NEW.starts_at, NEW.ends_at, NEW.pinned_by, NEW.pinned_at)
     IS DISTINCT FROM (OLD.id, OLD.language, OLD.section, OLD.slot, OLD.story_id, OLD.starts_at, OLD.ends_at, OLD.pinned_by, OLD.pinned_at) THEN
    RAISE EXCEPTION 'front_page_pins: only the end of a pin may be set';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS front_page_pins_guard ON public.front_page_pins;
CREATE TRIGGER front_page_pins_guard
  BEFORE UPDATE OR DELETE ON public.front_page_pins
  FOR EACH ROW EXECUTE FUNCTION public.front_page_pins_guard();

DROP TRIGGER IF EXISTS front_page_pins_no_truncate ON public.front_page_pins;
CREATE TRIGGER front_page_pins_no_truncate
  BEFORE TRUNCATE ON public.front_page_pins
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_change();

-- ---- the writes, each in one transaction ----------------------------------------------------------
-- The app decides who may act (requirePermission, in the page's language and section); these
-- functions make each change atomic and keep the rules above whatever the caller sends.

-- Pins a story to one slot of a page. p_starts_at NULL, or a time already past, means now. p_hours is
-- the pin's length: 6, 24, 72 or 168 (decision 3). Returns the new pin and the ids of the pins of
-- the slot it ended, as {"pin": {...}, "replaced": [...]}.
CREATE OR REPLACE FUNCTION public.front_pin(
  p_actor UUID, p_language TEXT, p_section TEXT, p_slot INT, p_story UUID, p_starts_at TIMESTAMPTZ, p_hours INT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  s public.stories;
  pin public.front_page_pins;
  v_start TIMESTAMPTZ := greatest(coalesce(p_starts_at, now()), now());
  v_end TIMESTAMPTZ;
  v_replaced UUID[];
BEGIN
  IF p_hours IS NULL OR p_hours NOT IN (6, 24, 72, 168) THEN
    RAISE EXCEPTION 'front_pin: a pin lasts 6, 24, 72 or 168 hours, not %', p_hours USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_slot IS NULL OR p_slot < 1 OR p_slot > CASE WHEN p_section IS NULL THEN 3 ELSE 2 END THEN
    RAISE EXCEPTION 'front_pin: this page has no slot %', p_slot USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  v_end := v_start + make_interval(hours => p_hours);
  -- One change at a time per page: a second caller waits for the first to commit.
  PERFORM pg_advisory_xact_lock(hashtextextended('front_page:' || p_language || ':' || coalesce(p_section, 'home'), 0));

  SELECT * INTO s FROM public.stories WHERE id = p_story FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'front_pin: story % not found', p_story USING ERRCODE = 'no_data_found';
  END IF;
  IF s.workflow_state <> 'published' THEN
    RAISE EXCEPTION 'front_pin: story % is %, not published', p_story, s.workflow_state USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF s.language <> p_language OR (p_section IS NOT NULL AND s.section <> p_section) THEN
    RAISE EXCEPTION 'front_pin: story % is not of this page', p_story USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.front_page_pins p
              WHERE p.language = p_language AND p.section IS NOT DISTINCT FROM p_section AND p.slot <> p_slot
                AND p.story_id = p_story AND (p.ended_at IS NULL OR p.ended_at > v_start)
                AND p.starts_at < v_end AND p.ends_at > v_start) THEN
    RAISE EXCEPTION 'front_pin: story % is already pinned on this page', p_story USING ERRCODE = 'unique_violation';
  END IF;

  WITH ended AS (
    UPDATE public.front_page_pins p
       SET ended_at = CASE WHEN p.starts_at < v_start THEN v_start ELSE now() END,
           ended_by = p_actor,
           end_reason = 'replaced'
     WHERE p.language = p_language AND p.section IS NOT DISTINCT FROM p_section AND p.slot = p_slot
       AND (p.ended_at IS NULL OR p.ended_at > v_start)
       AND p.starts_at < v_end AND p.ends_at > v_start
    RETURNING p.id
  )
  SELECT coalesce(array_agg(ended.id), '{}') INTO v_replaced FROM ended;

  INSERT INTO public.front_page_pins (language, section, slot, story_id, starts_at, ends_at, pinned_by)
  VALUES (p_language, p_section, p_slot, p_story, v_start, v_end, p_actor)
  RETURNING * INTO pin;
  RETURN jsonb_build_object('pin', to_jsonb(pin), 'replaced', to_jsonb(v_replaced));
END;
$$;

-- Unpins: the pin ends now. Refused for a pin that is unknown or has already ended (or run its time).
CREATE OR REPLACE FUNCTION public.front_unpin(p_pin UUID, p_actor UUID)
RETURNS public.front_page_pins
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  pin public.front_page_pins;
BEGIN
  UPDATE public.front_page_pins
     SET ended_at = now(), ended_by = p_actor, end_reason = 'unpinned'
   WHERE id = p_pin AND ends_at > now() AND (ended_at IS NULL OR ended_at > now())
  RETURNING * INTO pin;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.front_page_pins WHERE id = p_pin) THEN
      RAISE EXCEPTION 'front_unpin: pin % has already ended', p_pin USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RAISE EXCEPTION 'front_unpin: pin % not found', p_pin USING ERRCODE = 'no_data_found';
  END IF;
  RETURN pin;
END;
$$;

-- ---- RLS, grants -----------------------------------------------------------------------------------

ALTER TABLE public.front_page_pins ENABLE ROW LEVEL SECURITY;

-- Supabase's default privileges grant everything on new public tables. Start from nothing.
REVOKE ALL ON public.front_page_pins FROM anon, authenticated, service_role;

-- The app (service_role): read, pin and end; never DELETE (the guard refuses it too).
GRANT SELECT, INSERT, UPDATE ON public.front_page_pins TO service_role;

-- Readers: the pins showing now, without who pinned or ended them. A pin whose story is not live
-- shows nothing, as readers see published stories only (desk-1's stories_read_published).
GRANT SELECT (language, section, slot, story_id, starts_at, ends_at) ON public.front_page_pins TO anon, authenticated;

DROP POLICY IF EXISTS front_page_pins_read_live ON public.front_page_pins;
CREATE POLICY front_page_pins_read_live ON public.front_page_pins FOR SELECT TO anon, authenticated
  USING (starts_at <= now() AND ends_at > now() AND (ended_at IS NULL OR ended_at > now()));

-- Functions: Supabase exposes public functions as RPC to anon and authenticated by default.
REVOKE ALL ON FUNCTION
  public.front_page_pins_guard(),
  public.front_pin(UUID, TEXT, TEXT, INT, UUID, TIMESTAMPTZ, INT),
  public.front_unpin(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.front_pin(UUID, TEXT, TEXT, INT, UUID, TIMESTAMPTZ, INT),
  public.front_unpin(UUID, UUID)
  TO service_role;

COMMIT;

-- ---- Verify (one query; expect true, false, false, true, false, true, 0) --------------------------
--   SELECT (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'front_page_pins') AS rls_on,
--          has_table_privilege('service_role', 'public.front_page_pins', 'DELETE') AS app_can_delete,
--          has_column_privilege('anon', 'public.front_page_pins', 'pinned_by', 'SELECT') AS readers_see_who,
--          has_column_privilege('anon', 'public.front_page_pins', 'story_id', 'SELECT') AS readers_see_story,
--          has_function_privilege('anon', 'public.front_pin(uuid,text,text,integer,uuid,timestamptz,integer)', 'EXECUTE') AS readers_can_pin,
--          has_function_privilege('service_role', 'public.front_pin(uuid,text,text,integer,uuid,timestamptz,integer)', 'EXECUTE') AS app_can_pin,
--          (SELECT count(*) FROM public.front_page_pins) AS pins;
--
-- ---- Rollback: before the first pin ---------------------------------------------------------------
-- Pins are the front page's history (who put what above the fold, and when). Once editors pin, the
-- table is kept; the audit log holds the same story. Before that, this undoes the file:
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.front_unpin(UUID, UUID),
--                           public.front_pin(UUID, TEXT, TEXT, INT, UUID, TIMESTAMPTZ, INT);
--   DROP TABLE IF EXISTS public.front_page_pins;
--   DROP FUNCTION IF EXISTS public.front_page_pins_guard();
--   COMMIT;
-- Then confirm nothing is left:
--   SELECT to_regclass('public.front_page_pins') IS NULL AS table_gone,
--          to_regprocedure('public.front_pin(uuid,text,text,integer,uuid,timestamptz,integer)') IS NULL AS pin_gone;   -- true, true
