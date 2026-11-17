import "server-only";

import type { NextRequest } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { moveStory, type Params } from "../../../_lib/desk";

// Schedules an approved story; the worker publishes it (Panel 2 design §3). The checks and the audit are in moveStory.
export function POST(request: NextRequest, context: Params) {
  return moveStory(request, context, "schedule", ADMIN_ROUTE_RULES["/api/admin/desk/stories/[id]/schedule"].POST);
}
