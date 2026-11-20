import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { decideGrievance } from "@timesprime/server/repositories/grievances";
import { GRIEVANCE_LIMITS, isGrievanceOutcome } from "@timesprime/shared/config/grievances";
import { badRequest, readBody, type Params } from "../../../../desk/_lib/desk";
import { audited, conflict, gateGrievance, grievanceAudit, grievanceView } from "../../../_lib/grievances";

// The decision on a grievance (design §2 and §3): its outcome and the reply told to the complainant,
// shown on the status page; the officer also emails it by hand (decision 2). Final: the database
// refuses any change after it. The Grievance Officer's own, as the rules give it to them: no second
// person. Body: { outcome, reply }.
const RULE = ADMIN_ROUTE_RULES["/api/admin/compliance/grievances/[id]/decide"].POST;

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const gated = await gateGrievance(request, RULE, id);
  if (!gated.ok) return gated.response;
  const { actor, grievance } = gated;

  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  if (!isGrievanceOutcome(body.outcome)) return badRequest("outcome must be one of the listed outcomes.");
  const outcome = body.outcome;
  const reply = typeof body.reply === "string" ? body.reply.trim() : "";
  if (!reply || reply.length > GRIEVANCE_LIMITS.reply) return badRequest(`The reply to the complainant is 1 to ${GRIEVANCE_LIMITS.reply} characters.`);
  if (grievance.state !== "open") return conflict("This grievance is decided: a decision is final.", "decided");

  const done = await audited(actor, grievanceAudit("grievance.decide", grievance), () => decideGrievance(grievance.id, actor.userId as string, outcome, reply), (g) => ({
    ticket: g.ticket,
    outcome: g.outcome,
    reply: g.reply,
    decided_at: g.decided_at,
    on_time: g.decided_at !== null && Date.parse(g.decided_at) <= Date.parse(g.decide_due_at),
  }));
  if (!done.ok) return done.response;
  return NextResponse.json({ grievance: grievanceView(done.value, true, new Map()) });
}
