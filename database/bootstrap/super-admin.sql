-- TimesPrime: make one invited user a Super Admin. Owner only (decision D4).
--
-- Run in Dashboard -> SQL Editor (as postgres), once per account, after:
--   1. 2026-11-02-access-1-foundation.sql and 2026-11-02-access-2-catalog.sql are applied;
--   2. the user was invited (Authentication -> Users -> Invite user) and accepted the invite.
-- Edit v_email and v_name first; the script refuses to run with the placeholders.
-- Safe to re-run: a user who is already an active Super Admin is left alone.
--
-- This is the only way to grant a role without a granter, and the database allows it only here:
-- the role_assignments trigger accepts granted_by = NULL only for super_admin, only with a
-- 'bootstrap:' reason, and only when current_user is postgres. The app connects as service_role and
-- cannot take this path. There is no single-admin mode anywhere: until a second Super Admin exists,
-- privileged roles cannot be granted in the app.
--
-- Verification and rollback: at the end of this file, and docs/runbooks/staff-access.md.

BEGIN;

DO $$
DECLARE
  v_email     TEXT := 'REPLACE_ME@example.com';          -- the invited user's email
  v_name      TEXT := 'REPLACE ME';                      -- their display name
  v_reason    TEXT := 'bootstrap: first Super Admins, owner, ' || to_char(now(), 'YYYY-MM-DD');
  v_expires   TIMESTAMP WITH TIME ZONE := now() + interval '365 days';  -- renewed at the access review
  v_user      UUID;
  v_confirmed TIMESTAMP WITH TIME ZONE;
  v_status    TEXT;
  v_id        UUID;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Run this as postgres in the SQL editor (current_user is %)', current_user;
  END IF;
  IF v_email LIKE 'REPLACE_ME%' OR v_name = 'REPLACE ME' THEN
    RAISE EXCEPTION 'Fill in v_email and v_name first';
  END IF;

  SELECT id, email_confirmed_at INTO v_user, v_confirmed
    FROM auth.users WHERE lower(email) = lower(v_email);
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No auth user with email %: invite them first (Authentication -> Users -> Invite user)', v_email;
  END IF;
  IF v_confirmed IS NULL THEN
    RAISE EXCEPTION 'User % has not accepted the invite yet', v_email;
  END IF;

  INSERT INTO public.staff_profiles (user_id, display_name, status, mfa_required, created_by)
    VALUES (v_user, v_name, 'active', true, NULL)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT status INTO v_status FROM public.staff_profiles WHERE user_id = v_user;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Staff profile for % is %; reactivating is not a bootstrap', v_email, v_status;
  END IF;

  IF public.is_active_super_admin(v_user) THEN
    RAISE NOTICE '% is already an active Super Admin; nothing changed', v_email;
    RETURN;
  END IF;

  INSERT INTO public.role_assignments (user_id, role_key, language, section, reason, expires_at)
    VALUES (v_user, 'super_admin', NULL, NULL, v_reason, v_expires)
    RETURNING id INTO v_id;

  INSERT INTO public.audit_log (actor_type, actor_label, action, outcome, entity_type, entity_id, after, reason)
    VALUES ('bootstrap', 'owner:sql-editor:' || current_user, 'role.assign', 'succeeded',
            'role_assignment', v_id::text,
            jsonb_build_object('user_id', v_user, 'role_key', 'super_admin',
                               'language', NULL, 'section', NULL, 'expires_at', v_expires),
            v_reason);

  RAISE NOTICE 'Super Admin granted to % (assignment %), expires %', v_email, v_id, v_expires;
END $$;

COMMIT;

-- ---- Verify, after each account (each step says what to expect) -------------------------------
--
-- 1. The active Super Admins: exactly the accounts bootstrapped so far.
--   SELECT u.email, p.status, p.mfa_required, a.id, a.reason, a.granted_at, a.expires_at
--     FROM public.role_assignments a
--     JOIN public.staff_profiles p ON p.user_id = a.user_id
--     JOIN auth.users u ON u.id = a.user_id
--    WHERE a.role_key = 'super_admin' AND a.revoked_at IS NULL
--    ORDER BY a.granted_at;
--
-- 2. One bootstrap audit row per grant, and the chain intact (the second query returns NULL).
--   SELECT seq, at, actor_label, action, entity_id, reason FROM public.audit_log
--    WHERE actor_type = 'bootstrap' ORDER BY seq;
--   SELECT public.audit_verify_chain();
--
-- 3. Negative: the app's role cannot bootstrap. Expect an ERROR from the trigger, then roll back.
--   BEGIN;
--   SET LOCAL ROLE service_role;
--   INSERT INTO public.role_assignments (user_id, role_key, reason, expires_at)
--     SELECT user_id, 'super_admin', 'bootstrap: must fail', now() + interval '1 day'
--       FROM public.staff_profiles LIMIT 1;
--   ROLLBACK;
--
-- 4. Negative: the audit log cannot be edited by the app. Expect an ERROR, then roll back.
--   BEGIN;
--   SET LOCAL ROLE service_role;
--   UPDATE public.audit_log SET reason = 'tampered' WHERE actor_type = 'bootstrap';
--   ROLLBACK;
--
-- 5. In the app: the user signs in at /admin/login and enrols TOTP; /api/admin/me lists
--    super_admin with aal2; the activity log shows auth.sign_in and auth.mfa_enrolled.
--
-- ---- Rollback: revoke, never delete (assignments are history) ---------------------------------
--   BEGIN;
--   UPDATE public.role_assignments
--      SET revoked_at = now(), revoked_by = NULL, revoke_reason = 'bootstrap rollback: <why>'
--    WHERE id = '<assignment id from verification 1>' AND revoked_at IS NULL;
--   INSERT INTO public.audit_log (actor_type, actor_label, action, outcome, entity_type, entity_id, reason)
--     VALUES ('bootstrap', 'owner:sql-editor:' || current_user, 'role.revoke', 'succeeded',
--             'role_assignment', '<assignment id>', 'bootstrap rollback: <why>');
--   -- Optional, to stop the person reaching the admin at all:
--   -- UPDATE public.staff_profiles SET status = 'suspended' WHERE user_id = '<user id>';
--   COMMIT;
-- The app reads assignments live on every request, so the revocation applies to the user's next
-- request. To end their open session at once, also sign them out in the dashboard.
