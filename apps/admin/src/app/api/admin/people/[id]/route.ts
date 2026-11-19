import "server-only";

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { decide } from "@timesprime/server/auth/decide";
import { authAccount, listProfiles, listRequests, personHistory, rename, type AuthAccount } from "@timesprime/server/repositories/people";
import { isTheirPerson, planFor } from "@timesprime/server/services/people/reach";
import { ask, auditedPerson, badRequest, forbidden, gatePerson, ownAccess, peopleFailure, readBody, reasonOf, type Params } from "../_lib/people";
import { callerView, personPlans, personView, requestView, roleView } from "../_lib/views";

// One person (Panel 1 design §4): their account, every role they hold or held, the requests about
// them in the last 30 days, and, for a holder of audit.read, what was done to them. PATCH renames
// them: a Managing Editor for their people at once, a Super Admin by a request.
const RULES = ADMIN_ROUTE_RULES["/api/admin/people/[id]"];
const RECENT_DAYS = 30;
const NAME_MAX = 100;

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const gated = await gatePerson(request, RULES.GET, id);
  if (!gated.ok) return gated.response;
  const { actor, person, now } = gated;
  const { profile, rows } = person;
  try {
    let account: AuthAccount | null | undefined;
    try {
      account = await authAccount(profile.user_id);
    } catch (err) {
      console.error("Supabase Auth's account could not be read:", err);
      Sentry.captureException(err, { tags: { source: "supabase-auth" }, extra: { operation: "authAccount" } });
      account = undefined;
    }
    const readsAudit = decide({ staff: actor.record, aal: actor.aal ?? "aal1", permission: "audit.read", mode: "read", now }).allowed;
    const [requests, profiles, history] = await Promise.all([
      listRequests(new Date(now.getTime() - RECENT_DAYS * 86_400_000), profile.user_id),
      listProfiles(),
      readsAudit ? personHistory(profile.user_id) : Promise.resolve(null),
    ]);
    const names = new Map(profiles.map((p) => [p.user_id, p.display_name]));
    return NextResponse.json({
      person: personView(profile, rows, account, now),
      assignments: rows.map((r) => ({ ...roleView(r, now), grantedByName: names.get(r.granted_by ?? "") ?? null, approvedByName: names.get(r.approved_by ?? "") ?? null })),
      requests: requests.map((r) => requestView(r, names, actor, now)),
      history,
      can: personPlans(actor, profile, rows, now),
      caller: callerView(actor, now),
    });
  } catch (err) {
    return peopleFailure(err, "getPerson");
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  const gated = await gatePerson(request, RULES.PATCH, id);
  if (!gated.ok) return gated.response;
  const { actor, person, now } = gated;
  const { profile, rows } = person;

  if (actor.userId === profile.user_id) return ownAccess();
  const name = typeof body.display_name === "string" ? body.display_name.trim() : "";
  if (!name || name.length > NAME_MAX) return badRequest(`display_name is required, at most ${NAME_MAX} characters.`);
  const reason = reasonOf(body);
  if (!reason) return badRequest("A reason is required.");
  if (name === profile.display_name) return badRequest("That is already their name.");

  const plan = planFor(actor.record, "user.manage", now, (scopes) => isTheirPerson(scopes, rows, now));
  if (plan === null) return forbidden("user.manage", "A Managing Editor renames only the people of their own desks.");
  if (plan === "ask") return ask(actor, "rename", profile.user_id, { display_name: name }, reason);

  const result = await auditedPerson(
    actor,
    { action: "staff.rename", personId: profile.user_id, before: { display_name: profile.display_name }, reason },
    () => rename(profile.user_id, name),
    (p) => ({ display_name: p.display_name })
  );
  if (!result.ok) return result.response;
  return NextResponse.json({ person: personView(result.value, rows, null, now) });
}
