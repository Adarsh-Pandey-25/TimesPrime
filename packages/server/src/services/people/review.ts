import "server-only";

import { ENDING_SOON_DAYS, isPrivilegedRole, REVIEW_EVERY_DAYS, STALE_SIGN_IN_DAYS } from "@timesprime/shared/config/people";
import type { AssignmentRow, AuthAccount, ProfileRow } from "../../repositories/people";

// The access review and its reminders (Panel 1 design §6), as pure functions: what a Super Admin
// goes through every 90 days, with the flags that need a look, when the next review is due, and
// which roles end soon. The routes load the data; these decide nothing about who may see it.

const DAY = 86_400_000;

export interface ReviewItem {
  assignmentId: string;
  userId: string;
  name: string;
  email: string | null;
  status: "active" | "suspended";
  role: string;
  language: string | null;
  section: string | null;
  grantedBy: string | null;
  grantedByName: string | null;
  grantedAt: string;
  expiresAt: string;
  lastSignInAt: string | null;
  flags: {
    /** Not signed in for STALE_SIGN_IN_DAYS, or never. */
    stale: boolean;
    /** No verified second factor (null when Supabase Auth could not be asked). */
    noFactor: boolean | null;
    privileged: boolean;
    /** Expired but never revoked: tidy it, or renew it. */
    expired: boolean;
  };
}

/** Every unrevoked assignment, live or expired, that is not break-glass: what a review goes through. */
export function reviewItems(rows: readonly AssignmentRow[], profiles: readonly ProfileRow[], accounts: ReadonlyMap<string, AuthAccount> | null, now: Date): ReviewItem[] {
  const byId = new Map(profiles.map((p) => [p.user_id, p]));
  return rows
    .filter((r) => r.revoked_at === null && !r.is_break_glass)
    .flatMap((r) => {
      const p = byId.get(r.user_id);
      if (!p) return [];
      const account = accounts ? (accounts.get(r.user_id) ?? null) : null;
      const signedIn = p.last_sign_in_at ? Date.parse(p.last_sign_in_at) : NaN;
      return [
        {
          assignmentId: r.id,
          userId: r.user_id,
          name: p.display_name,
          email: account?.email ?? null,
          status: p.status,
          role: r.role_key,
          language: r.language,
          section: r.section,
          grantedBy: r.granted_by,
          grantedByName: r.granted_by ? (byId.get(r.granted_by)?.display_name ?? null) : null,
          grantedAt: r.granted_at,
          expiresAt: r.expires_at,
          lastSignInAt: p.last_sign_in_at,
          flags: {
            stale: !Number.isFinite(signedIn) || now.getTime() - signedIn > STALE_SIGN_IN_DAYS * DAY,
            noFactor: accounts ? !(account?.hasFactor ?? false) : null,
            privileged: isPrivilegedRole(r.role_key),
            expired: Date.parse(r.expires_at) <= now.getTime(),
          },
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.role.localeCompare(b.role));
}

export interface ReviewDue {
  lastAt: string | null;
  lastBy: string | null;
  /** When the next one is due: 90 days after the last, or now if there has been none. */
  dueAt: string;
  overdue: boolean;
}

export function reviewDue(last: { completed_at: string; completed_by: string } | null, now: Date): ReviewDue {
  const dueAt = last ? new Date(Date.parse(last.completed_at) + REVIEW_EVERY_DAYS * DAY) : now;
  return { lastAt: last?.completed_at ?? null, lastBy: last?.completed_by ?? null, dueAt: dueAt.toISOString(), overdue: dueAt.getTime() <= now.getTime() };
}

/** Live roles (not break-glass) ending within ENDING_SOON_DAYS, soonest first. */
export function endingSoon<T extends Pick<AssignmentRow, "revoked_at" | "is_break_glass" | "expires_at">>(rows: readonly T[], now: Date, days = ENDING_SOON_DAYS): T[] {
  const until = now.getTime() + days * DAY;
  return rows
    .filter((r) => r.revoked_at === null && !r.is_break_glass)
    .filter((r) => {
      const at = Date.parse(r.expires_at);
      return at > now.getTime() && at <= until;
    })
    .sort((a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at));
}

export const REVIEW_DECISIONS = ["keep", "revoked", "renew_asked", "renewed"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export interface SnapshotItem {
  assignmentId: string;
  userId: string;
  name: string | null;
  role: string;
  language: string | null;
  section: string | null;
  expiresAt: string;
  revokedAt: string | null;
  decision: ReviewDecision;
}

/**
 * What a completed review records: every assignment it went through, read from the database at
 * the moment it is completed (never the screen's account of it), with the reviewer's decision for
 * each; a row not marked is "keep". A row revoked during the review is included when it was marked.
 */
export function reviewSnapshot(
  rows: readonly AssignmentRow[],
  profiles: readonly ProfileRow[],
  decisions: Readonly<Record<string, ReviewDecision>>
): SnapshotItem[] {
  const names = new Map(profiles.map((p) => [p.user_id, p.display_name]));
  return rows
    .filter((r) => !r.is_break_glass && (r.revoked_at === null || decisions[r.id] !== undefined))
    .map((r) => ({
      assignmentId: r.id,
      userId: r.user_id,
      name: names.get(r.user_id) ?? null,
      role: r.role_key,
      language: r.language,
      section: r.section,
      expiresAt: r.expires_at,
      revokedAt: r.revoked_at,
      decision: decisions[r.id] ?? "keep",
    }));
}
