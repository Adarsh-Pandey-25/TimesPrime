import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { requirePermission } from "@timesprime/server/auth/requirePermission";
import { SITE_WIDE } from "@timesprime/server/auth/scope";
import {
  countOpenGrievances,
  enterGrievance,
  listGrievances,
  staffNames,
  storyIdByNumber,
  type QueueFilter,
} from "@timesprime/server/repositories/grievances";
import { grievanceFields, isEnteredChannel, normaliseTicket, TICKET_PATTERN } from "@timesprime/shared/config/grievances";
import { isSection } from "@timesprime/shared/config/sections";
import { deskStoryNumberFrom } from "@timesprime/shared/lib/storyUrl";
import { badRequest, readBody } from "../../desk/_lib/desk";
import { audited, complianceFailure, grievanceView, mayHandle, peopleOn } from "../_lib/grievances";

// The grievance queue (Panel 7 design §4, M1), and a grievance received by email, post or another
// way, typed in by an officer. Reading is grievance.handle at any code (the Managing Editor's R sees
// the emails masked); typing one in is the Grievance Officer's or Legal's, site-wide.
const RULES = ADMIN_ROUTE_RULES["/api/admin/compliance/grievances"];
const FILTERS: readonly QueueFilter[] = ["open", "decided", "all"];

/** ?state=open|decided|all (open if absent) &ticket=G-…: the queue, the open counts, and whether the caller may act. */
export async function GET(request: NextRequest) {
  const gate = await requirePermission(request, RULES.GET);
  if (!gate.ok) return gate.response;
  const url = new URL(request.url);
  const state = (url.searchParams.get("state") ?? "open") as QueueFilter;
  if (!FILTERS.includes(state)) return badRequest("state must be open, decided or all.");
  const rawTicket = url.searchParams.get("ticket");
  const ticket = rawTicket ? normaliseTicket(rawTicket) : null;
  if (ticket !== null && !TICKET_PATTERN.test(ticket)) return badRequest("A ticket looks like G-2026-00042.");
  const now = new Date();
  const handler = mayHandle(gate.actor, now);
  try {
    const [rows, counts] = await Promise.all([listGrievances(state, ticket), countOpenGrievances(now)]);
    const names = await staffNames(peopleOn(rows));
    return NextResponse.json({ grievances: rows.map((row) => grievanceView(row, handler, names)), counts, may_handle: handler });
  } catch (err) {
    return complianceFailure(err, "listGrievances");
  }
}

const YEAR = 365 * 86_400_000;

/**
 * Types in a grievance received another way. Body: { channel: email|post|other, language, name,
 * email, about_url?, category, body, received_at? (when it arrived; now if absent, within the past
 * year), acknowledged? (already acknowledged by the officer) }. Its clocks run from received_at.
 */
export async function POST(request: NextRequest) {
  const gate = await requirePermission(request, RULES.POST, SITE_WIDE);
  if (!gate.ok) return gate.response;
  const actor = gate.actor;

  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  if (!isEnteredChannel(body.channel)) return badRequest("channel must be email, post or other: the form's grievances come from readers.");
  const checked = grievanceFields(body);
  if (!checked.ok) return badRequest(checked.error);
  const now = Date.now();
  let receivedAt: string | null = null;
  if (body.received_at !== undefined && body.received_at !== null) {
    const at = typeof body.received_at === "string" ? Date.parse(body.received_at) : NaN;
    if (!Number.isFinite(at)) return badRequest("received_at must be a time, or absent for now.");
    if (at > now) return badRequest("received_at cannot be in the future.");
    if (at < now - YEAR) return badRequest("received_at must be within the past year.");
    receivedAt = new Date(at).toISOString();
  }
  if (body.acknowledged !== undefined && typeof body.acknowledged !== "boolean") return badRequest("acknowledged must be true or false.");

  // The Desk story the address names, in any state: a grievance may be about one taken down.
  let storyId: string | null = null;
  const number = checked.fields.aboutUrl ? deskStoryNumberFrom(checked.fields.aboutUrl, isSection) : null;
  if (number !== null) {
    try {
      storyId = await storyIdByNumber(number, false);
    } catch (err) {
      return complianceFailure(err, "storyIdByNumber");
    }
  }

  const done = await audited(
    actor,
    { action: "grievance.create", entityType: "grievance", entityId: "new", target: SITE_WIDE, before: null, reason: null },
    () =>
      enterGrievance({
        actorId: actor.userId as string,
        channel: body.channel as "email" | "post" | "other",
        fields: checked.fields,
        storyId,
        receivedAt,
        acknowledged: body.acknowledged === true,
      }),
    (g) => ({ grievance: g.id, ticket: g.ticket, channel: g.channel, category: g.category, received_at: g.received_at, story_id: g.story_id, acknowledged: g.acknowledged_at !== null })
  );
  if (!done.ok) return done.response;
  return NextResponse.json({ grievance: grievanceView(done.value, true, new Map()) }, { status: 201 });
}
