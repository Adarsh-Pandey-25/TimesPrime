-- TimesPrime: Panel 0, the access foundation. Staff accounts, roles, permissions, role assignments,
-- and the append-only audit log. Design: docs/design/panel-0-access-foundation.md §1 and §6.
--
-- The owner applies this in Dashboard -> SQL Editor (as postgres), BEFORE deploying Panel 0, then
-- 2026-11-02-access-2-catalog.sql. Steps, checks and rollback: docs/runbooks/apply-database.md.
-- Idempotent: tables and indexes are IF NOT EXISTS, functions are CREATE OR REPLACE, triggers are
-- dropped before they are created, and the grants are restated in full. Safe to re-run.
--
-- What it guarantees, in the database, whatever the app does:
--   - no grant to anon or authenticated on any of these tables: a staff member's own Supabase token
--     reaches none of them through PostgREST;
--   - the app (service_role) can never update, delete or truncate audit_log, and every row is chained
--     to the one before it (prev_hash, row_hash), so an edit or a deletion is detectable;
--   - a privileged role is granted only by two different, active Super Admins; the one exception is
--     a 'bootstrap:' Super Admin grant made as postgres in the SQL editor (owner decision D4);
--   - role assignments are history: never deleted, and an update may only revoke.
--
-- The app reads and writes these tables as service_role, which bypasses RLS. RLS is enabled here so
-- that nothing else gets in; it is not the app's gate. The app's gate is requirePermission
-- (packages/server/src/auth), tested on every admin route (design, "Approval").

BEGIN;

-- ---- staff_profiles: a row here is what makes an auth user staff -------------------------------

CREATE TABLE IF NOT EXISTS public.staff_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL CHECK (length(btrim(display_name)) > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  -- Q1: every staff member uses a second factor unless the owner turns it off for one person.
  mfa_required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- NULL only for a bootstrap row (database/bootstrap/super-admin.sql).
  created_by UUID NULL,
  last_sign_in_at TIMESTAMP WITH TIME ZONE NULL
);

-- ---- the catalogue: seeded by 2026-11-02-access-2-catalog.sql from the plan's matrix -----------

CREATE TABLE IF NOT EXISTS public.roles (
  key TEXT PRIMARY KEY CHECK (key ~ '^[a-z_]+$'),
  label TEXT NOT NULL,
  is_privileged BOOLEAN NOT NULL DEFAULT false,   -- granting it needs two admins (D3)
  requires_aal2 BOOLEAN NOT NULL DEFAULT false,   -- an assignment counts only in an aal2 session (D3)
  scope_required BOOLEAN NOT NULL DEFAULT false,  -- an assignment must name a language
  phase SMALLINT NOT NULL CHECK (phase BETWEEN 1 AND 4)
);

CREATE TABLE IF NOT EXISTS public.permissions (
  key TEXT PRIMARY KEY CHECK (key ~ '^[a-z_]+\.[a-z_]+$'),
  matrix_row TEXT NOT NULL,
  risk TEXT NOT NULL CHECK (risk IN ('low', 'high', 'critical')),
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_key TEXT NOT NULL REFERENCES public.roles (key) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES public.permissions (key) ON DELETE CASCADE,
  access TEXT NOT NULL CHECK (access IN ('F', 'S', 'Own', 'A', 'R', 'M')),
  break_glass_only BOOLEAN NOT NULL DEFAULT false,
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (role_key, permission_key)
);

-- ---- role_assignments: one person, one role, one scope, with an expiry -------------------------

CREATE TABLE IF NOT EXISTS public.role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.staff_profiles (user_id) ON DELETE RESTRICT,
  role_key TEXT NOT NULL REFERENCES public.roles (key) ON DELETE RESTRICT,
  -- Scope: NULL means all. Languages are en/hi here; articles keep english/hindi (D5).
  language TEXT NULL CHECK (language IN ('en', 'hi')),
  -- A category key, matched against an article's category[0] (D6, ADR 0003).
  section TEXT NULL CHECK (section ~ '^[a-z_]+$'),
  is_break_glass BOOLEAN NOT NULL DEFAULT false,
  granted_by UUID NULL REFERENCES public.staff_profiles (user_id),
  approved_by UUID NULL REFERENCES public.staff_profiles (user_id),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
  granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  revoked_at TIMESTAMP WITH TIME ZONE NULL,
  revoked_by UUID NULL REFERENCES public.staff_profiles (user_id),
  revoke_reason TEXT NULL,
  CHECK (expires_at > granted_at),
  CHECK (NOT is_break_glass OR expires_at <= granted_at + interval '2 hours'),
  CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL))
);

-- One active row per person, role and scope. Renewing an assignment revokes the old row first.
CREATE UNIQUE INDEX IF NOT EXISTS role_assignments_one_active
  ON public.role_assignments (user_id, role_key, COALESCE(language, '*'), COALESCE(section, '*'))
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS role_assignments_user_id ON public.role_assignments (user_id);

