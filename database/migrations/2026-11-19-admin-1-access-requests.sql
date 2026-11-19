-- TimesPrime: Panel 1 (Administration), M1. People and their roles are managed in the app: a Super
-- Admin's change is a request that a second Super Admin decides (the matrix's A), a Managing Editor
-- grants up to Desk Editor in their own scope alone (S), and removing access takes one person.
-- Design: Panel 1's design in docs/PANEL_DOCS.md, §2 and §3, as approved on 19 Nov 2026.
--
-- The owner applies this in Dashboard -> SQL Editor (as postgres), after the Panel 0 files
-- (2026-11-02-access-*.sql). Steps and checks: docs/OPERATIONS.md, "Panel 1: applying admin-1".
-- Idempotent: the table is IF NOT EXISTS, functions are CREATE OR REPLACE, the index and triggers
-- are dropped before they are created, and the grants are restated. Safe to re-run.
--
-- What it guarantees, in the database, whatever the app does:
--   - a person holds at most one unrevoked row per role and scope, and one break-glass row beside it;
--   - break-glass is a Super Admin's own: started by themselves, only as super_admin, for at most 2
--     hours (access-1's CHECK), and it never counts as being a Super Admin for the two-admin rule;
--   - a request is decided once, never by the person who asked or the person it is about, never
--     after it lapses, and only by an active Super Admin; an approved change is made in the same
--     transaction as the decision;
--   - a renewal revokes the row it replaces in the same transaction as the new row;
--   - ending a person's sessions is possible only for a staff member, and only for the app's role.

BEGIN;

-- ---- One unrevoked row per person, role, scope, and break-glass or not ------------------------

DROP INDEX IF EXISTS public.role_assignments_one_active;
CREATE UNIQUE INDEX role_assignments_one_active
  ON public.role_assignments (user_id, role_key, COALESCE(language, '*'), COALESCE(section, '*'), is_break_glass)
  WHERE revoked_at IS NULL;

-- ---- A Super Admin, for the two-admin rule: never by a break-glass row --------------------------

CREATE OR REPLACE FUNCTION public.is_active_super_admin(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.role_assignments a
      JOIN public.staff_profiles p ON p.user_id = a.user_id
     WHERE a.user_id = p_user
       AND a.role_key = 'super_admin'
       AND NOT a.is_break_glass
       AND a.revoked_at IS NULL
       AND a.expires_at > now()
       AND p.status = 'active'
  );
$$;

-- ---- The guard: access-1's rules, and break-glass ----------------------------------------------
-- Unchanged from access-1 except the block marked "Break-glass".

CREATE OR REPLACE FUNCTION public.role_assignments_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_role public.roles;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'role_assignments: rows are history and are never deleted; revoke instead';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'role_assignments %: already revoked; rows are history', OLD.id;
    END IF;
    IF NEW.revoked_at IS NULL THEN
      RAISE EXCEPTION 'role_assignments %: an update may only revoke', OLD.id;
    END IF;
    IF (NEW.id, NEW.user_id, NEW.role_key, NEW.language, NEW.section, NEW.is_break_glass,
        NEW.granted_by, NEW.approved_by, NEW.reason, NEW.granted_at, NEW.expires_at)
       IS DISTINCT FROM
       (OLD.id, OLD.user_id, OLD.role_key, OLD.language, OLD.section, OLD.is_break_glass,
        OLD.granted_by, OLD.approved_by, OLD.reason, OLD.granted_at, OLD.expires_at) THEN
      RAISE EXCEPTION 'role_assignments %: only revoked_at, revoked_by and revoke_reason may change', OLD.id;
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT
  IF NEW.revoked_at IS NOT NULL OR NEW.revoked_by IS NOT NULL THEN
    RAISE EXCEPTION 'role_assignments: a new assignment cannot be revoked already';
  END IF;

  SELECT * INTO v_role FROM public.roles WHERE key = NEW.role_key;
  IF v_role.scope_required AND NEW.language IS NULL THEN
    RAISE EXCEPTION 'role_assignments: % must be granted for one language (en or hi)', NEW.role_key;
  END IF;

  -- Bootstrap (D4): the only grant without a granter. A Super Admin, a 'bootstrap:' reason, and
  -- the owner in the SQL editor. The app connects as service_role and cannot take this path.
  IF NEW.granted_by IS NULL AND NEW.approved_by IS NULL
     AND NEW.role_key = 'super_admin'
     AND NEW.reason LIKE 'bootstrap:%'
     AND NOT NEW.is_break_glass
     AND current_user = 'postgres' THEN
    RETURN NEW;
  END IF;

  IF NEW.granted_by IS NULL THEN
    RAISE EXCEPTION 'role_assignments: every grant names who granted it (granted_by)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff_profiles WHERE user_id = NEW.granted_by AND status = 'active') THEN
    RAISE EXCEPTION 'role_assignments: the granter is not an active staff member';
  END IF;

  -- Break-glass (Panel 1, §5): a Super Admin starts it for themselves, alone. Only as super_admin,
  -- granted by the person themself, who holds an active super_admin row that is not break-glass.
  -- The table's CHECK keeps it to 2 hours, and its reason is required.
  IF NEW.is_break_glass THEN
    IF NEW.role_key = 'super_admin' AND NEW.granted_by = NEW.user_id AND NEW.approved_by IS NULL
       AND public.is_active_super_admin(NEW.user_id) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'role_assignments: break-glass is a Super Admin''s own, started by themselves';
  END IF;

  -- Two admins for a privileged role (D3, D4). No single-admin mode exists.
  IF v_role.is_privileged THEN
    IF NEW.approved_by IS NULL OR NEW.approved_by = NEW.granted_by THEN
      RAISE EXCEPTION 'role_assignments: % is privileged and needs a second, different admin to approve', NEW.role_key;
    END IF;
    IF NOT public.is_active_super_admin(NEW.granted_by) OR NOT public.is_active_super_admin(NEW.approved_by) THEN
      RAISE EXCEPTION 'role_assignments: % is granted and approved only by active Super Admins', NEW.role_key;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---- access_requests: the matrix's A for Super Admins ------------------------------------------

CREATE TABLE IF NOT EXISTS public.access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('add_person', 'grant', 'renew', 'reactivate', 'rename', 'password_link', 'mfa_reset')),
  -- Who the request is about. NULL only for add_person, until the person's account exists.
  user_id UUID NULL REFERENCES public.staff_profiles (user_id),
  -- What is asked: role, language, section, days, assignment_id, display_name, email.
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
  requested_by UUID NOT NULL REFERENCES public.staff_profiles (user_id),
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  lapses_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now() + interval '72 hours',
  decided_by UUID NULL REFERENCES public.staff_profiles (user_id),
  decided_at TIMESTAMP WITH TIME ZONE NULL,
  outcome TEXT NULL CHECK (outcome IN ('approved', 'declined', 'cancelled')),
  note TEXT NULL,
  CHECK (lapses_at > requested_at),
  CHECK ((decided_at IS NULL) = (outcome IS NULL) AND (decided_at IS NULL) = (decided_by IS NULL)),
  CHECK (kind = 'add_person' OR user_id IS NOT NULL),
  -- Nobody acts on their own access (design §3).
  CHECK (requested_by IS DISTINCT FROM user_id),
  CHECK (outcome = 'cancelled' OR decided_by IS NULL OR (decided_by <> requested_by AND decided_by IS DISTINCT FROM user_id)),
  CHECK (outcome IS DISTINCT FROM 'cancelled' OR decided_by = requested_by)
);

