import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { decide } from "@timesprime/server/auth/decide";
import { requestCorrection, transition, type PendingRow, type StoryRow } from "@timesprime/server/repositories/stories";
import { CORRECTION_NOTE_MAX } from "@timesprime/shared/config/desk";
import { audited, badRequest, gateStory, readBody, staffLabel, storyTarget, type Params } from "../../../_lib/desk";

// A live story's public correction note (Panel 2 design §3, "Update a live story"): readers see it
// under the story. correction.publish is S for a Desk Editor and F for the Managing Editor, who
// publish it here at once; it is A for a Sub-editor, who asks, and a holder of S or F decides
// (pending/[actionId]/decide). Either way it is audited, and the history keeps every note, so a
// replaced note is never lost.
const RULE = ADMIN_ROUTE_RULES["/api/admin/desk/stories/[id]/correct"].POST;

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  const gated = await gateStory(request, RULE, id);
  if (!gated.ok) return gated.response;
  const { actor, story } = gated;

  if (story.workflow_state !== "published") {
    return NextResponse.json({ error: "A correction note goes on a live story.", code: "wrong_state" }, { status: 409 });
  }
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (!note || note.length > CORRECTION_NOTE_MAX) return badRequest(`note: the correction readers see, 1 to ${CORRECTION_NOTE_MAX} characters.`);

  // The gate let an A holder through (twoPerson): decide again whether this person publishes it or asks.
  const direct = decide({ staff: actor.record, aal: actor.aal ?? "aal1", permission: "correction.publish", mode: "act", target: storyTarget(story), now: new Date() });

  if (direct.allowed) {
    const result = await audited<StoryRow>(
      actor,
      { action: "story.correct", story, reason: note },
      () =>
        transition({
          storyId: story.id,
          action: "correct",
          from: "published",
          to: "published",
          actorId: actor.userId,
          actorLabel: staffLabel(actor),
          reason: note,
          fields: { correction_note: note },
        }),
      (updated) => ({ correction_note: updated.correction_note, previous: story.correction_note })
    );
    if (!result.ok) return result.response;
    return NextResponse.json({ story: result.value });
  }

  const result = await audited<PendingRow>(
    actor,
    { action: "story.correct_request", story, reason: note },
    () => requestCorrection(story.id, actor.userId as string, note),
    (pending) => ({ request: pending.id })
  );
  if (!result.ok) return result.response;
  return NextResponse.json({ request: result.value }, { status: 201 });
}