-- True when the user holds an active, unexpired super_admin assignment and an active profile.
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
       AND a.revoked_at IS NULL
       AND a.expires_at > now()
       AND p.status = 'active'
  );
$$;

-- SECURITY INVOKER on purpose: current_user is then whoever runs the statement, which is what the
-- bootstrap rule checks. As SECURITY DEFINER it would always be the function's owner.
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
     AND current_user = 'postgres' THEN
    RETURN NEW;
  END IF;

  IF NEW.granted_by IS NULL THEN
    RAISE EXCEPTION 'role_assignments: every grant names who granted it (granted_by)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff_profiles WHERE user_id = NEW.granted_by AND status = 'active') THEN
    RAISE EXCEPTION 'role_assignments: the granter is not an active staff member';
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

DROP TRIGGER IF EXISTS role_assignments_guard ON public.role_assignments;
CREATE TRIGGER role_assignments_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.role_assignments
  FOR EACH ROW EXECUTE FUNCTION public.role_assignments_guard();

-- ---- audit_log: append-only, hash-chained ------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Set by the chain trigger under a lock: the chain's order. id cannot be, because its default is
  -- assigned before the lock is taken.
  seq BIGINT NOT NULL UNIQUE,
  -- Set by the chain trigger from the database clock, so no caller can back-date a row.
  at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('staff', 'system', 'legacy', 'bootstrap')),
  actor_id UUID NULL,
  -- system:cron (D11), legacy:shared-password, owner:sql-editor:postgres, or the staff name then.
  actor_label TEXT NOT NULL,
  actor_roles JSONB NOT NULL DEFAULT '[]',
  aal TEXT NULL CHECK (aal IN ('aal1', 'aal2')),
  action TEXT NOT NULL CHECK (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  -- Q2: 'attempted' is written before the change; its outcome row points back with attempt_id. An
  -- attempted row that no row points back to is an attempt with no outcome, shown as its own state.
  outcome TEXT NOT NULL CHECK (outcome IN ('attempted', 'succeeded', 'failed', 'denied')),
  attempt_id UUID NULL,
  entity_type TEXT NULL,
  entity_id TEXT NULL,
  language TEXT NULL,
  section TEXT NULL,
  before JSONB NULL,
  after JSONB NULL,
  reason TEXT NULL,
  ip TEXT NULL,
  user_agent TEXT NULL,
  request_id TEXT NULL,
  prev_hash BYTEA NULL,
  row_hash BYTEA NOT NULL,
  CHECK ((actor_type = 'staff') = (actor_id IS NOT NULL)),
  CHECK ((outcome IN ('succeeded', 'failed')) OR attempt_id IS NULL)
);

CREATE INDEX IF NOT EXISTS audit_log_at ON public.audit_log (at);
CREATE INDEX IF NOT EXISTS audit_log_attempt_id ON public.audit_log (attempt_id) WHERE attempt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_log_actor_id ON public.audit_log (actor_id) WHERE actor_id IS NOT NULL;