CREATE INDEX IF NOT EXISTS access_requests_open ON public.access_requests (requested_at) WHERE decided_at IS NULL;
CREATE INDEX IF NOT EXISTS access_requests_user ON public.access_requests (user_id);

-- Decided once, never edited after, never deleted. An open request may only be decided: the
-- decision's columns, and the person's id once an added person's account exists.
CREATE OR REPLACE FUNCTION public.access_requests_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'access_requests: requests are history and are never deleted';
  END IF;
  IF OLD.decided_at IS NOT NULL THEN
    RAISE EXCEPTION 'access_requests %: already decided', OLD.id;
  END IF;
  IF (NEW.id, NEW.kind, NEW.details, NEW.reason, NEW.requested_by, NEW.requested_at, NEW.lapses_at)
     IS DISTINCT FROM
     (OLD.id, OLD.kind, OLD.details, OLD.reason, OLD.requested_by, OLD.requested_at, OLD.lapses_at) THEN
    RAISE EXCEPTION 'access_requests %: only the decision may change', OLD.id;
  END IF;
  IF OLD.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'access_requests %: the person a request is about cannot change', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS access_requests_guard ON public.access_requests;
CREATE TRIGGER access_requests_guard
  BEFORE UPDATE OR DELETE ON public.access_requests
  FOR EACH ROW EXECUTE FUNCTION public.access_requests_guard();

