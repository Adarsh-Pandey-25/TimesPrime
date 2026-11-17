import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { getRevision } from "@timesprime/server/repositories/stories";
import { deskFailure, gateStory, type Params } from "../../../../_lib/desk";

// One revision of a story, with its body, for the diff and the restore (Panel 2 design §3). Only a
// revision of the story named in the path: another story's revision is not found.
const RULES = ADMIN_ROUTE_RULES["/api/admin/desk/stories/[id]/revisions/[revisionId]"];

export async function GET(request: NextRequest, { params }: Params) {
  const { id, revisionId } = await params;
  const gated = await gateStory(request, RULES.GET, id);
  if (!gated.ok) return gated.response;
  try {
    const revision = revisionId ? await getRevision(revisionId) : null;
    if (!revision || revision.story_id !== gated.story.id) {
      return NextResponse.json({ error: "Revision not found." }, { status: 404 });
    }
    return NextResponse.json({ revision });
  } catch (err) {
    return deskFailure(err, "getRevision");
  }
}
