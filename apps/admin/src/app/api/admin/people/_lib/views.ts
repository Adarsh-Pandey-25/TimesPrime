import "server-only";

import type { Actor } from "@timesprime/server/auth/requirePermission";
import type { AssignmentRow, AuthAccount, ProfileRow, RequestRow } from "@timesprime/server/repositories/people";
import { asks, isTheirPerson, liveRows, ownScopes, planFor, withinReach } from "@timesprime/server/services/people/reach";
import { GRANTABLE_ROLES, MANAGING_EDITOR_GRANTS } from "@timesprime/shared/config/people";

// What Panel 1's API sends back: only what the screens need (Next 16's data-security guide:
// "return only what the UI needs"). What the caller may do is worked out here from the same rules
// the routes apply, for the screens to offer; the routes decide again on every change.

export type Plan = "act" | "ask" | null;

export function roleView(r: AssignmentRow, now: Date) {
  const state = r.revoked_at ? "revoked" : Date.parse(r.expires_at) <= now.getTime() ? "expired" : "live";
  return {
    id: r.id,
    role: r.role_key,
    language: r.language,
    section: r.section,
    isBreakGlass: r.is_break_glass,
    grantedBy: r.granted_by,
    approvedBy: r.approved_by,
    reason: r.reason,
    grantedAt: r.granted_at,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
    revokeReason: r.revoke_reason,
    state,
  };
}

export function personView(profile: ProfileRow, rows: readonly AssignmentRow[], account: AuthAccount | null | undefined, now: Date) {
  return {
    userId: profile.user_id,
    name: profile.display_name,
    status: profile.status,
    email: account?.email ?? null,
    /** null when Supabase Auth could not be asked. */
    hasFactor: account ? account.hasFactor : null,
    lastSignInAt: profile.last_sign_in_at,
    createdAt: profile.created_at,
    roles: liveRows(rows, now).map((r) => roleView(r, now)),
  };
}

/** Who the caller is, for the screens: whether they ask (A) or act within their scopes (S). */
export function callerView(actor: Actor, now: Date) {
  const scopes = ownScopes(actor.record, "role.assign", now);
  const asking = asks(actor.record, "role.assign", now);
  return {
    userId: actor.userId,
    asks: asking,
    scopes,
    grantable: asking ? [...GRANTABLE_ROLES] : scopes.length > 0 ? [...MANAGING_EDITOR_GRANTS] : [],
  };
}

/** What the caller may do to one person, by the rules the routes apply. */
export function personPlans(actor: Actor, profile: ProfileRow, rows: readonly AssignmentRow[], now: Date) {
  const self = actor.userId === profile.user_id;
  const theirs = (scopes: Parameters<typeof isTheirPerson>[0]) => isTheirPerson(scopes, rows, now);
  const account = (removes: boolean): Plan => (self ? null : planFor(actor.record, "user.manage", now, theirs, removes));
  const roles = Object.fromEntries(
    rows
      .filter((r) => r.revoked_at === null && !r.is_break_glass)
      .map((r) => {
        const inReach = (scopes: Parameters<typeof withinReach>[0]) => withinReach(scopes, r.role_key, r);
        return [r.id, { renew: self ? null : planFor(actor.record, "role.assign", now, inReach), revoke: self ? null : planFor(actor.record, "role.assign", now, inReach, true) }];
      })
  );
  return {
    rename: account(false),
    suspend: profile.status === "active" ? account(true) : null,
    reactivate: profile.status === "suspended" ? account(false) : null,
    signOut: self ? ("act" as Plan) : account(true),
    grant: self ? null : planFor(actor.record, "role.assign", now, (scopes) => scopes.length > 0),
    // M2: a one-time password link (as rename: their people at once, else a request), and a lost
    // factor's reset (only Super Admins, always a request).
    passwordLink: profile.status === "active" ? account(false) : null,
    mfaReset: self ? null : asks(actor.record, "user.manage", now) ? ("ask" as Plan) : null,
    roles,
  };
}

export function requestView(r: RequestRow, names: ReadonlyMap<string, string>, actor: Actor, now: Date) {
  const open = r.decided_at === null;
  const lapsed = open && Date.parse(r.lapses_at) <= now.getTime();
  const mine = r.requested_by === actor.userId;
  const aboutMe = r.user_id !== null && r.user_id === actor.userId;
  const name = (id: string | null) => (id ? (names.get(id) ?? null) : null);
  return {
    id: r.id,
    kind: r.kind,
    userId: r.user_id,
    userName: name(r.user_id) ?? (typeof r.details.display_name === "string" ? r.details.display_name : null),
    details: r.details,
    reason: r.reason,
    requestedBy: r.requested_by,
    requestedByName: name(r.requested_by),
    requestedAt: r.requested_at,
    lapsesAt: r.lapses_at,
    lapsed,
    decidedBy: r.decided_by,
    decidedByName: name(r.decided_by),
    decidedAt: r.decided_at,
    outcome: r.outcome,
    note: r.note,
    mine,
    canDecide: open && !lapsed && !mine && !aboutMe && asks(actor.record, "role.assign", now),
    canCancel: open && mine,
  };
}
