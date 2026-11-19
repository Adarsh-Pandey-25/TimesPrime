import "server-only";

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { ANY_SCOPE } from "@timesprime/server/auth/decide";
import { requirePermission } from "@timesprime/server/auth/requirePermission";
import { authAccounts, lastReview, listAssignments, listProfiles, recordReview, type AuthAccount } from "@timesprime/server/repositories/people";
import { asks } from "@timesprime/server/services/people/reach";
import { REVIEW_DECISIONS, reviewDue, reviewItems, reviewSnapshot, type ReviewDecision } from "@timesprime/server/services/people/review";
import { auditedPerson, badRequest, forbidden, isUuid, peopleFailure, readBody } from "../_lib/people";

// The access review (Panel 1 design §6): every 90 days a Super Admin goes through every live
// assignment (and every expired one never revoked), each flagged if the person has not signed in
// for 60 days, has no second factor, holds a privileged role, or the row expired. Revoking and
// renewing go through their own routes as usual (revoke at once; a Super Admin's renewal is a
// request); completing the review records who, when, a note, and a snapshot read from the
// database now, with the decision marked for each row (migration admin-2: append-only).
const RULES = ADMIN_ROUTE_RULES["/api/admin/people/review"];
const NOTE_MAX = 2000;

const superAdminOnly = () => forbidden("role.assign", "The access review is a Super Admin's.");

export async function GET(request: NextRequest) {
  const gate = await requirePermission(request, RULES.GET);
  if (!gate.ok) return gate.response;
  const { actor } = gate;
  const now = new Date();
  if (!asks(actor.record, "role.assign", now)) return superAdminOnly();
  try {
    const [rows, profiles, last] = await Promise.all([listAssignments(), listProfiles(), lastReview()]);
    let accounts: Map<string, AuthAccount> | null = null;
    try {
      accounts = await authAccounts();
    } catch (err) {
      console.error("Supabase Auth's accounts could not be read:", err);
      Sentry.captureException(err, { tags: { source: "supabase-auth" }, extra: { operation: "authAccounts" } });
    }
    return NextResponse.json({ items: reviewItems(rows, profiles, accounts, now), due: reviewDue(last, now), accounts: accounts !== null });
  } catch (err) {
    return peopleFailure(err, "review");
  }
}

export async function POST(request: NextRequest) {
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  const gate = await requirePermission(request, RULES.POST, ANY_SCOPE);
  if (!gate.ok) return gate.response;
  const { actor } = gate;
  const now = new Date();
  if (!asks(actor.record, "role.assign", now)) return superAdminOnly();

  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
  if (note && note.length > NOTE_MAX) return badRequest(`The note is at most ${NOTE_MAX} characters.`);
  const raw = body.decisions ?? {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return badRequest("decisions must be an object of assignment id to decision.");
  const decisions: Record<string, ReviewDecision> = {};
  for (const [id, decision] of Object.entries(raw as Record<string, unknown>)) {
    if (!isUuid(id) || !(REVIEW_DECISIONS as readonly unknown[]).includes(decision)) {
      return badRequest(`Each decision is one of ${REVIEW_DECISIONS.join(", ")}, for an assignment id.`);
    }
    decisions[id] = decision as ReviewDecision;
  }

  const result = await auditedPerson(
    actor,
    { action: "access.review_complete", personId: actor.userId as string, reason: note },
    async () => {
      const [rows, profiles] = await Promise.all([listAssignments(), listProfiles()]);
      const snapshot = reviewSnapshot(rows, profiles, decisions);
      const review = await recordReview(actor.userId as string, note, snapshot);
      return { review, snapshot };
    },
    ({ review, snapshot }) => ({
      review: review.id,
      items: snapshot.length,
      revoked: snapshot.filter((s) => s.decision === "revoked").length,
      renewals: snapshot.filter((s) => s.decision === "renew_asked" || s.decision === "renewed").length,
    })
  );
  if (!result.ok) return result.response;
  return NextResponse.json({ review: result.value.review, items: result.value.snapshot.length }, { status: 201 });
}
