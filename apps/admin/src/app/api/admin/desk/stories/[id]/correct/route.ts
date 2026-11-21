import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { decide } from "@timesprime/server/auth/decide";
import { publishCorrection, type CorrectionRow } from "@timesprime/server/repositories/corrections";
import { grievanceIdByTicket } from "@timesprime/server/repositories/grievances";
import { requestCorrection, type PendingRow } from "@timesprime/server/repositories/stories";
import { DEFAULT_CORRECTION_KIND, isCorrectionKind } from "@timesprime/shared/config/corrections";
import { CORRECTION_NOTE_MAX } from "@timesprime/shared/config/desk";
import { normaliseTicket, TICKET_PATTERN } from "@timesprime/shared/config/grievances";
import { audited, badRequest, deskFailure, gateStory, readBody, staffLabel, storyTarget, type Params } from "../../../_lib/desk";

// A live story's public correction (Panel 2 design §3, "Update a live story"; Panel 7, M2): readers
// see every correction under the story and on /corrections. correction.publish is S for a Desk Editor
// and F for the Managing Editor, who publish it here at once; it is A for a Sub-editor, who asks, and
// a holder of S or F decides (pending/[actionId]/decide). Each has a kind (decision 6) and may name
// the grievance that caused it, by its ticket. Either way it is audited, and the log keeps every one.
// Body: { note, kind? (correction if absent), grievance? (a ticket) }.
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
  const kind = body.kind === undefined || body.kind === null ? DEFAULT_CORRECTION_KIND : body.kind;
  if (!isCorrectionKind(kind)) return badRequest("kind must be correction, clarification, update, editors_note or retraction.");
  const rawTicket = typeof body.grievance === "string" ? body.grievance.trim() : "";
  if (body.grievance !== undefined && body.grievance !== null && typeof body.grievance !== "string") return badRequest("grievance must be a ticket, like G-2026-00042.");
  const ticket = rawTicket ? normaliseTicket(rawTicket) : null;
  if (ticket !== null && !TICKET_PATTERN.test(ticket)) return badRequest("grievance must be a ticket, like G-2026-00042.");

  // The grievance a ticket names. Only whether it exists is learned: the grievance itself stays the
  // Grievance Officer's.
  let grievanceId: string | null = null;
  if (ticket) {
    try {
      grievanceId = await grievanceIdByTicket(ticket);
    } catch (err) {
      return deskFailure(err, "grievanceIdByTicket");
    }
    if (!grievanceId) return NextResponse.json({ error: `No grievance has the ticket ${ticket}.`, code: "unknown_ticket" }, { status: 422 });
  }

  // The gate let an A holder through (twoPerson): decide again whether this person publishes it or asks.
  const direct = decide({ staff: actor.record, aal: actor.aal ?? "aal1", permission: "correction.publish", mode: "act", target: storyTarget(story), now: new Date() });

  if (direct.allowed) {
    const result = await audited<CorrectionRow>(
      actor,
      { action: "story.correct", story, reason: note },
      () => publishCorrection({ storyId: story.id, actorId: actor.userId as string, actorLabel: staffLabel(actor), kind, text: note, grievanceId }),
      (correction) => ({ correction: correction.id, kind: correction.kind, grievance: ticket, correction_note: correction.text, previous: story.correction_note })
    );
    if (!result.ok) return result.response;
    return NextResponse.json({ story: { ...story, correction_note: result.value.text }, correction: result.value });
  }

  const result = await audited<PendingRow>(
    actor,
    { action: "story.correct_request", story, reason: note },
    () => requestCorrection(story.id, actor.userId as string, note, { kind, grievanceId }),
    (pending) => ({ request: pending.id, kind, grievance: ticket })
  );
  if (!result.ok) return result.response;
  return NextResponse.json({ request: result.value }, { status: 201 });
}
