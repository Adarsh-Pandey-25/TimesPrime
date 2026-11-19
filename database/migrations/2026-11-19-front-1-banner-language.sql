-- TimesPrime: Panel 3 (Front page), M1. The breaking-news banner gets a language, so each desk runs
-- its own banner and a reader sees their language's items. Design: Panel 3's design in
-- docs/PANEL_DOCS.md, §2 and §3, as approved on 19 Nov 2026 (question 4: an item for both languages
-- is allowed, for unscoped holders only).
--
-- The owner applies this in Dashboard -> SQL Editor (as postgres). Steps and checks:
-- docs/OPERATIONS.md, "Panel 3: applying front-1". Idempotent: the column is IF NOT EXISTS and the
-- constraint is dropped before it is added. Safe to re-run.
--
-- What it changes:
--   - breaking_news.language: 'en', 'hi', or NULL for both languages;
--   - every existing item keeps NULL, so readers see no change until an editor sets a language.
-- The table's policies and grants (database/policies.sql) are unchanged: readers already read the
-- whole row, and the column is part of it.

BEGIN;

ALTER TABLE public.breaking_news ADD COLUMN IF NOT EXISTS language TEXT NULL;

ALTER TABLE public.breaking_news DROP CONSTRAINT IF EXISTS breaking_news_language_check;
ALTER TABLE public.breaking_news
  ADD CONSTRAINT breaking_news_language_check CHECK (language IS NULL OR language IN ('en', 'hi'));

COMMIT;

-- ---- Verify (one query; expect true, true, 0) ---------------------------------------------------
--   SELECT EXISTS (SELECT 1 FROM information_schema.columns
--                  WHERE table_schema = 'public' AND table_name = 'breaking_news' AND column_name = 'language') AS has_language,
--          EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'breaking_news_language_check') AS language_checked,
--          (SELECT count(*) FROM public.breaking_news WHERE language IS NOT NULL) AS items_with_a_language;
--
-- ---- Rollback: before the first item with a language ---------------------------------------------
--   BEGIN;
--   ALTER TABLE public.breaking_news DROP CONSTRAINT IF EXISTS breaking_news_language_check;
--   ALTER TABLE public.breaking_news DROP COLUMN IF EXISTS language;
--   COMMIT;
