import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { requirePermission } from "@timesprime/server/auth/requirePermission";
import { listCorrections } from "@timesprime/server/repositories/corrections";
import { staffNames, ticketsOf } from "@timesprime/server/repositories/grievances";
import { badRequest, deskFailure } from "../../desk/_lib/desk";

// The corrections log in the back office (Panel 7 design §4, M2): every correction, newest first,
// with who published it, who asked for it, and the grievance that caused it. Read-only: corrections
// are published on the Desk. ?before=<time> for the next page.
const RULE = ADMIN_ROUTE_RULES["/api/admin/compliance/corrections"].GET;
const PAGE = 50;

export async function GET(request: NextRequest) {
  const gate = await requirePermission(request, RULE);
  if (!gate.ok) return gate.response;
  const raw = new URL(request.url).searchParams.get("before");
  const at = raw ? Date.parse(raw) : NaN;
  if (raw && !Number.isFinite(at)) return badRequest("before must be a time.");
  try {
    const rows = await listCorrections(PAGE, raw ? new Date(at).toISOString() : null);
    if (rows === null) return NextResponse.json({ corrections: [], applied: false, more: false });
    const [names, tickets] = await Promise.all([staffNames(rows.flatMap((c) => [c.published_by, c.requested_by])), ticketsOf(rows.map((c) => c.grievance_id))]);
    return NextResponse.json({
      corrections: rows.map((c) => ({
        ...c,
        published_by_name: names.get(c.published_by) ?? "a staff member",
        requested_by_name: c.requested_by ? (names.get(c.requested_by) ?? "a staff member") : null,
        ticket: c.grievance_id ? (tickets.get(c.grievance_id) ?? null) : null,
      })),
      applied: true,
      more: rows.length === PAGE,
    });
  } catch (err) {
    return deskFailure(err, "listCorrections");
  }
}
