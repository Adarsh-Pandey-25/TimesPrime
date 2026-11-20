-- TimesPrime: Panel 7 (Compliance), M1. Grievances: a reader's complaint gets a ticket at once and a
-- decision within 15 days (the IT Rules, Part III); the Grievance Officer's queue keeps the clocks.
-- Design: Panel 7's design in docs/PANEL_DOCS.md, §2 and §3 (decisions 1 to 5).
--
-- The owner applies this in Dashboard -> SQL Editor (as postgres), AFTER Panel 0's
-- 2026-11-02-access-1-foundation.sql (public.staff_profiles, public.reject_change()) and Panel 2's
-- 2026-11-17-desk-1-stories.sql (public.stories). The catalogue does not change: grievance.handle is
-- in it since Panel 0. Steps, the check and the rollback: docs/OPERATIONS.md, Runbooks.
-- Idempotent: the sequence, tables and indexes are IF NOT EXISTS, functions are CREATE OR REPLACE,
-- triggers are dropped before they are created, and the grants are restated in full. Safe to re-run.
--
-- What it guarantees, in the database, whatever the app does:
--   - a grievance is history: it is never deleted; what the complainant sent, when it arrived and
--     its two clocks (24 hours to acknowledge, 15 days to decide) never change; an acknowledgement
--     stands; a decided grievance is final, with its outcome and the reply told to the complainant;
--   - a grievance from the form is acknowledged on the spot, and one typed in by the officer (from
--     an email or a letter) names who typed it in and who acknowledged it;
--   - the notes on a grievance are append-only;
--   - readers (anon) reach grievances only through two functions (decision 1): grievance_submit
--     sends one, at most 500 a day from the form across the site; grievance_status shows one's
--     state and decision to whoever has both its ticket and its email. They read no table.
--
-- The app reads and writes as service_role, which bypasses RLS. Its gate is requirePermission
-- (packages/server/src/auth); RLS here protects direct reads with the anon key.

BEGIN;

-- ---- tickets: G-<year in IST>-<running number> ----------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS public.grievance_tickets;

-- The ticket of a grievance received at p_at: its year in India, and the next number.
CREATE OR REPLACE FUNCTION public.grievance_ticket(p_at TIMESTAMPTZ)
RETURNS TEXT
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT 'G-' || to_char(p_at AT TIME ZONE 'Asia/Kolkata', 'YYYY') || '-' || lpad(nextval('public.grievance_tickets')::text, 5, '0');
$$;

-- ---- grievances ---------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.grievances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket TEXT NOT NULL UNIQUE CHECK (ticket ~ '^G-[0-9]{4}-[0-9]{5,}$'),
  channel TEXT NOT NULL CHECK (channel IN ('web', 'email', 'post', 'other')),
  language TEXT NOT NULL CHECK (language IN ('en', 'hi')),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0 AND char_length(name) <= 120),
  email TEXT NOT NULL CHECK (char_length(email) <= 254 AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  about_url TEXT NULL CHECK (about_url IS NULL OR (length(trim(about_url)) > 0 AND char_length(about_url) <= 500)),
  story_id UUID NULL REFERENCES public.stories (id),
  category TEXT NOT NULL CHECK (category IN ('factual_error', 'defamation_privacy', 'obscene_harmful', 'copyright', 'other')),
  body TEXT NOT NULL CHECK (length(trim(body)) > 0 AND char_length(body) <= 5000),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  entered_by UUID NULL REFERENCES public.staff_profiles (user_id),
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ack_due_at TIMESTAMPTZ NOT NULL,
  decide_due_at TIMESTAMPTZ NOT NULL,
  acknowledged_at TIMESTAMPTZ NULL,
  acknowledged_by UUID NULL REFERENCES public.staff_profiles (user_id),
  assigned_to UUID NULL REFERENCES public.staff_profiles (user_id),
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'decided')),
  outcome TEXT NULL CHECK (outcome IS NULL OR outcome IN ('upheld', 'partly_upheld', 'not_upheld', 'outside_scope', 'withdrawn', 'duplicate', 'spam')),
  reply TEXT NULL CHECK (reply IS NULL OR (length(trim(reply)) > 0 AND char_length(reply) <= 5000)),
  decided_by UUID NULL REFERENCES public.staff_profiles (user_id),
  decided_at TIMESTAMPTZ NULL,
  -- The form's grievances are the readers' own; every other one was typed in by a named officer.
  CONSTRAINT grievances_entered_by CHECK ((channel = 'web') = (entered_by IS NULL)),
  CONSTRAINT grievances_received_before_entered CHECK (received_at <= entered_at),
  CONSTRAINT grievances_clocks CHECK (ack_due_at = received_at + interval '24 hours' AND decide_due_at = received_at + interval '15 days'),
  -- The form acknowledges on the spot; an officer's acknowledgement names them.
  CONSTRAINT grievances_web_acknowledged CHECK (channel <> 'web' OR (acknowledged_at IS NOT NULL AND acknowledged_by IS NULL)),
  CONSTRAINT grievances_acknowledged_by CHECK (channel = 'web' OR (acknowledged_at IS NULL) = (acknowledged_by IS NULL)),
  CONSTRAINT grievances_decided_together CHECK (
    (state = 'decided') = (outcome IS NOT NULL)
    AND (outcome IS NULL) = (reply IS NULL)
    AND (outcome IS NULL) = (decided_by IS NULL)
    AND (outcome IS NULL) = (decided_at IS NULL)
  ),
  CONSTRAINT grievances_decided_acknowledged CHECK (state <> 'decided' OR acknowledged_at IS NOT NULL)
);

