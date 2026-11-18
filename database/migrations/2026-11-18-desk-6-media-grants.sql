-- TimesPrime: Panel 2 (the Desk), a fix to desk-5 (the media library). desk-5 took the media
-- tables' rights away from PUBLIC, anon and authenticated, but not from service_role. Supabase's
-- default privileges give every new public table's rights to all three, so the app (service_role)
-- could still DELETE an image or change a usage. The app never does; with this the database
-- refuses it too, as desk-1 and access-1 already do for their tables. Found by the owner's check
-- of desk-5 on 18 Nov 2026 (service_may_delete returned true).
--
-- The owner applies this in Dashboard -> SQL Editor (as postgres), AFTER
-- 2026-11-18-desk-5-media.sql. Steps and checks: docs/OPERATIONS.md, "The Desk (Panel 2)", step 7.
-- Idempotent: safe to re-run. Readers' rights (anon, authenticated) are not touched.

BEGIN;

-- Start from nothing, then exactly what the app needs: the same grants desk-5 made.
REVOKE ALL ON public.media_assets, public.asset_usages FROM service_role;
GRANT SELECT, INSERT, UPDATE ON public.media_assets TO service_role;
GRANT SELECT, INSERT ON public.asset_usages TO service_role;

COMMIT;

-- ---- Verify (one query; expect false, false, true) ---------------------------------------------
--   SELECT has_table_privilege('service_role', 'public.media_assets', 'DELETE') AS assets_may_delete,
--          has_table_privilege('service_role', 'public.asset_usages', 'UPDATE')
--            OR has_table_privilege('service_role', 'public.asset_usages', 'DELETE') AS usages_may_change,
--          has_table_privilege('service_role', 'public.media_assets', 'UPDATE') AS app_may_edit;
--
-- ---- Rollback: not needed (it removes only rights the app never uses). desk-5's state was:
--   GRANT ALL ON public.media_assets, public.asset_usages TO service_role;