-- The row's hash: every column but row_hash, in a fixed order, then the previous row's hash.
-- sha256() is built into Postgres 11+, so no extension is needed.
CREATE OR REPLACE FUNCTION public.audit_log_row_hash(r public.audit_log)
RETURNS BYTEA
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT sha256(
    convert_to(concat_ws(chr(31),
      r.id::text, r.seq::text,
      to_char(r.at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      r.actor_type, coalesce(r.actor_id::text, ''), r.actor_label, r.actor_roles::text,
      coalesce(r.aal, ''), r.action, r.outcome, coalesce(r.attempt_id::text, ''),
      coalesce(r.entity_type, ''), coalesce(r.entity_id, ''),
      coalesce(r.language, ''), coalesce(r.section, ''),
      coalesce(r.before::text, ''), coalesce(r.after::text, ''), coalesce(r.reason, ''),
      coalesce(r.ip, ''), coalesce(r.user_agent, ''), coalesce(r.request_id, '')
    ), 'UTF8') || coalesce(r.prev_hash, ''::bytea)
  );
$$;

CREATE OR REPLACE FUNCTION public.audit_log_chain()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_seq BIGINT;
  v_hash BYTEA;
BEGIN
  -- One writer at a time. In READ COMMITTED each statement below takes a fresh snapshot, so once
  -- the lock is held the SELECT sees the row the previous holder committed.
  PERFORM pg_advisory_xact_lock(hashtext('public.audit_log'));
  SELECT a.seq, a.row_hash INTO v_seq, v_hash FROM public.audit_log a ORDER BY a.seq DESC LIMIT 1;
  NEW.seq := coalesce(v_seq, 0) + 1;
  NEW.at := clock_timestamp();
  NEW.prev_hash := v_hash;
  NEW.row_hash := public.audit_log_row_hash(NEW);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION '%: % is not allowed; the table is append-only', TG_TABLE_NAME, TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS audit_log_chain ON public.audit_log;
CREATE TRIGGER audit_log_chain
  BEFORE INSERT ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_chain();

DROP TRIGGER IF EXISTS audit_log_no_update ON public.audit_log;
CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.reject_change();

DROP TRIGGER IF EXISTS audit_log_no_truncate ON public.audit_log;
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON public.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_change();

-- Walks the chain in seq order. Returns the first seq that does not verify (a gap, a wrong
-- prev_hash, or a row whose content no longer matches its hash), or NULL when the chain is intact.
-- A deleted LAST row leaves no gap; exporting the head hash elsewhere covers that (BL-034).
CREATE OR REPLACE FUNCTION public.audit_verify_chain()
RETURNS BIGINT
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  r public.audit_log;
  v_prev BYTEA := NULL;
  v_seq BIGINT := 1;
BEGIN
  FOR r IN SELECT * FROM public.audit_log ORDER BY seq LOOP
    IF r.seq <> v_seq OR r.prev_hash IS DISTINCT FROM v_prev OR r.row_hash <> public.audit_log_row_hash(r) THEN
      RETURN r.seq;
    END IF;
    v_prev := r.row_hash;
    v_seq := r.seq + 1;
  END LOOP;
  RETURN NULL;
END;
$$;

-- ---- RLS and grants --------------------------------------------------------------------------

ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Supabase's default privileges grant everything on new public tables to anon, authenticated and
-- service_role. Start from nothing, then grant service_role exactly what the app needs.
REVOKE ALL ON public.staff_profiles, public.roles, public.permissions, public.role_permissions,
              public.role_assignments, public.audit_log
  FROM anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON public.staff_profiles TO service_role;
GRANT SELECT ON public.roles, public.permissions, public.role_permissions TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.role_assignments TO service_role;
GRANT SELECT, INSERT ON public.audit_log TO service_role;

-- Functions: Supabase exposes public functions as RPC to anon and authenticated by default.
REVOKE ALL ON FUNCTION public.is_active_super_admin(UUID), public.role_assignments_guard(),
                       public.audit_log_row_hash(public.audit_log), public.audit_log_chain(),
                       public.reject_change(), public.audit_verify_chain()
  FROM PUBLIC, anon, authenticated;
-- The triggers run as the caller, service_role, and call these.
GRANT EXECUTE ON FUNCTION public.is_active_super_admin(UUID), public.audit_log_row_hash(public.audit_log)
  TO service_role;

COMMIT;

-- ---- Verify (each line says what to expect) ---------------------------------------------------
--   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'
--     AND tablename IN ('staff_profiles','roles','permissions','role_permissions','role_assignments','audit_log');
--                                                                  -- six rows, rowsecurity true
--   SELECT has_table_privilege('authenticated', 'public.audit_log', 'SELECT');    -- false
--   SELECT has_table_privilege('anon', 'public.role_assignments', 'SELECT');      -- false
--   SELECT has_table_privilege('service_role', 'public.audit_log', 'INSERT');     -- true
--   SELECT has_table_privilege('service_role', 'public.audit_log', 'UPDATE');     -- false
--   SELECT has_table_privilege('service_role', 'public.audit_log', 'DELETE');     -- false
--   SELECT has_table_privilege('service_role', 'public.role_assignments', 'DELETE');  -- false
--   SELECT has_function_privilege('anon', 'public.audit_verify_chain()', 'EXECUTE');  -- false
--   SELECT public.audit_verify_chain();                                          -- NULL (empty chain)
--
-- ---- Rollback: ONLY before go-live ------------------------------------------------------------
-- Once audit_log holds real rows it is never dropped (DPDP: keep logs at least one year). Before
-- go-live, with no staff and no audit rows, this undoes the file (and the catalogue's data):
--   BEGIN;
--   -- audit_log_row_hash takes the audit_log row type, so it goes before the table.
--   DROP FUNCTION IF EXISTS public.audit_verify_chain(), public.audit_log_row_hash(public.audit_log);
--   DROP TABLE IF EXISTS public.audit_log, public.role_assignments, public.role_permissions,
--                        public.permissions, public.roles, public.staff_profiles;
--   DROP FUNCTION IF EXISTS public.reject_change(), public.audit_log_chain(),
--                           public.role_assignments_guard(), public.is_active_super_admin(UUID);
--   COMMIT;
-- Then confirm nothing is left:
--   SELECT tablename FROM pg_tables WHERE schemaname = 'public'
--     AND tablename IN ('staff_profiles','roles','permissions','role_permissions','role_assignments','audit_log');
--                                                                  -- no rows
