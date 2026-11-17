-- TimesPrime: Panel 2 (the Desk), corrections. A live story's public correction note: a Desk Editor
-- or the Managing Editor publishes it (the app, through desk_transition); a Sub-editor, whose cell is
-- A, asks (a row in pending_actions, the note in its payload), and a different person decides. This
-- file teaches desk_decide_pending to decide a correction request too. Design: Panel 2's design in
-- docs/PANEL_DOCS.md, §3 ("Update a live story").
--
-- The owner applies this in Dashboard -> SQL Editor (as postgres), AFTER
-- 2026-11-17-desk-2-restore.sql. Steps and checks: docs/OPERATIONS.md, "The Desk (Panel 2)".
-- Idempotent: the function is CREATE OR REPLACE, and the grants are restated. Safe to re-run.
--
-- What it guarantees, in the database:
--   - a request is decided once, never by the person who asked (unchanged);
--   - an approved restore puts the story back live, as before;
--   - an approved correction sets the story's correction note from the request, in the same
--     transaction, with its history row, and only while the story is live.

BEGIN;

-- Decides a restore or a correction request. Approved restore: the story goes from unpublished back
-- to published, with the revision it had, published by the decider. Approved correction: the live
-- story's correction note becomes the request's note. Declined: nothing changes but the request.
-- Either way the request is closed. Refused if it is already decided, if the decider asked for it,
-- or if the story moved.
CREATE OR REPLACE FUNCTION public.desk_decide_pending(
  p_action UUID, p_decider UUID, p_decider_label TEXT, p_outcome TEXT, p_reason TEXT
)
RETURNS public.stories
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  a public.pending_actions;
  s public.stories;
  v_note TEXT;
BEGIN
  IF p_outcome NOT IN ('approved', 'declined') THEN
    RAISE EXCEPTION 'desk: a decision is approved or declined, not %', p_outcome USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO a FROM public.pending_actions WHERE id = p_action FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'desk: request % not found', p_action USING ERRCODE = 'no_data_found';
  END IF;
  IF a.decided_at IS NOT NULL THEN
    RAISE EXCEPTION 'desk: request % is already decided', p_action USING ERRCODE = 'serialization_failure';
  END IF;
  IF a.requested_by = p_decider THEN
    RAISE EXCEPTION 'desk: the person who asked cannot decide' USING ERRCODE = 'check_violation';
  END IF;
  IF a.action NOT IN ('restore', 'correction') THEN
    RAISE EXCEPTION 'desk: % requests are not decided here', a.action USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.pending_actions
     SET decided_by = p_decider, decided_at = now(), outcome = p_outcome
   WHERE id = p_action;

  IF p_outcome = 'approved' AND a.action = 'restore' THEN
    UPDATE public.stories
       SET workflow_state = 'published', published_by = p_decider, published_at = now(), updated_at = now()
     WHERE id = a.story_id AND workflow_state = 'unpublished' AND published_revision_id IS NOT NULL
    RETURNING * INTO s;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'desk: story % is not unpublished any more', a.story_id USING ERRCODE = 'serialization_failure';
    END IF;
    INSERT INTO public.workflow_transitions (story_id, action, from_state, to_state, actor_id, actor_label, revision_id, reason)
    VALUES (a.story_id, 'restore', 'unpublished', 'published', p_decider, p_decider_label, s.published_revision_id,
            coalesce(p_reason, a.reason));
  ELSIF p_outcome = 'approved' AND a.action = 'correction' THEN
    v_note := btrim(a.payload ->> 'note');
    IF v_note IS NULL OR v_note = '' THEN
      RAISE EXCEPTION 'desk: correction request % has no note', p_action USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.stories
       SET correction_note = v_note, updated_at = now()
     WHERE id = a.story_id AND workflow_state = 'published'
    RETURNING * INTO s;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'desk: story % is not published any more', a.story_id USING ERRCODE = 'serialization_failure';
    END IF;
    INSERT INTO public.workflow_transitions (story_id, action, from_state, to_state, actor_id, actor_label, revision_id, reason)
    VALUES (a.story_id, 'correct', 'published', 'published', p_decider, p_decider_label, s.published_revision_id, v_note);
  ELSE
    SELECT * INTO s FROM public.stories WHERE id = a.story_id;
  END IF;
  RETURN s;
END;
$$;
REVOKE ALL ON FUNCTION public.desk_decide_pending(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desk_decide_pending(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;

COMMIT;

-- ---- Verify (each line says what to expect) ---------------------------------------------------
--   SELECT position('correction' IN pg_get_functiondef('public.desk_decide_pending(uuid,uuid,text,text,text)'::regprocedure)) > 0;  -- true
--   SELECT has_function_privilege('anon', 'public.desk_decide_pending(uuid,uuid,text,text,text)', 'EXECUTE');          -- false
--   SELECT has_function_privilege('service_role', 'public.desk_decide_pending(uuid,uuid,text,text,text)', 'EXECUTE');  -- true
--
-- ---- Rollback: before the first real correction request ----------------------------------------
--   Run 2026-11-17-desk-2-restore.sql again: its CREATE OR REPLACE puts back the restore-only
--   function. Correction requests then cannot be decided (the app answers 422), and nothing else
--   changes.
