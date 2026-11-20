import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { editLiveUpdate, getLiveUpdate, type LiveUpdateRow } from "@timesprime/server/repositories/liveUpdates";
import { auditedRecord, badRequest, deskFailure, gateStory, readBody, storyTarget, type Params } from "../../../../_lib/desk";
import { closedLiveBlog, imageRefusal, liveFields, liveRecord } from "../../../../_lib/live";

// Changes one update of a live blog (Panel 3 design §4, M3): its headline, text, key event or pin.
// The same permission as posting, in the story's desk, while the blog is open. The update's text
// before and after is kept in the audit log, so no second table holds old versions (design §2).
const RULE = ADMIN_ROUTE_RULES["/api/admin/desk/stories/[id]/live/[updateId]"].PATCH;

/** Body: any of { headline, body, is_key_event, is_pinned }; what it leaves out stays as it is. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id, updateId } = await params;
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  if (!["headline", "body", "is_key_event", "is_pinned"].some((key) => key in body)) return badRequest("Name something to change.");

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
  if (current.removed_at) return NextResponse.json({ error: "This update was removed.", code: "removed" }, { status: 409 });
  const closed = closedLiveBlog(story);
  if (closed) return closed;

  const parsed = liveFields(body, current);
  if (!parsed.ok) return badRequest(parsed.error);
  const fields = parsed.fields;
  if ("body" in body) {
    try {
      const refused = await imageRefusal(fields.body, story.language, new Date());
      if (refused) return refused;
    } catch (err) {
      return deskFailure(err, "live image check");
    }
  }

  const result = await auditedRecord(
    actor,
    { action: "live.edit", entityType: "live_update", entityId: current.id, target: storyTarget(story), before: liveRecord(current), reason: null },
    () => editLiveUpdate(current.id, actor.userId as string, fields),
    (u) => liveRecord(u)
  );
  if (!result.ok) return result.response;
  return NextResponse.json({ update: result.value });
}
