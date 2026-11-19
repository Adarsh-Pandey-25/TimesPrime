import "server-only";

import { NextRequest, NextResponse } from "next/server";
import type { RouteRule } from "@timesprime/server/auth/adminRoutePolicy";
import { ANY_SCOPE } from "@timesprime/server/auth/decide";
import { requirePermission } from "@timesprime/server/auth/requirePermission";
import {
  authAccount,
  decide,
  endSessions,
  ensureAuthUser,
  findAuthUser,
  getProfile,
  getRequest,
  PeopleStoreError,
  recoveryToken,
  removeFactors,
  type RequestRow,
} from "@timesprime/server/repositories/people";
import { asks } from "@timesprime/server/services/people/reach";
import { readEmail, welcomePath } from "@timesprime/shared/config/people";
import { auditedPerson, badRequest, conflict, isUuid, ownAccess, peopleFailure, readBody, type Params } from "./people";

// Deciding a Super Admin's request (Panel 1 design §3): approved or declined by a different active
// Super Admin, who is not the person it is about, before it lapses (72 hours); cancelled by the
// person who asked. An approval makes the change in the same transaction (access_decide, migration
// admin-1), which checks all of this again.
//
// The kinds that change a Supabase account (M2) do that first, then the decision; each step is safe
// to repeat, so an approval that fails between them is approved again:
//   - add_person: the account (email confirmed, no password), then the profile and first role;
//   - password_link: a one-time "set your password" token;
//   - mfa_reset: every second factor deleted and every session ended.
// A link goes back once, to the Super Admin who approved, to hand over; it is never stored or
// written to the audit log.

interface AuthStep {
  userId: string | null;
  link: string | null;
  factorsRemoved: number | null;
}

async function authStep(r: RequestRow): Promise<AuthStep> {
  const done: AuthStep = { userId: null, link: null, factorsRemoved: null };
  if (r.kind === "add_person") {
    const email = readEmail(r.details.email);
    if (!email) throw new PeopleStoreError(422, "The request has no usable email.");
    const existing = await findAuthUser(email);
    if (existing && (await getProfile(existing.id))) throw new PeopleStoreError(409, "This email is already a staff member.");
    done.userId = await ensureAuthUser(email);
    done.link = welcomePath(await recoveryToken(email));
  } else if (r.kind === "password_link") {
    const email = r.user_id ? (await authAccount(r.user_id))?.email : null;
    if (!email) throw new PeopleStoreError(409, "This account has no email to make a link for.");
    done.link = welcomePath(await recoveryToken(email));
  } else if (r.kind === "mfa_reset" && r.user_id) {
    done.factorsRemoved = await removeFactors(r.user_id);
    await endSessions(r.user_id);
  }
  return done;
}

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
  }

  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;
  const action = outcome === "approved" ? "access.approve" : outcome === "declined" ? "access.decline" : "access.cancel";
  const details = r.details as { language?: string | null; section?: string | null; role?: string; email?: string };
  const scope = details.role ? { language: details.language ?? null, section: details.section ?? null } : undefined;
  const result = await auditedPerson(
    actor,
    { action, personId: r.user_id ?? `email:${details.email ?? r.id}`, scope, before: { request: r.id, kind: r.kind }, reason: note ?? r.reason },
    async () => {
      const step = outcome === "approved" ? await authStep(r) : { userId: null, link: null, factorsRemoved: null };
      const decided = await decide({ requestId: r.id, deciderId: actor.userId as string, outcome, note, userId: step.userId });
      return { decided, step };
    },
    // Never the link: only what was decided, and how many factors went.
    ({ decided, step }) => ({
      request: decided.id,
      kind: decided.kind,
      outcome: decided.outcome,
      requested_by: decided.requested_by,
      user_id: decided.user_id,
      ...(step.factorsRemoved !== null ? { factors_removed: step.factorsRemoved } : {}),
      ...(step.link ? { link_made: true } : {}),
    })
  );
  if (!result.ok) return result.response;
  return NextResponse.json({ request: result.value.decided, ...(result.value.step.link ? { link: result.value.step.link } : {}) });
}
