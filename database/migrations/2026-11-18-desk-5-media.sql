-- TimesPrime: Panel 2 (the Desk), the media library (M4). Every image the Desk uploads is a row
-- here, with the file kept by the storage (S3 in production, a folder on a laptop) under its
-- storage_key; and asset_usages records which story revision uses which image. Design: Panel 2's
-- design in docs/PANEL_DOCS.md, §2 (media_assets, asset_usages) and §7.
--
-- The owner applies this in Dashboard -> SQL Editor (as postgres), AFTER
-- 2026-11-18-desk-4-credits.sql. Steps and checks: docs/OPERATIONS.md, "The Desk (Panel 2)".
-- Idempotent: tables and indexes are IF NOT EXISTS, policies are dropped and created again, and
-- the grants are restated. Safe to re-run.
--
-- What it guarantees, in the database:
--   - an image belongs to one desk (language and section), for media.manage's S scope;
--   - its text fields have the app's limits; rights are cleared by a named person, with a time;
--   - nothing is deleted: an image is retired (active false); usages are append-only, as the
--     revisions they name are immutable;
--   - readers (anon, authenticated) see only an image a live story's published revision uses, and
--     only the columns a page needs; never who uploaded it or cleared it.

BEGIN;

CREATE TABLE IF NOT EXISTS public.media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key TEXT NOT NULL UNIQUE
    CHECK (storage_key ~ '^originals/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|avif)$'),
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  bytes INTEGER NOT NULL CHECK (bytes > 0 AND bytes <= 15728640),
  width INTEGER NULL CHECK (width > 0),
  height INTEGER NULL CHECK (height > 0),
  language TEXT NOT NULL CHECK (language IN ('en', 'hi')),
  section TEXT NOT NULL REFERENCES public.sections (key),
  credit TEXT NULL CHECK (credit IS NULL OR length(btrim(credit)) BETWEEN 1 AND 200),
  source TEXT NULL CHECK (source IN ('staff', 'agency', 'stock', 'handout', 'social')),
  licence TEXT NULL CHECK (licence IS NULL OR length(btrim(licence)) BETWEEN 1 AND 300),
  licence_expires_at TIMESTAMPTZ NULL,
  rights_cleared_by UUID NULL REFERENCES public.staff_profiles (user_id),
  rights_cleared_at TIMESTAMPTZ NULL,
  alt_en TEXT NULL CHECK (alt_en IS NULL OR length(btrim(alt_en)) BETWEEN 1 AND 300),
  alt_hi TEXT NULL CHECK (alt_hi IS NULL OR length(btrim(alt_hi)) BETWEEN 1 AND 300),
  caption_en TEXT NULL CHECK (caption_en IS NULL OR length(btrim(caption_en)) BETWEEN 1 AND 600),
  caption_hi TEXT NULL CHECK (caption_hi IS NULL OR length(btrim(caption_hi)) BETWEEN 1 AND 600),
  renditions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(renditions) = 'array'),
  renditions_at TIMESTAMPTZ NULL,
  uploaded_by UUID NOT NULL REFERENCES public.staff_profiles (user_id),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT media_rights_cleared_together CHECK ((rights_cleared_by IS NULL) = (rights_cleared_at IS NULL))
);

CREATE INDEX IF NOT EXISTS media_assets_desk ON public.media_assets (language, section, created_at DESC);
CREATE INDEX IF NOT EXISTS media_assets_pending_renditions ON public.media_assets (created_at) WHERE renditions_at IS NULL;

CREATE TABLE IF NOT EXISTS public.asset_usages (
  asset_id UUID NOT NULL REFERENCES public.media_assets (id),
  story_id UUID NOT NULL REFERENCES public.stories (id),
  revision_id UUID NOT NULL REFERENCES public.story_revisions (id),
  PRIMARY KEY (asset_id, revision_id)
);
CREATE INDEX IF NOT EXISTS asset_usages_story ON public.asset_usages (story_id);
CREATE INDEX IF NOT EXISTS asset_usages_revision ON public.asset_usages (revision_id);

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_usages ENABLE ROW LEVEL SECURITY;

-- The app (service_role): no DELETE on either table, and usages are never changed.
REVOKE ALL ON public.media_assets, public.asset_usages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.media_assets TO service_role;
GRANT SELECT, INSERT ON public.asset_usages TO service_role;

-- Readers: an image a live story's published revision uses, past its embargo; the columns a page needs.
GRANT SELECT (id, storage_key, width, height, credit, alt_en, alt_hi, caption_en, caption_hi, renditions, active)
  ON public.media_assets TO anon, authenticated;
GRANT SELECT ON public.asset_usages TO anon, authenticated;

DROP POLICY IF EXISTS media_assets_read_published ON public.media_assets;
CREATE POLICY media_assets_read_published ON public.media_assets FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.asset_usages u JOIN public.stories s ON s.published_revision_id = u.revision_id
                  WHERE u.asset_id = media_assets.id AND s.workflow_state = 'published'
                    AND (s.embargo_until IS NULL OR s.embargo_until <= now())));

DROP POLICY IF EXISTS asset_usages_read_published ON public.asset_usages;
CREATE POLICY asset_usages_read_published ON public.asset_usages FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.stories s WHERE s.published_revision_id = asset_usages.revision_id
                  AND s.workflow_state = 'published' AND (s.embargo_until IS NULL OR s.embargo_until <= now())));

COMMIT;

-- ---- Verify (each line says what to expect) ---------------------------------------------------
--   SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('media_assets', 'asset_usages') AND rowsecurity;  -- 2
--   SELECT has_table_privilege('service_role', 'public.media_assets', 'DELETE');                         -- false
--   SELECT has_column_privilege('anon', 'public.media_assets', 'uploaded_by', 'SELECT');                  -- false
--
-- ---- Rollback: before the first real image -----------------------------------------------------
--   BEGIN;
--   DROP TABLE IF EXISTS public.asset_usages, public.media_assets;
--   COMMIT;
