import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { forgetLive } from "@timesprime/server/services/front/live";
import { getLiveUpdate, removeLiveUpdate, type LiveUpdateRow } from "@timesprime/server/repositories/liveUpdates";
import { auditedRecord, badRequest, deskFailure, gateStory, readBody, storyTarget, type Params } from "../../../../../_lib/desk";
import { liveRecord, REMOVE_REASON_MAX } from "../../../../../_lib/live";

// Takes one update off a live blog (Panel 3 design §3, decision 7): one person, at once, with a
// reason, like a takedown, and by the same permission (article.unpublish) in the story's desk. Also
// after the blog has ended. The update stays in the table, removed, with who, when and why.
const RULE = ADMIN_ROUTE_RULES["/api/admin/desk/stories/[id]/live/[updateId]/remove"].POST;

/** Body: { reason: string }. */
export async function POST(request: NextRequest, { params }: Params) {
  const { id, updateId } = await params;
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) return badRequest("A reason is required to remove an update.");
  if ([...reason].length > REMOVE_REASON_MAX) return badRequest(`reason: at most ${REMOVE_REASON_MAX} characters.`);

  const gated = await gateStory(request, RULE, id);
  if (!gated.ok) return gated.response;
  const { actor, story } = gated;

  let current: LiveUpdateRow | null;
  try {
    current = updateId ? await getLiveUpdate(updateId) : null;
  } catch (err) {
    return deskFailure(err, "getLiveUpdate");
  }
  if (!current || current.story_id !== story.id) return NextResponse.json({ error: "Update not found." }, { status: 404 });
  if (current.removed_at) return NextResponse.json({ error: "This update was already removed.", code: "removed" }, { status: 409 });

  const result = await auditedRecord(
    actor,
    { action: "live.remove", entityType: "live_update", entityId: current.id, target: storyTarget(story), before: liveRecord(current), reason },
    () => removeLiveUpdate(current.id, actor.userId as string, reason),
    (u) => ({ removed_at: u.removed_at })
  );
  if (!result.ok) return result.response;
  await forgetLive(story.public_id);
  return NextResponse.json({ update: result.value });
}
