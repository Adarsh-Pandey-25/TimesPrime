import "server-only";

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { requirePermission } from "@timesprime/server/auth/requirePermission";
import { authAccounts, listAssignments, listProfiles, type AssignmentRow, type AuthAccount } from "@timesprime/server/repositories/people";
import { canSee } from "@timesprime/server/services/people/reach";
import { peopleFailure } from "./_lib/people";
import { callerView, personView } from "./_lib/views";

// The staff directory (Panel 1 design §4): everyone for a Super Admin, a Managing Editor's desks
// for them; each person's status, live roles with desk and expiry, second factor and last sign-in.
// If Supabase Auth cannot be asked, the directory still comes back, without emails and factors.
const RULE = ADMIN_ROUTE_RULES["/api/admin/people"].GET;

export async function GET(request: NextRequest) {
  const gate = await requirePermission(request, RULE);
  if (!gate.ok) return gate.response;
  const { actor } = gate;
  const now = new Date();
  try {
    const [profiles, rows] = await Promise.all([listProfiles(), listAssignments()]);
    let accounts: Map<string, AuthAccount> | null = null;
    try {
      accounts = await authAccounts();
    } catch (err) {
      console.error("Supabase Auth's accounts could not be read:", err);
      Sentry.captureException(err, { tags: { source: "supabase-auth" }, extra: { operation: "authAccounts" } });
    }
    const byUser = new Map<string, AssignmentRow[]>();
    for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
    const people = profiles
      .filter((p) => canSee(actor.record, byUser.get(p.user_id) ?? [], now))
      .map((p) => personView(p, byUser.get(p.user_id) ?? [], accounts ? (accounts.get(p.user_id) ?? null) : undefined, now));
    return NextResponse.json({ people, caller: callerView(actor, now), accounts: accounts !== null });
  } catch (err) {
    return peopleFailure(err, "listPeople");
  }
}
