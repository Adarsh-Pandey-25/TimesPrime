import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { correctionsForGrievance } from "@timesprime/server/repositories/corrections";
import { grievanceStory, listGrievanceNotes, staffNames, type GrievanceStory } from "@timesprime/server/repositories/grievances";
import type { Params } from "../../../desk/_lib/desk";
import { complianceFailure, gateGrievance, grievanceView, mayHandle, noteView, peopleOn } from "../../_lib/grievances";

// One grievance (Panel 7 design §4): what was sent, its clocks, its notes, the story it is about, the
// corrections it caused (M2), and whether the caller may act on it. The Managing Editor (R) reads it
// with the email masked.
const RULE = ADMIN_ROUTE_RULES["/api/admin/compliance/grievances/[id]"].GET;

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const gated = await gateGrievance(request, RULE, id);
  if (!gated.ok) return gated.response;
  const { actor, grievance } = gated;
  const handler = mayHandle(actor, new Date());
  try {
    const [notes, story, corrections] = await Promise.all([
      listGrievanceNotes(grievance.id),
      grievance.story_id ? grievanceStory(grievance.story_id) : Promise.resolve<GrievanceStory | null>(null),
      correctionsForGrievance(grievance.id),
    ]);
    const names = await staffNames([...peopleOn([grievance]), ...notes.map((n) => n.author_id)]);
    return NextResponse.json({
      grievance: grievanceView(grievance, handler, names),
      notes: notes.map((n) => noteView(n, names)),
      story,
      corrections: corrections.map(({ id: correctionId, story_id, kind, text, headline, published_at }) => ({ id: correctionId, story_id, kind, text, headline, published_at })),
      may_handle: handler,
      yours: grievance.assigned_to !== null && grievance.assigned_to === actor.userId,
    });
  } catch (err) {
    return complianceFailure(err, "getGrievance");
  }
}
