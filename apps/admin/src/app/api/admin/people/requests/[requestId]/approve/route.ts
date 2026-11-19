import "server-only";

import type { NextRequest } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { decideRequest } from "../../../_lib/decision";
import type { Params } from "../../../_lib/people";

// Approves a Super Admin's request: a different active Super Admin, before it lapses; the change is made in the same transaction (Panel 1 design §3).
const RULE = ADMIN_ROUTE_RULES["/api/admin/people/requests/[requestId]/approve"].POST;

export async function POST(request: NextRequest, context: Params) {
  return decideRequest(request, context, RULE, "approved");
}