DROP TRIGGER IF EXISTS access_requests_no_truncate ON public.access_requests;
CREATE TRIGGER access_requests_no_truncate
  BEFORE TRUNCATE ON public.access_requests
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_change();

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- ---- access_grant: a grant, or a renewal, in one transaction ------------------------------------
-- Inserts the assignment. With p_replaces, it first revokes that row ('renewed'); without it, it
-- first revokes an expired, unrevoked row for the same person, role and scope ('expired'), which
-- the one-row index would otherwise refuse. The guard trigger then checks the grant itself.

CREATE OR REPLACE FUNCTION public.access_grant(
  p_user UUID, p_role TEXT, p_language TEXT, p_section TEXT, p_days INT, p_reason TEXT,
  p_granted_by UUID, p_approved_by UUID, p_replaces UUID
)
RETURNS public.role_assignments
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  old public.role_assignments;
  made public.role_assignments;
  v_by UUID := coalesce(p_approved_by, p_granted_by);
BEGIN
  IF p_days IS NULL OR p_days < 1 OR p_days > 365 THEN
    RAISE EXCEPTION 'access: an assignment lasts 1 to 365 days, not %', p_days USING ERRCODE = 'check_violation';
  END IF;
  IF p_user = p_granted_by OR p_user = p_approved_by THEN
    RAISE EXCEPTION 'access: nobody grants or renews their own role' USING ERRCODE = 'check_violation';
  END IF;

  IF p_replaces IS NOT NULL THEN
    SELECT * INTO old FROM public.role_assignments WHERE id = p_replaces FOR UPDATE;
    IF NOT FOUND OR old.user_id <> p_user OR old.role_key <> p_role
       OR old.language IS DISTINCT FROM p_language OR old.section IS DISTINCT FROM p_section OR old.is_break_glass THEN
      RAISE EXCEPTION 'access: assignment % is not this person''s % in this scope', p_replaces, p_role USING ERRCODE = 'no_data_found';
    END IF;
    IF old.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'access: assignment % was revoked; grant the role again instead', p_replaces USING ERRCODE = 'serialization_failure';
    END IF;
    UPDATE public.role_assignments SET revoked_at = now(), revoked_by = v_by, revoke_reason = 'renewed'
     WHERE id = p_replaces;
  ELSE
    UPDATE public.role_assignments SET revoked_at = now(), revoked_by = v_by, revoke_reason = 'expired'
     WHERE user_id = p_user AND role_key = p_role AND NOT is_break_glass AND revoked_at IS NULL
       AND language IS NOT DISTINCT FROM p_language AND section IS NOT DISTINCT FROM p_section
       AND expires_at <= now();
  END IF;

  INSERT INTO public.role_assignments (user_id, role_key, language, section, granted_by, approved_by, reason, expires_at)
  VALUES (p_user, p_role, p_language, p_section, p_granted_by, p_approved_by, p_reason,
          now() + make_interval(days => p_days))
  RETURNING * INTO made;
  RETURN made;
