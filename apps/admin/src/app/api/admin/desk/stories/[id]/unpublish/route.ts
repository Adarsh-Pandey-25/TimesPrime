import "server-only";

import type { NextRequest } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { moveStory, type Params } from "../../../_lib/desk";

// Takes a story down: one person, at once, with a reason code and a note (Panel 2 design §3). The checks and the audit are in moveStory.
export function POST(request: NextRequest, context: Params) {
  return moveStory(request, context, "unpublish", ADMIN_ROUTE_RULES["/api/admin/desk/stories/[id]/unpublish"].POST);
}
