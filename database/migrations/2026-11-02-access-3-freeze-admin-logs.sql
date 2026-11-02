-- TimesPrime: Panel 0, freeze admin_logs. After Panel 0 is deployed, nothing writes admin_logs: staff
-- actions and the cron write public.audit_log. This keeps admin_logs as a read-only record of the
-- shared-password era (owner decision Q7): kept, readable, never written again, never copied.
--
-- The owner applies this in Dashboard -> SQL Editor AFTER the Panel 0 deploy is verified (runbook
-- step 7). Applied before the deploy, the old code's activity logging would fail; it swallows the
-- error, so the only effect would be lost log lines. Idempotent.

BEGIN;

-- service_role bypasses RLS, so the freeze is in the grants, not in a policy.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.admin_logs FROM service_role;
GRANT SELECT ON public.admin_logs TO service_role;

COMMIT;

-- Verify:
--   SELECT has_table_privilege('service_role', 'public.admin_logs', 'SELECT');  -- true  (still readable)
--   SELECT has_table_privilege('service_role', 'public.admin_logs', 'INSERT');  -- false
--   SELECT has_table_privilege('service_role', 'public.admin_logs', 'DELETE');  -- false
--   SELECT has_table_privilege('anon', 'public.admin_logs', 'SELECT');          -- false (database/policies.sql)
--
-- Rollback (restores what database/policies.sql granted):
--   GRANT ALL ON public.admin_logs TO service_role;
