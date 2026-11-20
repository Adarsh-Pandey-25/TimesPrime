import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { listLiveUpdates, postLiveUpdate } from "@timesprime/server/repositories/liveUpdates";
import { forgetLive } from "@timesprime/server/services/front/live";
import { auditedRecord, badRequest, deskFailure, gateStory, readBody, storyTarget, type Params } from "../../../_lib/desk";
import { closedLiveBlog, imageRefusal, liveFields, liveRecord } from "../../../_lib/live";

// A live blog's updates (Panel 3 design §4, M3). GET is the Desk's panel: every update of the story,
// newest first, removed ones too. POST posts one at once, with no second approver (decision 6), to a
// published live blog that has not ended. Both in the story's desk.
const RULES = ADMIN_ROUTE_RULES["/api/admin/desk/stories/[id]/live"];

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const gated = await gateStory(request, RULES.GET, id);
  if (!gated.ok) return gated.response;
  const { story } = gated;
  try {
    return NextResponse.json({ updates: await listLiveUpdates(story.id), live_ended_at: story.live_ended_at ?? null });
  } catch (err) {
    return deskFailure(err, "listLiveUpdates");
  }
}

/** Body: { headline?: string | null, body: <the update's document>, is_key_event?: boolean, is_pinned?: boolean }. */
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");

  const gated = await gateStory(request, RULES.POST, id);
  if (!gated.ok) return gated.response;
  const { actor, story } = gated;

  const closed = closedLiveBlog(story);
  if (closed) return closed;
  const parsed = liveFields(body);
  if (!parsed.ok) return badRequest(parsed.error);
  const fields = parsed.fields;
  try {
    const refused = await imageRefusal(fields.body, story.language, new Date());
    if (refused) return refused;
  } catch (err) {
    return deskFailure(err, "live image check");
  }

  const result = await auditedRecord(
    actor,
    { action: "live.post", entityType: "live_update", entityId: "new", target: storyTarget(story), before: null, reason: null },
    () => postLiveUpdate(story.id, actor.userId as string, fields),
    (u) => ({ update: u.id, story: story.id, ...liveRecord(u) })
  );
  if (!result.ok) return result.response;
  // Readers' pages see it at their next check, not when the feed's cache entry lapses.
  await forgetLive(story.public_id);
  return NextResponse.json({ update: result.value });
}