END;
$$;

-- ---- access_decide: a decision, and an approved change, in one transaction ----------------------
-- approved or declined: by an active Super Admin who neither asked nor is the person it is about,
-- before it lapses; approved, the person who asked must still be a Super Admin. cancelled: by the
-- person who asked. For add_person, p_user is the account the app made in Supabase Auth first.
-- password_link and mfa_reset change nothing here: the app changes the Supabase account first.

CREATE OR REPLACE FUNCTION public.access_decide(
  p_request UUID, p_decider UUID, p_outcome TEXT, p_note TEXT, p_user UUID
)
RETURNS public.access_requests
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  r public.access_requests;
  v_user UUID;
BEGIN
  IF p_outcome NOT IN ('approved', 'declined', 'cancelled') THEN
    RAISE EXCEPTION 'access: a decision is approved, declined or cancelled, not %', p_outcome USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO r FROM public.access_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'access: request % not found', p_request USING ERRCODE = 'no_data_found';
  END IF;
  IF r.decided_at IS NOT NULL THEN
    RAISE EXCEPTION 'access: request % is already decided', p_request USING ERRCODE = 'serialization_failure';
  END IF;

  IF p_outcome = 'cancelled' THEN
    IF p_decider <> r.requested_by THEN
      RAISE EXCEPTION 'access: only the person who asked cancels a request' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF p_decider = r.requested_by OR p_decider = r.user_id THEN
      RAISE EXCEPTION 'access: someone other than the person who asked, and the person it is about, decides' USING ERRCODE = 'check_violation';
    END IF;
    IF r.lapses_at <= now() THEN
      RAISE EXCEPTION 'access: request % has lapsed; ask again', p_request USING ERRCODE = 'serialization_failure';
    END IF;
    IF NOT public.is_active_super_admin(p_decider) THEN
      RAISE EXCEPTION 'access: only an active Super Admin decides a request' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_user := coalesce(r.user_id, p_user);
  IF p_outcome = 'approved' THEN
    IF NOT public.is_active_super_admin(r.requested_by) THEN
      RAISE EXCEPTION 'access: the person who asked is no longer a Super Admin; ask again' USING ERRCODE = 'serialization_failure';
    END IF;
    IF r.kind = 'add_person' THEN
      IF v_user IS NULL THEN
        RAISE EXCEPTION 'access: an added person needs their account first' USING ERRCODE = 'check_violation';
      END IF;
      IF v_user = p_decider THEN
        RAISE EXCEPTION 'access: someone other than the person it is about decides' USING ERRCODE = 'check_violation';
      END IF;
      INSERT INTO public.staff_profiles (user_id, display_name, status, mfa_required, created_by)
      VALUES (v_user, r.details->>'display_name', 'active', true, r.requested_by)
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
  END IF;

  UPDATE public.access_requests
     SET decided_by = p_decider, decided_at = now(), outcome = p_outcome, note = p_note, user_id = v_user
   WHERE id = p_request
  RETURNING * INTO r;

  IF p_outcome = 'approved' THEN
    CASE r.kind
      WHEN 'add_person', 'grant' THEN
        PERFORM public.access_grant(v_user, r.details->>'role', r.details->>'language', r.details->>'section',
                                    (r.details->>'days')::INT, r.reason, r.requested_by, p_decider, NULL);
      WHEN 'renew' THEN
        PERFORM public.access_grant(v_user, r.details->>'role', r.details->>'language', r.details->>'section',
                                    (r.details->>'days')::INT, r.reason, r.requested_by, p_decider,
                                    (r.details->>'assignment_id')::UUID);
      WHEN 'reactivate' THEN
        UPDATE public.staff_profiles SET status = 'active' WHERE user_id = v_user;
      WHEN 'rename' THEN
        UPDATE public.staff_profiles SET display_name = r.details->>'display_name' WHERE user_id = v_user;
      ELSE
        NULL; -- password_link, mfa_reset: the Supabase account, changed by the app
    END CASE;
  END IF;
  RETURN r;
