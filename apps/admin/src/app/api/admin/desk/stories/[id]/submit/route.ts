import "server-only";

import type { NextRequest } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { moveStory, type Params } from "../../../_lib/desk";

// Sends a draft to review, or a reviewed story to the desk (Panel 2 design §3). The checks and the audit are in moveStory.
export function POST(request: NextRequest, context: Params) {
  return moveStory(request, context, "submit", ADMIN_ROUTE_RULES["/api/admin/desk/stories/[id]/submit"].POST);
}
