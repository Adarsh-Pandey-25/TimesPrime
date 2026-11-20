import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { acknowledgeGrievance } from "@timesprime/server/repositories/grievances";
import type { Params } from "../../../../desk/_lib/desk";
import { audited, conflict, gateGrievance, grievanceAudit, grievanceView } from "../../../_lib/grievances";

// The officer has acknowledged a grievance that arrived by email, post or another way (design §2):
// its 24-hour clock stops. The form's grievances are acknowledged on the spot.
const RULE = ADMIN_ROUTE_RULES["/api/admin/compliance/grievances/[id]/acknowledge"].POST;

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const gated = await gateGrievance(request, RULE, id);
  if (!gated.ok) return gated.response;
  const { actor, grievance } = gated;
  if (grievance.state !== "open" || grievance.acknowledged_at !== null) return conflict("This grievance was already acknowledged.", "acknowledged");

  const done = await audited(actor, grievanceAudit("grievance.acknowledge", grievance), () => acknowledgeGrievance(grievance.id, actor.userId as string), (g) => ({
    ticket: g.ticket,
    acknowledged_at: g.acknowledged_at,
  }));
  if (!done.ok) return done.response;
  return NextResponse.json({ grievance: grievanceView(done.value, true, new Map()) });
}
