import "server-only";

import type { NextRequest } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { moveStory, type Params } from "../../../_lib/desk";

// Publishes the approved revision (Publish Guard; never before the embargo) (Panel 2 design §3). The checks and the audit are in moveStory.
export function POST(request: NextRequest, context: Params) {
  return moveStory(request, context, "publish", ADMIN_ROUTE_RULES["/api/admin/desk/stories/[id]/publish"].POST);
}