-- The queue: open ones by their decision's due time; decided ones newest first; a story's grievances;
-- the form's daily limit.
CREATE INDEX IF NOT EXISTS grievances_open ON public.grievances (decide_due_at) WHERE state = 'open';
CREATE INDEX IF NOT EXISTS grievances_decided ON public.grievances (decided_at DESC) WHERE state = 'decided';
CREATE INDEX IF NOT EXISTS grievances_received ON public.grievances (received_at DESC);
CREATE INDEX IF NOT EXISTS grievances_story ON public.grievances (story_id) WHERE story_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS grievances_web_received ON public.grievances (received_at) WHERE channel = 'web';

-- ---- history: never deleted; what was sent and its clocks never change; a decision is final -------

CREATE OR REPLACE FUNCTION public.grievances_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'grievances: DELETE is not allowed; a grievance is decided, never deleted';
  END IF;
  IF OLD.state = 'decided' THEN
    RAISE EXCEPTION 'grievances: grievance % is decided', OLD.ticket;
  END IF;
  IF (NEW.id, NEW.ticket, NEW.channel, NEW.language, NEW.name, NEW.email, NEW.about_url, NEW.story_id, NEW.category,
      NEW.body, NEW.received_at, NEW.entered_by, NEW.entered_at, NEW.ack_due_at, NEW.decide_due_at)
     IS DISTINCT FROM
     (OLD.id, OLD.ticket, OLD.channel, OLD.language, OLD.name, OLD.email, OLD.about_url, OLD.story_id, OLD.category,
      OLD.body, OLD.received_at, OLD.entered_by, OLD.entered_at, OLD.ack_due_at, OLD.decide_due_at) THEN
    RAISE EXCEPTION 'grievances: what was sent, when it arrived and its clocks never change';
  END IF;
  IF OLD.acknowledged_at IS NOT NULL
     AND (NEW.acknowledged_at, NEW.acknowledged_by) IS DISTINCT FROM (OLD.acknowledged_at, OLD.acknowledged_by) THEN
    RAISE EXCEPTION 'grievances: grievance % was already acknowledged', OLD.ticket;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grievances_guard ON public.grievances;
CREATE TRIGGER grievances_guard
  BEFORE UPDATE OR DELETE ON public.grievances
  FOR EACH ROW EXECUTE FUNCTION public.grievances_guard();

DROP TRIGGER IF EXISTS grievances_no_truncate ON public.grievances;
CREATE TRIGGER grievances_no_truncate
  BEFORE TRUNCATE ON public.grievances
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_change();

-- ---- grievance_notes: the officers' internal notes, append-only ----------------------------------

