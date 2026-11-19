import "server-only";

import type { NextRequest } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { decideRequest } from "../../../_lib/decision";
import type { Params } from "../../../_lib/people";

// Cancels a request: only the person who asked, while it is open (Panel 1 design §3).
const RULE = ADMIN_ROUTE_RULES["/api/admin/people/requests/[requestId]/cancel"].POST;

export async function POST(request: NextRequest, context: Params) {
  return decideRequest(request, context, RULE, "cancelled");
}
