import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { endLiveBlog } from "@timesprime/server/repositories/liveUpdates";
import { audited, gateStory, type Params } from "../../../_lib/desk";
import { closedLiveBlog } from "../../../_lib/live";

// Ends a live blog (Panel 3 design §3 and §4, M3): it takes no more updates, and readers see it as
// ended. article.publish in the story's desk. Its updates stay; one can still be removed. Recorded in
// the story's history (end_live) and in the audit log.
const RULE = ADMIN_ROUTE_RULES["/api/admin/desk/stories/[id]/end-live"].POST;

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const gated = await gateStory(request, RULE, id);
  if (!gated.ok) return gated.response;
  const { actor, story } = gated;
  const closed = closedLiveBlog(story);
  if (closed) return closed;

  const result = await audited(
    actor,
    { action: "live.end", story, reason: null },
    () => endLiveBlog(story.id, actor.userId as string),
    (ended) => ({ live_ended_at: ended.live_ended_at ?? null })
  );
  if (!result.ok) return result.response;
  return NextResponse.json({ story: result.value });
}
