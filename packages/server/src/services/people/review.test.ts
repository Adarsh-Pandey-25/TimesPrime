/**
 * @jest-environment node
 *
 * The access review and its reminders (Panel 1 design §6): what a review goes through and flags,
 * when it is due, which roles end soon, and what a completed review records.
 */

import type { AssignmentRow, AuthAccount, ProfileRow } from "../../repositories/people";
import { endingSoon, reviewDue, reviewItems, reviewSnapshot } from "./review";

const NOW = new Date("2026-11-19T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

const profile = (id: string, name: string, lastSignIn: string | null, status: "active" | "suspended" = "active"): ProfileRow => ({
  user_id: id, display_name: name, status, mfa_required: true, created_at: day(-200), created_by: null, last_sign_in_at: lastSignIn,
});
const row = (id: string, user: string, role: string, over: Partial<AssignmentRow> = {}): AssignmentRow => ({
  id, user_id: user, role_key: role, language: "hi", section: null, is_break_glass: false, granted_by: "u-admin", approved_by: null,
  reason: "r", granted_at: day(-100), expires_at: day(80), revoked_at: null, revoked_by: null, revoke_reason: null, ...over,
});
const PROFILES = [profile("u-1", "Ravi", day(-3)), profile("u-2", "Meera", null), profile("u-admin", "Asha", day(-1))];
const ACCOUNTS = new Map<string, AuthAccount>([
  ["u-1", { email: "ravi@example.com", hasFactor: true, lastSignInAt: day(-3) }],
  ["u-2", { email: "meera@example.com", hasFactor: false, lastSignInAt: null }],
]);

describe("reviewItems", () => {
  const rows = [
    row("a-1", "u-1", "writer"),
    row("a-2", "u-2", "managing_editor", { language: null }),
    row("a-3", "u-1", "sub_editor", { expires_at: day(-2) }),
    row("a-4", "u-1", "desk_editor", { revoked_at: day(-5), revoke_reason: "left" }),
    row("a-5", "u-admin", "super_admin", { is_break_glass: true, language: null, expires_at: day(0.05) }),
  ];

  test("goes through every unrevoked row, live or expired, never break-glass; by name", () => {
    expect(reviewItems(rows, PROFILES, ACCOUNTS, NOW).map((i) => i.assignmentId)).toEqual(["a-2", "a-3", "a-1"]);
  });

  test("flags: no sign-in for 60 days (or never), no second factor, a privileged role, expired", () => {
    const items = new Map(reviewItems(rows, PROFILES, ACCOUNTS, NOW).map((i) => [i.assignmentId, i.flags]));
    expect(items.get("a-1")).toEqual({ stale: false, noFactor: false, privileged: false, expired: false });
    expect(items.get("a-2")).toEqual({ stale: true, noFactor: true, privileged: true, expired: false });
    expect(items.get("a-3")).toMatchObject({ expired: true });
  });

  test("without Supabase Auth, the factor is unknown, not 'none'", () => {
    expect(reviewItems(rows, PROFILES, null, NOW)[0].flags.noFactor).toBeNull();
  });

  test("names who granted it", () => {
    expect(reviewItems(rows, PROFILES, ACCOUNTS, NOW)[0].grantedByName).toBe("Asha");
  });
});

describe("reviewDue", () => {
  test("never reviewed: due now", () => {
    expect(reviewDue(null, NOW)).toEqual({ lastAt: null, lastBy: null, dueAt: NOW.toISOString(), overdue: true });
  });

  test("90 days after the last one", () => {
    expect(reviewDue({ completed_at: day(-30), completed_by: "u-admin" }, NOW)).toMatchObject({ dueAt: day(60), overdue: false });
    expect(reviewDue({ completed_at: day(-91), completed_by: "u-admin" }, NOW).overdue).toBe(true);
  });
});

test("endingSoon: live roles ending within 14 days, soonest first; not expired, revoked or break-glass", () => {
  const rows = [
    row("s-10", "u-1", "writer", { expires_at: day(10) }),
    row("s-3", "u-1", "writer", { expires_at: day(3) }),
    row("s-20", "u-1", "writer", { expires_at: day(20) }),
    row("s-past", "u-1", "writer", { expires_at: day(-1) }),
    row("s-rev", "u-1", "writer", { expires_at: day(2), revoked_at: day(-1) }),
    row("s-bg", "u-1", "super_admin", { expires_at: day(0.05), is_break_glass: true }),
  ];
  expect(endingSoon(rows, NOW).map((r) => r.id)).toEqual(["s-3", "s-10"]);
});

test("reviewSnapshot: every unrevoked row with its decision (keep unless marked); a revoked row only if marked; never break-glass", () => {
  const rows = [
    row("a-1", "u-1", "writer"),
    row("a-2", "u-2", "writer", { revoked_at: day(0), revoke_reason: "access review" }),
    row("a-3", "u-2", "writer", { revoked_at: day(-50), revoke_reason: "old" }),
    row("a-4", "u-admin", "super_admin", { is_break_glass: true }),
  ];
  const snap = reviewSnapshot(rows, PROFILES, { "a-2": "revoked" });
  expect(snap.map((s) => [s.assignmentId, s.decision, s.name])).toEqual([
    ["a-1", "keep", "Ravi"],
    ["a-2", "revoked", "Meera"],
  ]);
});
