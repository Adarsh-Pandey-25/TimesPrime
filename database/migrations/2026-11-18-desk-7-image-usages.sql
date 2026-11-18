-- TimesPrime: Panel 2 (the Desk), images in stories (M4). desk_save_revision now records, in the
-- same transaction as the revision, which library images its body uses (asset_usages): one row per
-- image and revision. desk-5's reader policies show readers an image only through such a row for a
-- live story's published revision, so an image appears on the site exactly when a revision using it
-- is published. A retired image cannot be added (or kept) in a save; an id the library does not
-- have fails the save by asset_usages' foreign key.
--
-- The owner applies this in Dashboard -> SQL Editor (as postgres), AFTER
-- 2026-11-18-desk-6-media-grants.sql. Steps and checks: docs/OPERATIONS.md, "The Desk (Panel 2)",
-- step 8. It replaces desk_save_revision with the same signature; everything it did before is
-- unchanged. Idempotent: safe to re-run.

BEGIN;

CREATE OR REPLACE FUNCTION public.desk_save_revision(
  p_story UUID, p_actor UUID, p_expected_revision UUID,
  p_headline TEXT, p_dek TEXT, p_body JSONB, p_seo_title TEXT, p_seo_description TEXT, p_is_substantive BOOLEAN
)
RETURNS public.stories
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  s public.stories;
  r_id UUID;
  prev_state TEXT;
  next_state TEXT;
  v_images UUID[];
BEGIN
  SELECT * INTO s FROM public.stories WHERE id = p_story FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'desk: story % not found', p_story USING ERRCODE = 'no_data_found';
  END IF;
  IF s.current_revision_id IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'desk: story % changed since revision %', p_story, p_expected_revision USING ERRCODE = 'serialization_failure';
  END IF;
  IF s.workflow_state IN ('unpublished', 'retracted', 'killed', 'scheduled') THEN
    RAISE EXCEPTION 'desk: a % story cannot be saved', s.workflow_state USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.story_revisions (story_id, body, headline, dek, seo_title, seo_description, editor_id, is_substantive)
  VALUES (p_story, p_body, p_headline, p_dek, p_seo_title, p_seo_description, p_actor, p_is_substantive)
  RETURNING id INTO r_id;

  -- The library's images the body uses (design §7), at any depth, each once.
  SELECT coalesce(array_agg(DISTINCT (img ->> 'id')::uuid), '{}')
    INTO v_images
    FROM jsonb_path_query(p_body, 'lax $.** ? (@.type == "image").attrs') AS img
   WHERE img ->> 'id' IS NOT NULL;
  IF EXISTS (SELECT 1 FROM public.media_assets m WHERE m.id = ANY (v_images) AND NOT m.active) THEN
    RAISE EXCEPTION 'desk: a retired image cannot be in a story' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.asset_usages (asset_id, story_id, revision_id)
  SELECT image_id, p_story, r_id FROM unnest(v_images) AS image_id;

  prev_state := s.workflow_state;
  next_state := CASE WHEN prev_state = 'approved' THEN 'desk_review' ELSE prev_state END;
  -- An approval binds to one revision (design §3): a later save voids it, live stories included.
  UPDATE public.stories
     SET current_revision_id = r_id, last_edited_by = p_actor, updated_at = now(), workflow_state = next_state,
         approved_by = NULL, approved_revision_id = NULL
   WHERE id = p_story
  RETURNING * INTO s;
  INSERT INTO public.workflow_transitions (story_id, action, from_state, to_state, actor_id, actor_label, revision_id)
  VALUES (p_story, 'save', prev_state, next_state, p_actor, 'staff:' || p_actor::text, r_id);
  RETURN s;
END;
$$;

REVOKE ALL ON FUNCTION public.desk_save_revision(UUID, UUID, UUID, TEXT, TEXT, JSONB, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desk_save_revision(UUID, UUID, UUID, TEXT, TEXT, JSONB, TEXT, TEXT, BOOLEAN) TO service_role;

COMMIT;

-- ---- Verify (one query; expect true, true, false) ----------------------------------------------
--   SELECT position('asset_usages' IN pg_get_functiondef('public.desk_save_revision(uuid,uuid,uuid,text,text,jsonb,text,text,boolean)'::regprocedure)) > 0 AS records_images,
--          has_function_privilege('service_role', 'public.desk_save_revision(uuid,uuid,uuid,text,text,jsonb,text,text,boolean)', 'EXECUTE') AS service_may_call,
--          has_function_privilege('anon', 'public.desk_save_revision(uuid,uuid,uuid,text,text,jsonb,text,text,boolean)', 'EXECUTE') AS anon_may_call;
--
-- ---- Rollback: run desk-1's CREATE OR REPLACE FUNCTION public.desk_save_revision again (images
-- are then saved but not recorded, so readers would not see them).
