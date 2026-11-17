import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { ANY_SCOPE } from "@timesprime/server/auth/decide";
import { requirePermission, requireTarget } from "@timesprime/server/auth/requirePermission";
import { decidePending, getPending, getStory, type PendingRow, type StoryRow } from "@timesprime/server/repositories/stories";
import { audited, badRequest, deskFailure, readBody, staffLabel, storyTarget, type Params } from "../../../_lib/desk";

// Decides a two-person request (Panel 2 design §3): a restore or a correction. The decider holds the
// request's own permission in the story's desk and is not the person who asked (the database
// refuses that too).
// - Restore (article.restore, A for every holder, so any other holder decides): approved, the
//   story is live again with the revision it had; declined, it stays down.
// - Correction (correction.publish): only a holder of S or F decides, never another A holder.
//   Approved, the live story's correction note is the request's; declined, nothing changes.
// The gate's pre-check is the route's rule (article.restore, A or better), which every holder of
// correction.publish at S or F also holds (Desk Editor, Managing Editor); the request's own rule
// then decides.
const RULE = ADMIN_ROUTE_RULES["/api/admin/desk/pending/[actionId]/decide"].POST;
const CORRECTION_RULE = { ...ADMIN_ROUTE_RULES["/api/admin/desk/stories/[id]/correct"].POST, twoPerson: false };

export async function POST(request: NextRequest, { params }: Params) {
  const { actionId } = await params;
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  const outcome = body.outcome === "approved" || body.outcome === "declined" ? body.outcome : null;
  if (!outcome) return badRequest('outcome must be "approved" or "declined".');

  const gate = await requirePermission(request, RULE, ANY_SCOPE);
  if (!gate.ok) return gate.response;
  const actor = gate.actor;

  let pending: PendingRow | null;
  let story: StoryRow | null;
  try {
    pending = actionId ? await getPending(actionId) : null;
    story = pending ? await getStory(pending.story_id) : null;
  } catch (err) {
    return deskFailure(err, "getPending");
  }
  if (!pending || !story) return NextResponse.json({ error: "Request not found." }, { status: 404 });

  const scoped = await requireTarget(actor, pending.action === "correction" ? CORRECTION_RULE : RULE, storyTarget(story));
  if (!scoped.ok) return scoped.response;
  if (pending.decided_at) return NextResponse.json({ error: "This request is already decided.", code: "decided" }, { status: 409 });
  if (pending.requested_by === actor.userId) {
    return NextResponse.json({ error: "Someone other than the person who asked decides this.", code: "four_eyes" }, { status: 403 });
  }

  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;
  const decided = story;
  const kind = pending.action === "correction" ? "correct" : "restore";
  const result = await audited(
    actor,
    { action: `story.${kind}_${outcome === "approved" ? "approve" : "decline"}`, story: decided, reason },
    () => decidePending({ actionId: pending.id, deciderId: actor.userId as string, deciderLabel: staffLabel(actor), outcome, reason }),
    (updated) => ({ state: updated.workflow_state, request: pending.id, outcome })
  );
  if (!result.ok) return result.response;
  return NextResponse.json({ story: result.value });
}