CREATE TABLE IF NOT EXISTS public.grievance_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grievance_id UUID NOT NULL REFERENCES public.grievances (id),
  body TEXT NOT NULL CHECK (length(trim(body)) > 0 AND char_length(body) <= 2000),
  author_id UUID NOT NULL REFERENCES public.staff_profiles (user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS grievance_notes_grievance ON public.grievance_notes (grievance_id, created_at);

DROP TRIGGER IF EXISTS grievance_notes_append_only ON public.grievance_notes;
CREATE TRIGGER grievance_notes_append_only
  BEFORE UPDATE OR DELETE ON public.grievance_notes
  FOR EACH ROW EXECUTE FUNCTION public.reject_change();

DROP TRIGGER IF EXISTS grievance_notes_no_truncate ON public.grievance_notes;
CREATE TRIGGER grievance_notes_no_truncate
  BEFORE TRUNCATE ON public.grievance_notes
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_change();

-- ---- the readers' two functions (decision 1) ------------------------------------------------------
-- SECURITY DEFINER: they run as their owner, so readers need no right on the tables. The reader site
-- checks every field and limits each address first (packages/shared/src/config/grievances.ts); these
-- repeat what the table refuses, and hold the form to 500 a day across the site whoever calls them.

-- Sends a grievance from the form. The story is kept only when it is published. Returns its ticket,
-- when it arrived and when the decision is due.
CREATE OR REPLACE FUNCTION public.grievance_submit(
  p_language TEXT, p_name TEXT, p_email TEXT, p_about_url TEXT, p_story UUID, p_category TEXT, p_body TEXT
)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  g public.grievances;
  v_story UUID := NULL;
BEGIN
  IF (SELECT count(*) FROM public.grievances x WHERE x.channel = 'web' AND x.received_at > now() - interval '24 hours') >= 500 THEN
    RAISE EXCEPTION 'grievance_submit: the form takes at most 500 grievances a day' USING ERRCODE = 'program_limit_exceeded';
  END IF;
  IF p_story IS NOT NULL AND EXISTS (SELECT 1 FROM public.stories s WHERE s.id = p_story AND s.workflow_state = 'published') THEN
    v_story := p_story;
  END IF;
  INSERT INTO public.grievances (ticket, channel, language, name, email, about_url, story_id, category, body,
                                 received_at, entered_at, ack_due_at, decide_due_at, acknowledged_at)
  VALUES (public.grievance_ticket(now()), 'web', p_language, trim(p_name), trim(p_email), nullif(trim(p_about_url), ''),
          v_story, p_category, trim(p_body), now(), now(), now() + interval '24 hours', now() + interval '15 days', now())
  RETURNING * INTO g;
  RETURN jsonb_build_object('ticket', g.ticket, 'received_at', g.received_at, 'decide_due_at', g.decide_due_at);
END;
$$;

-- A grievance's state and decision, for whoever has its ticket and its email; NULL for any other
-- pair, so a wrong email and an unknown ticket answer alike.
CREATE OR REPLACE FUNCTION public.grievance_status(p_ticket TEXT, p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  g public.grievances;
BEGIN
  SELECT * INTO g FROM public.grievances x
   WHERE x.ticket = upper(trim(p_ticket)) AND lower(x.email) = lower(trim(p_email));
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'ticket', g.ticket, 'state', g.state, 'received_at', g.received_at, 'acknowledged_at', g.acknowledged_at,
    'decide_due_at', g.decide_due_at, 'outcome', g.outcome, 'reply', g.reply, 'decided_at', g.decided_at
  );
END;
$$;

-- ---- the officers' writes, each in one transaction ------------------------------------------------
-- The app decides who may act (grievance.handle, site-wide) and checks every field first; these make
-- each change atomic, lock the grievance's row, and refuse a grievance in the wrong state.

-- A grievance that arrived by email, post or another way, typed in by an officer. Its clocks run from
-- when it arrived. p_acknowledged: the officer has already acknowledged it.
CREATE OR REPLACE FUNCTION public.grievance_enter(
  p_actor UUID, p_channel TEXT, p_language TEXT, p_name TEXT, p_email TEXT, p_about_url TEXT, p_story UUID,
  p_category TEXT, p_body TEXT, p_received_at TIMESTAMPTZ, p_acknowledged BOOLEAN
)
RETURNS public.grievances
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  g public.grievances;
  v_at TIMESTAMPTZ := coalesce(p_received_at, now());
BEGIN
  IF p_channel IS NULL OR p_channel NOT IN ('email', 'post', 'other') THEN
    RAISE EXCEPTION 'grievance_enter: an officer enters a grievance received by email, post or another way' USING ERRCODE = 'check_violation';
  END IF;
  IF v_at > now() THEN
    RAISE EXCEPTION 'grievance_enter: a grievance cannot arrive in the future' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.grievances (ticket, channel, language, name, email, about_url, story_id, category, body,
                                 received_at, entered_by, entered_at, ack_due_at, decide_due_at,
                                 acknowledged_at, acknowledged_by)
  VALUES (public.grievance_ticket(v_at), p_channel, p_language, trim(p_name), trim(p_email), nullif(trim(p_about_url), ''),
          p_story, p_category, trim(p_body), v_at, p_actor, now(), v_at + interval '24 hours', v_at + interval '15 days',
          CASE WHEN coalesce(p_acknowledged, false) THEN now() END,
          CASE WHEN coalesce(p_acknowledged, false) THEN p_actor END)
  RETURNING * INTO g;
  RETURN g;
END;
$$;

-- The officer has acknowledged a grievance that arrived by email, post or another way.
CREATE OR REPLACE FUNCTION public.grievance_acknowledge(p_grievance UUID, p_actor UUID)
RETURNS public.grievances
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  g public.grievances;
BEGIN
  SELECT * INTO g FROM public.grievances WHERE id = p_grievance FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'grievance_acknowledge: grievance % not found', p_grievance USING ERRCODE = 'no_data_found';
  END IF;
  IF g.state <> 'open' OR g.acknowledged_at IS NOT NULL THEN
    RAISE EXCEPTION 'grievance_acknowledge: grievance % was already acknowledged', g.ticket USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  UPDATE public.grievances SET acknowledged_at = now(), acknowledged_by = p_actor WHERE id = p_grievance RETURNING * INTO g;
  RETURN g;
END;
$$;

-- Who handles an open grievance: an active staff member.
CREATE OR REPLACE FUNCTION public.grievance_assign(p_grievance UUID, p_actor UUID, p_assignee UUID)
RETURNS public.grievances
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  g public.grievances;
BEGIN
  SELECT * INTO g FROM public.grievances WHERE id = p_grievance FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'grievance_assign: grievance % not found', p_grievance USING ERRCODE = 'no_data_found';
  END IF;
  IF g.state <> 'open' THEN
    RAISE EXCEPTION 'grievance_assign: grievance % is decided', g.ticket USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff_profiles p WHERE p.user_id = p_assignee AND p.status = 'active') THEN
    RAISE EXCEPTION 'grievance_assign: % is not an active staff member', p_assignee USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.grievances SET assigned_to = p_assignee WHERE id = p_grievance RETURNING * INTO g;
  RETURN g;
