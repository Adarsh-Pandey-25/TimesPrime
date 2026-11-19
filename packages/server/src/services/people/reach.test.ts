/**
 * @jest-environment node
 *
 * Panel 1's reach rules (design §3): who may do what to whom, from the caller's staff record.
 */

import type { AccessCode, PermissionKey, RoleKey, ScopeLanguage } from "@timesprime/shared/config/permissions";
import type { StaffRecord } from "../../auth/decide";
import { asks, canSee, isTheirPerson, liveRows, ownScopes, planFor, withinReach, type RoleRow } from "./reach";

const NOW = new Date("2026-11-19T12:00:00Z");
const FUTURE = "2027-01-01T00:00:00Z";
const PAST = "2026-11-01T00:00:00Z";

function record(role: RoleKey, language: ScopeLanguage | null, code: AccessCode, extra: Partial<{ expiresAt: string; revokedAt: string | null }> = {}): StaffRecord {
  const grants = (["user.manage", "role.assign"] as PermissionKey[]).map((permission) => ({ permission, access: code, breakGlassOnly: false }));
  return {
    userId: "u-1",
    displayName: "Caller",
    status: "active",
    mfaRequired: true,
    assignments: [{ id: "a-1", role, language, section: null, isBreakGlass: false, expiresAt: extra.expiresAt ?? FUTURE, revokedAt: extra.revokedAt ?? null, requiresAal2: true, grants }],
  };
}
const SUPER = record("super_admin", null, "A");
const HI_ME = record("managing_editor", "hi", "S");
const ALL_ME = record("managing_editor", null, "S");

const row = (role: string, language: string | null, section: string | null = null, over: Partial<RoleRow> = {}): RoleRow => ({
  role_key: role, language, section, is_break_glass: false, revoked_at: null, expires_at: FUTURE, ...over,
});

test("a Super Admin asks (A); a Managing Editor acts in their own scope (S)", () => {
  expect(asks(SUPER, "role.assign", NOW)).toBe(true);
  expect(ownScopes(SUPER, "role.assign", NOW)).toEqual([]);
  expect(asks(HI_ME, "role.assign", NOW)).toBe(false);
  expect(ownScopes(HI_ME, "role.assign", NOW)).toEqual([{ language: "hi", section: null }]);
});

test("an expired or revoked assignment gives no reach", () => {
  expect(asks(record("super_admin", null, "A", { expiresAt: PAST }), "role.assign", NOW)).toBe(false);
  expect(ownScopes(record("managing_editor", "hi", "S", { revokedAt: PAST }), "role.assign", NOW)).toEqual([]);
});

test("withinReach: Writer, Sub-editor or Desk Editor, inside the scope", () => {
  const hi = [{ language: "hi" as const, section: null }];
  expect(withinReach(hi, "desk_editor", { language: "hi", section: "sports" })).toBe(true);
  expect(withinReach(hi, "writer", { language: "hi", section: null })).toBe(true);
  expect(withinReach(hi, "writer", { language: "en", section: null })).toBe(false);
  expect(withinReach(hi, "managing_editor", { language: "hi", section: null })).toBe(false);
  expect(withinReach(hi, "analyst", { language: "hi", section: null })).toBe(false);
});

test("a Managing Editor's people: every live role within reach, and one there at least", () => {
  const hi = [{ language: "hi" as const, section: null }];
  expect(isTheirPerson(hi, [row("writer", "hi", "sports")], NOW)).toBe(true);
  expect(isTheirPerson(hi, [row("writer", "hi"), row("analyst", null)], NOW)).toBe(false);
  expect(isTheirPerson(hi, [row("writer", "hi"), row("super_admin", null)], NOW)).toBe(false);
  expect(isTheirPerson(hi, [row("writer", "en")], NOW)).toBe(false);
  // Expired roles do not block, but someone must have held a role here.
  expect(isTheirPerson(hi, [row("writer", "hi", null, { expires_at: PAST }), row("analyst", null, null, { expires_at: PAST })], NOW)).toBe(true);
  expect(isTheirPerson(hi, [], NOW)).toBe(false);
  expect(isTheirPerson([], [row("writer", "hi")], NOW)).toBe(false);
});

test("the directory: everyone for a Super Admin; a Managing Editor's desks for them", () => {
  expect(canSee(SUPER, [], NOW)).toBe(true);
  expect(canSee(HI_ME, [row("writer", "hi", "sports")], NOW)).toBe(true);
  expect(canSee(HI_ME, [row("writer", "en")], NOW)).toBe(false);
  expect(canSee(HI_ME, [row("super_admin", null)], NOW)).toBe(false);
  expect(canSee(ALL_ME, [row("super_admin", null)], NOW)).toBe(true);
});

test("planFor: a Managing Editor within reach acts; a Super Admin asks to add and acts to remove; others may not", () => {
  const inHindi = (scopes: Parameters<typeof withinReach>[0]) => withinReach(scopes, "writer", { language: "hi", section: null });
  expect(planFor(HI_ME, "role.assign", NOW, inHindi)).toBe("act");
  expect(planFor(HI_ME, "role.assign", NOW, () => false)).toBe(null);
  expect(planFor(SUPER, "role.assign", NOW, inHindi)).toBe("ask");
  expect(planFor(SUPER, "role.assign", NOW, inHindi, true)).toBe("act");
  expect(planFor(record("writer", "hi", "S"), "user.manage", NOW, () => true)).toBe("act");
  expect(planFor({ ...SUPER, assignments: [] }, "role.assign", NOW, () => true)).toBe(null);
});

test("liveRows keeps the unrevoked, unexpired rows", () => {
  expect(liveRows([row("writer", "hi"), row("writer", "en", null, { revoked_at: PAST }), row("analyst", null, null, { expires_at: PAST })], NOW)).toHaveLength(1);
});
