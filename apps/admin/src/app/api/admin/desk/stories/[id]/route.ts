import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { getRevision, listHistory, listOpenPending, readLock } from "@timesprime/server/repositories/stories";
import { deskFailure, gateStory, type Params } from "../../_lib/desk";

// One story for the Desk's story screen (Panel 2 design §4): the story, its current revision, its
// history, its lock and its open two-person requests. Read in the story's own scope.
const RULES = ADMIN_ROUTE_RULES["/api/admin/desk/stories/[id]"];

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const gated = await gateStory(request, RULES.GET, id);
  if (!gated.ok) return gated.response;
  const { story } = gated;
  try {
    const [revision, history, lock, pending] = await Promise.all([
      story.current_revision_id ? getRevision(story.current_revision_id) : Promise.resolve(null),
      listHistory(story.id),
      readLock(story.id),
      listOpenPending(story.id),
    ]);
    return NextResponse.json({ story, revision, history, lock, pending });
  } catch (err) {
    return deskFailure(err, "getStory");
  }
}
