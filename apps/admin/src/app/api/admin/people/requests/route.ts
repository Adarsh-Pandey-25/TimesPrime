import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { requirePermission } from "@timesprime/server/auth/requirePermission";
import { listProfiles, listRequests } from "@timesprime/server/repositories/people";
import { asks } from "@timesprime/server/services/people/reach";
import { peopleFailure } from "../_lib/people";
import { requestView } from "../_lib/views";

// A Super Admin's requests (Panel 1 design §3 and §4): the open ones, and those decided in the last
// 30 days, each with whether the caller may decide or cancel it. Requests are the Super Admins'
// (the matrix's A); a Managing Editor acts at once and has none, so they get an empty list.
const RULE = ADMIN_ROUTE_RULES["/api/admin/people/requests"].GET;
const RECENT_DAYS = 30;

export async function GET(request: NextRequest) {
  const gate = await requirePermission(request, RULE);
  if (!gate.ok) return gate.response;
  const { actor } = gate;
  const now = new Date();
  if (!asks(actor.record, "role.assign", now)) return NextResponse.json({ requests: [] });
  try {
    const [requests, profiles] = await Promise.all([listRequests(new Date(now.getTime() - RECENT_DAYS * 86_400_000)), listProfiles()]);
    const names = new Map(profiles.map((p) => [p.user_id, p.display_name]));
    return NextResponse.json({ requests: requests.map((r) => requestView(r, names, actor, now)) });
  } catch (err) {
    return peopleFailure(err, "listRequests");
  }
}