END;
$$;

-- An internal note, at any time (also after the decision: an appeal, a follow-up).
CREATE OR REPLACE FUNCTION public.grievance_note(p_grievance UUID, p_actor UUID, p_body TEXT)
RETURNS public.grievance_notes
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  n public.grievance_notes;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.grievances WHERE id = p_grievance) THEN
    RAISE EXCEPTION 'grievance_note: grievance % not found', p_grievance USING ERRCODE = 'no_data_found';
  END IF;
  INSERT INTO public.grievance_notes (grievance_id, body, author_id) VALUES (p_grievance, trim(p_body), p_actor) RETURNING * INTO n;
  RETURN n;
END;
$$;

-- Decides an open grievance: its outcome and the reply told to the complainant. Final. A grievance
-- not yet acknowledged is acknowledged by the decision.
CREATE OR REPLACE FUNCTION public.grievance_decide(p_grievance UUID, p_actor UUID, p_outcome TEXT, p_reply TEXT)
RETURNS public.grievances
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  g public.grievances;
BEGIN
  SELECT * INTO g FROM public.grievances WHERE id = p_grievance FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'grievance_decide: grievance % not found', p_grievance USING ERRCODE = 'no_data_found';
  END IF;
  IF g.state <> 'open' THEN
    RAISE EXCEPTION 'grievance_decide: grievance % is decided', g.ticket USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  UPDATE public.grievances
     SET state = 'decided', outcome = p_outcome, reply = trim(p_reply), decided_by = p_actor, decided_at = now(),
         acknowledged_at = coalesce(acknowledged_at, now()),
         acknowledged_by = CASE WHEN acknowledged_at IS NULL THEN p_actor ELSE acknowledged_by END
   WHERE id = p_grievance
  RETURNING * INTO g;
  RETURN g;
END;
$$;

