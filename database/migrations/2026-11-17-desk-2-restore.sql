-- TimesPrime: Panel 2 (the Desk), restore. A taken-down story comes back only with two people: one
-- asks (a row in pending_actions), a different one decides. Design: Panel 2's design in
-- docs/PANEL_DOCS.md, §3 ("Restore").
--
-- The owner applies this in Dashboard -> SQL Editor (as postgres), AFTER
-- 2026-11-17-desk-1-stories.sql. Steps and checks: docs/OPERATIONS.md, "The Desk (Panel 2)".
-- Idempotent: the index is IF NOT EXISTS, the function is CREATE OR REPLACE, and the grants are
-- restated. Safe to re-run.
--
-- What it guarantees, in the database:
--   - at most one open request per story and action;
--   - a request is decided once, never by the person who asked, and an approved restore puts the
--     story back live in the same transaction, with its history row.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS pending_actions_one_open
  ON public.pending_actions (story_id, action) WHERE decided_at IS NULL;

-- Decides a restore request. Approved: the story goes from unpublished back to published, with the
-- revision it had, published by the decider. Declined: the story stays down. Either way the request
-- is closed. Refused if it is already decided, if the decider asked for it, or if the story moved.
CREATE OR REPLACE FUNCTION public.desk_decide_pending(
  p_action UUID, p_decider UUID, p_decider_label TEXT, p_outcome TEXT, p_reason TEXT
)
RETURNS public.stories
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  a public.pending_actions;
  s public.stories;
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
  IF a.action <> 'restore' THEN
    RAISE EXCEPTION 'desk: % requests are not decided here', a.action USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.pending_actions
     SET decided_by = p_decider, decided_at = now(), outcome = p_outcome
   WHERE id = p_action;

  IF p_outcome = 'approved' THEN
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
--   SELECT indexname FROM pg_indexes WHERE indexname = 'pending_actions_one_open';           -- one row
--   SELECT has_function_privilege('anon', 'public.desk_decide_pending(uuid,uuid,text,text,text)', 'EXECUTE');          -- false
--   SELECT has_function_privilege('service_role', 'public.desk_decide_pending(uuid,uuid,text,text,text)', 'EXECUTE');  -- true
--
-- ---- Rollback: before the first real restore ---------------------------------------------------
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.desk_decide_pending(UUID, UUID, TEXT, TEXT, TEXT);
--   DROP INDEX IF EXISTS public.pending_actions_one_open;
--   COMMIT;
