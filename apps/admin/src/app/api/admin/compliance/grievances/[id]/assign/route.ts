import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { assignGrievance } from "@timesprime/server/repositories/grievances";
import type { Params } from "../../../../desk/_lib/desk";
import { audited, conflict, gateGrievance, grievanceAudit, grievanceView } from "../../../_lib/grievances";

// "I'll handle this" (design §2): the caller takes an open grievance. Whoever may act on grievances
// may take one, also from a colleague; the audit log keeps who had it before.
const RULE = ADMIN_ROUTE_RULES["/api/admin/compliance/grievances/[id]/assign"].POST;

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const gated = await gateGrievance(request, RULE, id);
  if (!gated.ok) return gated.response;
  const { actor, grievance } = gated;
  const me = actor.userId as string;
  if (grievance.state !== "open") return conflict("This grievance is decided: a decision is final.", "decided");
  if (grievance.assigned_to === me) return conflict("You already handle this grievance.", "already_yours");

  const done = await audited(actor, grievanceAudit("grievance.assign", grievance), () => assignGrievance(grievance.id, me, me), (g) => ({
    ticket: g.ticket,
    assigned_to: g.assigned_to,
  }));
  if (!done.ok) return done.response;
  return NextResponse.json({ grievance: grievanceView(done.value, true, new Map()) });
}
