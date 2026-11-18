-- TimesPrime: Panel 2 (the Desk), bylines. A story's credits (byline, additional reporting,
-- translated by), each naming an author record, are set in one transaction with the story's history:
-- before publication only, so a live page's credits never change unseen, and setting them on an
-- approved story voids the approval, as a change to its details does (four-eyes holds for what is
-- published). Design: Panel 2's design in docs/PANEL_DOCS.md, §2 (authors, story_authors) and §7.
--
-- The owner applies this in Dashboard -> SQL Editor (as postgres), AFTER
-- 2026-11-17-desk-3-corrections.sql. Steps and checks: docs/OPERATIONS.md, "The Desk (Panel 2)".
-- Idempotent: the function is CREATE OR REPLACE, and the grants are restated. Safe to re-run.
--
-- What it guarantees, in the database:
--   - credits change only before publication, and only on a story that has not moved since the
--     caller read it;
--   - every credit names an active author; the credits replace the story's old ones, in order;
--   - an approved story goes back to desk review, its approval cleared, in the same transaction;
--   - the change is in the story's history ('credits').

BEGIN;

CREATE OR REPLACE FUNCTION public.desk_set_credits(
  p_story UUID, p_from TEXT, p_actor UUID, p_actor_label TEXT, p_credits JSONB
)
RETURNS public.stories
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  s public.stories;
  v_to TEXT;
  c JSONB;
  v_position INT := 0;
BEGIN
  IF p_from NOT IN ('pitch', 'assigned', 'draft', 'in_review', 'desk_review', 'approved') THEN
    RAISE EXCEPTION 'desk: a story''s credits are set before it is published' USING ERRCODE = 'check_violation';
  END IF;
  IF p_credits IS NULL OR jsonb_typeof(p_credits) <> 'array' OR jsonb_array_length(p_credits) > 20 THEN
    RAISE EXCEPTION 'desk: credits are a list of at most 20' USING ERRCODE = 'check_violation';
  END IF;
  v_to := CASE WHEN p_from = 'approved' THEN 'desk_review' ELSE p_from END;

  UPDATE public.stories
     SET workflow_state = v_to,
         approved_by = CASE WHEN p_from = 'approved' THEN NULL ELSE approved_by END,
         approved_revision_id = CASE WHEN p_from = 'approved' THEN NULL ELSE approved_revision_id END,
         updated_at = now()
   WHERE id = p_story AND workflow_state = p_from
  RETURNING * INTO s;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'desk: story % is not % any more', p_story, p_from USING ERRCODE = 'serialization_failure';
  END IF;

  DELETE FROM public.story_authors WHERE story_id = p_story;
  FOR c IN SELECT value FROM jsonb_array_elements(p_credits) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.authors a WHERE a.id = (c->>'author_id')::uuid AND a.active) THEN
      RAISE EXCEPTION 'desk: % is not an active author', c->>'author_id' USING ERRCODE = 'foreign_key_violation';
    END IF;
    INSERT INTO public.story_authors (story_id, author_id, role, position)
    VALUES (p_story, (c->>'author_id')::uuid, c->>'role', v_position);
    v_position := v_position + 1;
  END LOOP;

  INSERT INTO public.workflow_transitions (story_id, action, from_state, to_state, actor_id, actor_label, revision_id, reason)
  VALUES (p_story, 'credits', p_from, v_to, p_actor, p_actor_label, s.current_revision_id, NULL);
  RETURN s;
END;
$$;
REVOKE ALL ON FUNCTION public.desk_set_credits(UUID, TEXT, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desk_set_credits(UUID, TEXT, UUID, TEXT, JSONB) TO service_role;

COMMIT;

-- ---- Verify (each line says what to expect) ---------------------------------------------------
--   SELECT has_function_privilege('service_role', 'public.desk_set_credits(uuid,text,uuid,text,jsonb)', 'EXECUTE');  -- true
--   SELECT has_function_privilege('anon', 'public.desk_set_credits(uuid,text,uuid,text,jsonb)', 'EXECUTE');          -- false
--
-- ---- Rollback: before the first real credits ---------------------------------------------------
--   DROP FUNCTION IF EXISTS public.desk_set_credits(UUID, TEXT, UUID, TEXT, JSONB);
--   The Desk then cannot set credits (the app answers with the database's error); nothing else changes.
