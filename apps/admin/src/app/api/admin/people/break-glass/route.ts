import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { ANY_SCOPE } from "@timesprime/server/auth/decide";
import { requirePermission } from "@timesprime/server/auth/requirePermission";
import { activeBreakGlass, endBreakGlass, startBreakGlass } from "@timesprime/server/repositories/people";
import { asks } from "@timesprime/server/services/people/reach";
import { BREAK_GLASS_HOURS } from "@timesprime/shared/config/people";
import { auditedPerson, badRequest, conflict, forbidden, peopleFailure, readBody, reasonOf } from "../_lib/people";

// A Super Admin's own emergency access (Panel 1 design §5): for the night a court order arrives and
// no editor answers. The matrix gives Super Admin article.unpublish / takedown only as F
// (break-glass); a break-glass super_admin row is what turns it on, for at most 2 hours.
//   POST    starts it, alone (the owner's approval, note d), with a reason, after the second factor;
//   DELETE  ends it early. It is never extended: another one needs a new reason.
// The other Super Admins see it at once (GET /api/admin/people/alerts, the top bar), every action
// under it names the break-glass assignment in the audit log, and a takedown made with it reaches
// the Managing Editor and Legal through the Desk's alert list.
const RULES = ADMIN_ROUTE_RULES["/api/admin/people/break-glass"];

export async function POST(request: NextRequest) {
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  const gate = await requirePermission(request, RULES.POST, ANY_SCOPE);
  if (!gate.ok) return gate.response;
  const { actor } = gate;
  const now = new Date();
  if (!asks(actor.record, "role.assign", now)) return forbidden("role.assign", "Break-glass is a Super Admin's own emergency access.");
  const reason = reasonOf(body);
  if (!reason) return badRequest("Say why: a reason is required for emergency access.");

  try {
    if ((await activeBreakGlass(now)).some((r) => r.user_id === actor.userId)) {
      return conflict("Your emergency access is already on. It cannot be extended; end it and start a new one if needed.", "active");
    }
  } catch (err) {
    return peopleFailure(err, "activeBreakGlass");
  }

  const result = await auditedPerson(
    actor,
    { action: "access.break_glass_start", personId: actor.userId as string, reason },
    () => startBreakGlass(actor.userId as string, reason, now, BREAK_GLASS_HOURS),
    (a) => ({ assignment: a.id, expires_at: a.expires_at })
  );
  if (!result.ok) return result.response;
  return NextResponse.json({ assignment: result.value, until: result.value.expires_at }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const gate = await requirePermission(request, RULES.DELETE, ANY_SCOPE);
  if (!gate.ok) return gate.response;
  const { actor } = gate;
  const now = new Date();
  if (!asks(actor.record, "role.assign", now)) return forbidden("role.assign", "Break-glass is a Super Admin's own emergency access.");
  try {
    if (!(await activeBreakGlass(now)).some((r) => r.user_id === actor.userId)) return conflict("Your emergency access is not on.", "not_active");
  } catch (err) {
    return peopleFailure(err, "activeBreakGlass");
  }

  const result = await auditedPerson(
    actor,
    { action: "access.break_glass_end", personId: actor.userId as string, reason: "ended early" },
    () => endBreakGlass(actor.userId as string, actor.userId as string, "ended early", now),
    (ended) => ({ ended: ended.map((r) => r.id) })
  );
  if (!result.ok) return result.response;
  return NextResponse.json({ ended: result.value.length });
}