END;
$$;

-- ---- staff_end_sessions: sign a staff member out everywhere --------------------------------------
-- Supabase's own sign-out needs the person's token, so it cannot sign out someone else. Deleting
-- their sessions removes their refresh tokens with them, and the app's next getUser() for an old
-- token fails, so every request after this one is refused (staffSession.ts). SECURITY DEFINER,
-- because the app's role has no rights on Supabase's auth schema; it touches one person's sessions,
-- and only a staff member's. Returns how many sessions ended.

CREATE OR REPLACE FUNCTION public.staff_end_sessions(p_user UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  n INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.staff_profiles WHERE user_id = p_user) THEN
    RAISE EXCEPTION 'access: % is not a staff member', p_user USING ERRCODE = 'check_violation';
  END IF;
  DELETE FROM auth.sessions WHERE user_id = p_user;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ---- Grants -------------------------------------------------------------------------------------
-- Supabase's default privileges grant everything on a new public table to anon, authenticated and
-- service_role (desk-6's lesson): start from nothing. The app reads, asks and decides; a decided
-- request is never edited (the trigger) and nothing is deleted.
REVOKE ALL ON public.access_requests FROM anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.access_requests TO service_role;

REVOKE ALL ON FUNCTION public.access_grant(UUID, TEXT, TEXT, TEXT, INT, TEXT, UUID, UUID, UUID),
                       public.access_decide(UUID, UUID, TEXT, TEXT, UUID),
                       public.staff_end_sessions(UUID),
                       public.access_requests_guard(),
                       public.is_active_super_admin(UUID),
                       public.role_assignments_guard()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.access_grant(UUID, TEXT, TEXT, TEXT, INT, TEXT, UUID, UUID, UUID),
                          public.access_decide(UUID, UUID, TEXT, TEXT, UUID),
                          public.staff_end_sessions(UUID),
                          public.is_active_super_admin(UUID)
  TO service_role;

COMMIT;

-- ---- Verify (one query; expect true, false, false, true, false, true) --------------------------
--   SELECT (SELECT indexdef LIKE '%is_break_glass%' FROM pg_indexes
--            WHERE schemaname = 'public' AND indexname = 'role_assignments_one_active') AS index_has_break_glass,
--          has_table_privilege('authenticated', 'public.access_requests', 'SELECT') AS users_read_requests,
--          has_table_privilege('service_role', 'public.access_requests', 'DELETE') AS app_deletes_requests,
--          has_function_privilege('service_role', 'public.staff_end_sessions(uuid)', 'EXECUTE') AS app_ends_sessions,
--          has_function_privilege('authenticated', 'public.access_decide(uuid,uuid,text,text,uuid)', 'EXECUTE') AS users_decide,
--          has_table_privilege((SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE proname = 'staff_end_sessions'),
--                              'auth.sessions', 'DELETE') AS function_can_end_sessions;
--
-- ---- Rollback: before the first request or break-glass row --------------------------------------
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.access_decide(UUID, UUID, TEXT, TEXT, UUID),
--                           public.access_grant(UUID, TEXT, TEXT, TEXT, INT, TEXT, UUID, UUID, UUID),
--                           public.staff_end_sessions(UUID);
--   DROP TABLE IF EXISTS public.access_requests;
--   DROP FUNCTION IF EXISTS public.access_requests_guard();
--   DROP INDEX IF EXISTS public.role_assignments_one_active;
--   CREATE UNIQUE INDEX role_assignments_one_active
--     ON public.role_assignments (user_id, role_key, COALESCE(language, '*'), COALESCE(section, '*'))
--     WHERE revoked_at IS NULL;
--   COMMIT;
-- Then run is_active_super_admin and role_assignments_guard from 2026-11-02-access-1-foundation.sql
-- again (only those two CREATE OR REPLACE FUNCTION statements) to put back their access-1 bodies.
