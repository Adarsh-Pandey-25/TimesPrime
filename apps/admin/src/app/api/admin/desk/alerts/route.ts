import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { requirePermission } from "@timesprime/server/auth/requirePermission";
import { ALERT_DAYS, listTakedowns } from "@timesprime/server/repositories/stories";
import { deskFailure, scopesFor } from "../_lib/desk";

// The Desk's alert list (Panel 2 design §8, owner decision 5): the stories unpublished or retracted
// in the last 30 days, for whoever may take stories down (article.unpublish: the Managing Editor and
// Legal everywhere, a Desk Editor in their desk), so a takedown never goes unseen. The audit log has
// every one as well; email waits for an email service.
const RULE = ADMIN_ROUTE_RULES["/api/admin/desk/alerts"].GET;

export async function GET(request: NextRequest) {
  const gate = await requirePermission(request, RULE);
  if (!gate.ok) return gate.response;
  const now = new Date();
  try {
    const alerts = await listTakedowns(scopesFor(gate.actor, "article.unpublish", ["F", "S"], now), now);
    return NextResponse.json({ alerts, days: ALERT_DAYS });
  } catch (err) {
    return deskFailure(err, "listTakedowns");
  }
}