-- ---- RLS, grants -----------------------------------------------------------------------------------

ALTER TABLE public.grievances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grievance_notes ENABLE ROW LEVEL SECURITY;

-- Supabase's default privileges grant everything on new public tables and sequences. Start from nothing.
REVOKE ALL ON public.grievances, public.grievance_notes FROM anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.grievance_tickets FROM PUBLIC, anon, authenticated, service_role;

-- The app (service_role): read, enter and decide grievances, read and add notes; never DELETE (the
-- guards refuse it too). Readers get no right on either table, and no policy: decision 1.
GRANT SELECT, INSERT, UPDATE ON public.grievances TO service_role;
GRANT SELECT, INSERT ON public.grievance_notes TO service_role;
GRANT USAGE ON SEQUENCE public.grievance_tickets TO service_role;

-- Functions: Supabase exposes public functions as RPC to anon and authenticated by default.
REVOKE ALL ON FUNCTION
  public.grievance_ticket(TIMESTAMPTZ),
  public.grievances_guard(),
  public.grievance_submit(TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT),
  public.grievance_status(TEXT, TEXT),
  public.grievance_enter(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN),
  public.grievance_acknowledge(UUID, UUID),
  public.grievance_assign(UUID, UUID, UUID),
  public.grievance_note(UUID, UUID, TEXT),
  public.grievance_decide(UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
-- Readers: the two functions only.
GRANT EXECUTE ON FUNCTION
  public.grievance_submit(TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT),
  public.grievance_status(TEXT, TEXT)
  TO anon, service_role;
GRANT EXECUTE ON FUNCTION
  public.grievance_ticket(TIMESTAMPTZ),
  public.grievance_enter(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN),
  public.grievance_acknowledge(UUID, UUID),
  public.grievance_assign(UUID, UUID, UUID),
  public.grievance_note(UUID, UUID, TEXT),
  public.grievance_decide(UUID, UUID, TEXT, TEXT)
  TO service_role;

COMMIT;

-- ---- Verify (one query; expect true, true, false, false, false, true, true, false, true, 0) --------
--   SELECT (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'grievances') AS rls_on,
--          (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'grievance_notes') AS notes_rls_on,
--          has_table_privilege('service_role', 'public.grievances', 'DELETE') AS app_can_delete,
--          has_table_privilege('anon', 'public.grievances', 'SELECT') AS readers_can_read,
--          has_table_privilege('anon', 'public.grievance_notes', 'SELECT') AS readers_can_read_notes,
--          has_function_privilege('anon', 'public.grievance_submit(text,text,text,text,uuid,text,text)', 'EXECUTE') AS readers_can_send,
--          has_function_privilege('anon', 'public.grievance_status(text,text)', 'EXECUTE') AS readers_can_ask,
--          has_function_privilege('anon', 'public.grievance_decide(uuid,uuid,text,text)', 'EXECUTE') AS readers_can_decide,
--          has_function_privilege('service_role', 'public.grievance_decide(uuid,uuid,text,text)', 'EXECUTE') AS app_can_decide,
--          (SELECT count(*) FROM public.grievances) AS grievances;
--
-- ---- Rollback: before the first grievance ---------------------------------------------------------
-- Grievances are a legal record (the 15-day duty, the monthly report). Once the first one arrives,
-- the tables are kept. Before that, this undoes the file:
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.grievance_decide(UUID, UUID, TEXT, TEXT), public.grievance_note(UUID, UUID, TEXT),
--                           public.grievance_assign(UUID, UUID, UUID), public.grievance_acknowledge(UUID, UUID),
--                           public.grievance_enter(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN),
--                           public.grievance_status(TEXT, TEXT),
--                           public.grievance_submit(TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT);
--   DROP TABLE IF EXISTS public.grievance_notes;
--   DROP TABLE IF EXISTS public.grievances;
--   DROP FUNCTION IF EXISTS public.grievances_guard(), public.grievance_ticket(TIMESTAMPTZ);
--   DROP SEQUENCE IF EXISTS public.grievance_tickets;
--   COMMIT;
-- Then confirm nothing is left:
--   SELECT to_regclass('public.grievances') IS NULL AS table_gone,
--          to_regclass('public.grievance_notes') IS NULL AS notes_gone,
--          to_regclass('public.grievance_tickets') IS NULL AS sequence_gone;   -- true, true, true
