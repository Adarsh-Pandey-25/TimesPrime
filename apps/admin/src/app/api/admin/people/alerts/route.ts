import "server-only";

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { requirePermission } from "@timesprime/server/auth/requirePermission";
import { activeBreakGlass, lastReview, listAssignments, listProfiles, type ReviewRow } from "@timesprime/server/repositories/people";
import { asks, canSee } from "@timesprime/server/services/people/reach";
import { endingSoon, reviewDue } from "@timesprime/server/services/people/review";
import { peopleFailure } from "../_lib/people";

// What needs a look now (Panel 1 design §5 and §6), for the back office's top bar and the
// directory:
//   - breakGlass: every Super Admin's emergency access in use, for the other Super Admins (and
//     the one using it); it is the alert break-glass promises;
//   - review: when the access review is due (every 90 days), for Super Admins;
//   - endingSoon: live roles ending within 14 days, among the people the caller sees.
// If the review's table is not there yet (migration admin-2 not applied), review is null.
const RULE = ADMIN_ROUTE_RULES["/api/admin/people/alerts"].GET;

export async function GET(request: NextRequest) {
  const gate = await requirePermission(request, RULE);
  if (!gate.ok) return gate.response;
  const { actor } = gate;
  const now = new Date();
  const superAdmin = asks(actor.record, "role.assign", now);
  try {
    const [rows, profiles] = await Promise.all([listAssignments(), listProfiles()]);
    const names = new Map(profiles.map((p) => [p.user_id, p.display_name]));
    const byUser = new Map<string, typeof rows>();
    for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);

    let review = null;
    if (superAdmin) {
      let last: ReviewRow | null = null;
      try {
        last = await lastReview();
        review = { ...reviewDue(last, now), lastByName: last ? (names.get(last.completed_by) ?? null) : null };
      } catch (err) {
        console.error("The last access review could not be read:", err);
        Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "lastReview" } });
      }
    }

    const breakGlass = superAdmin
      ? (await activeBreakGlass(now)).map((r) => ({
          assignmentId: r.id,
          userId: r.user_id,
          name: names.get(r.user_id) ?? null,
          since: r.granted_at,
          until: r.expires_at,
          reason: r.reason,
          mine: r.user_id === actor.userId,
        }))
      : [];

    const soon = endingSoon(rows, now)
      .filter((r) => canSee(actor.record, byUser.get(r.user_id) ?? [], now))
      .map((r) => ({ assignmentId: r.id, userId: r.user_id, name: names.get(r.user_id) ?? null, role: r.role_key, language: r.language, section: r.section, expiresAt: r.expires_at }));

    return NextResponse.json({ breakGlass, review, endingSoon: soon });
  } catch (err) {
    return peopleFailure(err, "alerts");
  }
}
