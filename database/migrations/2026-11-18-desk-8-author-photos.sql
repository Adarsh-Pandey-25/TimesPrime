-- TimesPrime: Panel 2 (the Desk), authors' photos (M4). An author may have a photo from the media
-- library (authors.photo_id), shown beside their byline on the reader's page (the owner's choice,
-- 18 Nov 2026). Readers could see a library image only through a published story's usages
-- (desk-5); this adds one more way: an active image that is an active author's photo. Nothing
-- else about the library changes.
--
-- The owner applies this in Dashboard -> SQL Editor (as postgres), AFTER
-- 2026-11-18-desk-7-image-usages.sql. Steps and checks: docs/OPERATIONS.md, "The Desk (Panel 2)",
-- step 9. Idempotent: safe to re-run.

BEGIN;

-- The photo: an image of the library. service_role's table-wide rights on authors (desk-1) cover
-- the new column; readers get it by name, as they get the others.
ALTER TABLE public.authors ADD COLUMN IF NOT EXISTS photo_id UUID NULL REFERENCES public.media_assets (id);
GRANT SELECT (photo_id) ON public.authors TO anon, authenticated;

-- Readers: an active image that is an active author's photo, with the columns desk-5 grants them.
DROP POLICY IF EXISTS media_assets_read_author_photo ON public.media_assets;
CREATE POLICY media_assets_read_author_photo ON public.media_assets FOR SELECT TO anon, authenticated
  USING (active AND EXISTS (SELECT 1 FROM public.authors a WHERE a.photo_id = media_assets.id AND a.active));

COMMIT;

-- ---- Verify (one query; expect 1, true, 1) -----------------------------------------------------
--   SELECT (SELECT count(*) FROM information_schema.columns
--            WHERE table_schema = 'public' AND table_name = 'authors' AND column_name = 'photo_id') AS has_photo_column,
--          has_column_privilege('anon', 'public.authors', 'photo_id', 'SELECT') AS readers_see_photo,
--          (SELECT count(*) FROM pg_policies
--            WHERE schemaname = 'public' AND tablename = 'media_assets' AND policyname = 'media_assets_read_author_photo') AS photo_policy;
--
-- ---- Rollback: before any author has a photo --------------------------------------------------
--   BEGIN;
--   DROP POLICY IF EXISTS media_assets_read_author_photo ON public.media_assets;
--   ALTER TABLE public.authors DROP COLUMN IF EXISTS photo_id;
--   COMMIT;
