import "server-only";

import { NextRequest, NextResponse } from "next/server";
import type { RouteRule } from "@timesprime/server/auth/adminRoutePolicy";
import { ANY_SCOPE } from "@timesprime/server/auth/decide";
import { requirePermission } from "@timesprime/server/auth/requirePermission";
import { decide, getRequest, type RequestRow } from "@timesprime/server/repositories/people";
import { asks } from "@timesprime/server/services/people/reach";
import { auditedPerson, badRequest, conflict, isUuid, ownAccess, peopleFailure, readBody, type Params } from "./people";

// Deciding a Super Admin's request (Panel 1 design §3): approved or declined by a different active
// Super Admin, who is not the person it is about, before it lapses (72 hours); cancelled by the
// person who asked. An approval makes the change in the same transaction (access_decide, migration
// admin-1), which checks all of this again. The kinds that change a Supabase account (adding a
// person, a password link, a factor reset) are decided with Panel 1's M2.

const LATER = new Set(["add_person", "password_link", "mfa_reset"]);

export async function decideRequest(request: NextRequest, { params }: Params, rule: RouteRule, outcome: "approved" | "declined" | "cancelled"): Promise<NextResponse> {
  const { requestId } = await params;
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  const gate = await requirePermission(request, rule, ANY_SCOPE);
  if (!gate.ok) return gate.response;
  const { actor } = gate;
  const now = new Date();

  let found: RequestRow | null;
  try {
    found = isUuid(requestId) ? await getRequest(requestId) : null;
  } catch (err) {
    return peopleFailure(err, "getRequest");
  }
  if (!found) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  const r = found;
  if (r.decided_at) return conflict("This request is already decided.", "decided");

  if (outcome === "cancelled") {
    if (r.requested_by !== actor.userId) {
      return NextResponse.json({ error: "Only the person who asked cancels a request.", code: "not_yours" }, { status: 403 });
    }
  } else {
    if (!asks(actor.record, "role.assign", now)) {
      return NextResponse.json({ error: "A second Super Admin decides a Super Admin's request.", code: "forbidden", required: "role.assign" }, { status: 403 });
    }
    if (r.requested_by === actor.userId) {
      return NextResponse.json({ error: "Someone other than the person who asked decides this.", code: "four_eyes" }, { status: 403 });
    }
    if (r.user_id !== null && r.user_id === actor.userId) return ownAccess();
    if (Date.parse(r.lapses_at) <= now.getTime()) return conflict("This request has lapsed (72 hours). Ask again.", "lapsed");
    if (outcome === "approved" && LATER.has(r.kind)) return conflict("This kind of request is decided once Panel 1's accounts step is built.", "not_yet");
  }

  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;
  const action = outcome === "approved" ? "access.approve" : outcome === "declined" ? "access.decline" : "access.cancel";
  const details = r.details as { language?: string | null; section?: string | null; role?: string };
  const scope = details.role ? { language: details.language ?? null, section: details.section ?? null } : undefined;
  const result = await auditedPerson(
    actor,
    { action, personId: r.user_id ?? r.id, scope, before: { request: r.id, kind: r.kind }, reason: note ?? r.reason },
    () => decide({ requestId: r.id, deciderId: actor.userId as string, outcome, note }),
    (d) => ({ request: d.id, kind: d.kind, outcome: d.outcome, requested_by: d.requested_by, details: d.details })
  );
  if (!result.ok) return result.response;
  return NextResponse.json({ request: result.value });
}
