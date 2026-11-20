import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { addGrievanceNote } from "@timesprime/server/repositories/grievances";
import { GRIEVANCE_LIMITS } from "@timesprime/shared/config/grievances";
import { badRequest, readBody, type Params } from "../../../../desk/_lib/desk";
import { audited, gateGrievance, grievanceAudit } from "../../../_lib/grievances";

// An internal note on a grievance (design §2): append-only, at any time, also after the decision (an
// appeal, a follow-up). Never shown to the complainant. Body: { body }.
const RULE = ADMIN_ROUTE_RULES["/api/admin/compliance/grievances/[id]/notes"].POST;

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const gated = await gateGrievance(request, RULE, id);
  if (!gated.ok) return gated.response;
  const { actor, grievance } = gated;

  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text || text.length > GRIEVANCE_LIMITS.note) return badRequest(`A note is 1 to ${GRIEVANCE_LIMITS.note} characters.`);

  const done = await audited(actor, grievanceAudit("grievance.note", grievance), () => addGrievanceNote(grievance.id, actor.userId as string, text), (n) => ({
    ticket: grievance.ticket,
    note: n.id,
    body: n.body,
  }));
  if (!done.ok) return done.response;
  return NextResponse.json({ note: { ...done.value, author_name: actor.label } }, { status: 201 });
}
