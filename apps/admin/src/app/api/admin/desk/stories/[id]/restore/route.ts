import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { requestRestore, type PendingRow } from "@timesprime/server/repositories/stories";
import { audited, badRequest, gateStory, readBody, type Params } from "../../../_lib/desk";

// Asks to restore a taken-down story (Panel 2 design §3). Restore is the matrix's A for everyone who
// holds it, so it always takes two people: this route records the request, with a reason, and a
// different person decides it (pending/[actionId]/decide). One open request per story.
const RULE = ADMIN_ROUTE_RULES["/api/admin/desk/stories/[id]/restore"].POST;

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  const gated = await gateStory(request, RULE, id);
  if (!gated.ok) return gated.response;
  const { actor, story } = gated;

  if (story.workflow_state !== "unpublished") {
    return NextResponse.json({ error: "Only a story that was taken down can be restored.", code: "wrong_state" }, { status: 409 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) return badRequest("A reason is required for this step.");

  const result = await audited<PendingRow>(
    actor,
    { action: "story.restore_request", story, reason },
    () => requestRestore(story.id, actor.userId as string, reason),
    (pending) => ({ request: pending.id })
  );
  if (!result.ok) return result.response;
  return NextResponse.json({ request: result.value }, { status: 201 });
}
