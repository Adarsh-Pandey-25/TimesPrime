/**
 * @jest-environment node
 *
 * decide(): the permission rule itself, with no I/O (design §3). Deny by default: every path that
 * is not an explicit, live, in-scope, MFA-satisfied grant is a "no". Each case below has its
 * allowed twin, so a test that passes because everything is refused cannot hide here.
 */

import { ANY_SCOPE, decide, decideLegacy, LEGACY_PERMISSIONS, type Assignment, type StaffRecord } from "./decide";
import type { Target } from "./scope";
import { PERMISSION_KEYS, type AccessCode, type PermissionKey } from "@timesprime/shared/config/permissions";

const NOW = new Date("2026-11-10T12:00:00Z");
const LATER = "2026-12-01T00:00:00Z";
const EARLIER = "2026-11-01T00:00:00Z";
const HI_SPORTS = { language: "hi" as const, section: "sports" };

type GrantTuple = [PermissionKey, AccessCode, boolean?];

function assignment(over: Omit<Partial<Assignment>, "grants"> & { grants?: GrantTuple[] } = {}): Assignment {
  const { grants = [["article.edit", "S"]], ...rest } = over;
  return {
    id: "as-1",
    role: "desk_editor",
    language: "hi",
    section: null,
    isBreakGlass: false,
    expiresAt: LATER,
    revokedAt: null,
    requiresAal2: true,
    grants: grants.map(([permission, access, breakGlassOnly = false]) => ({ permission, access, breakGlassOnly })),
    ...rest,
  };
}

function staff(assignments: Assignment[], over: Partial<StaffRecord> = {}): StaffRecord {
  return { userId: "u-1", displayName: "Asha", status: "active", mfaRequired: true, assignments, ...over };
}

const act = (s: StaffRecord | null, permission: PermissionKey = "article.edit", target: Target = HI_SPORTS, aal: "aal1" | "aal2" = "aal2") =>
  decide({ staff: s, aal, permission, mode: "act", target, now: NOW });
const read = (s: StaffRecord | null, permission: PermissionKey, aal: "aal1" | "aal2" = "aal2") =>
  decide({ staff: s, aal, permission, mode: "read", now: NOW });

describe("the allowed path", () => {
  test("a live, in-scope grant in an aal2 session is allowed, and names the assignment that allowed it", () => {
    const d = act(staff([assignment()]));
    expect(d).toEqual({ allowed: true, via: ["as-1"] });
  });
});

describe("who is asking", () => {
  test("a signed-in user with no staff profile is refused (403 not_staff)", () => {
    expect(act(null)).toEqual({ allowed: false, status: 403, code: "not_staff" });
  });

  test("a suspended staff member is refused, whatever they hold", () => {
    expect(act(staff([assignment()], { status: "suspended" }))).toMatchObject({ allowed: false, status: 403, code: "suspended" });
  });

  test("no assignments at all: refused", () => {
    expect(act(staff([]))).toMatchObject({ allowed: false, status: 403, code: "forbidden" });
  });
});

describe("the assignment must be live", () => {
  test("expired: refused; the same assignment one day earlier: allowed", () => {
    expect(act(staff([assignment({ expiresAt: EARLIER })]))).toMatchObject({ allowed: false, code: "forbidden" });
    expect(act(staff([assignment({ expiresAt: LATER })]))).toMatchObject({ allowed: true });
  });

  test("expiry is exclusive: an assignment that expires exactly now is refused", () => {
    expect(act(staff([assignment({ expiresAt: NOW.toISOString() })]))).toMatchObject({ allowed: false });
  });

  test("revoked: refused, even before its expiry", () => {
    expect(act(staff([assignment({ revokedAt: EARLIER })]))).toMatchObject({ allowed: false, code: "forbidden" });
  });

  test("a malformed expiry is refused, not treated as forever", () => {
    expect(act(staff([assignment({ expiresAt: "not a date" })]))).toMatchObject({ allowed: false });
  });
});

describe("the role must hold the permission", () => {
  test("a role without the permission: refused", () => {
    expect(act(staff([assignment({ grants: [["article.edit", "S"]] })]), "article.unpublish")).toMatchObject({ allowed: false, code: "forbidden" });
  });

  test("an unknown role arrives with no grants (none join in the database): refused", () => {
    const unknown = assignment({ grants: [] });
    expect(act(staff([unknown]))).toMatchObject({ allowed: false, code: "forbidden" });
  });

  test("a permission key that is not in the catalogue matches nothing", () => {
    const d = decide({ staff: staff([assignment()]), aal: "aal2", permission: "article.everything" as PermissionKey, mode: "act", target: HI_SPORTS, now: NOW });
    expect(d).toMatchObject({ allowed: false, code: "forbidden" });
  });
});

describe("the cell codes (design §2)", () => {
  const withCode = (code: AccessCode) => staff([assignment({ grants: [["sync.view", code], ["sync.run", code]] })]);

  test.each([
    ["F", true, true],
    ["S", true, true],
    ["R", true, false],
    ["M", true, false],
    ["Own", false, false],
    ["A", false, false],
  ] as const)("%s: read %s, act %s", (code, canRead, canAct) => {
    expect(read(withCode(code), "sync.view").allowed).toBe(canRead);
    expect(act(withCode(code), "sync.run").allowed).toBe(canAct);
  });

  test("A is refused with needs_approval: the approval flow comes with its panel", () => {
    expect(act(withCode("A"), "sync.run")).toEqual({ allowed: false, status: 403, code: "needs_approval" });
  });

  test("a break-glass-only cell needs a break-glass assignment", () => {
    const grants: GrantTuple[] = [["article.unpublish", "F", true]];
    const normal = assignment({ role: "super_admin", language: null, grants });
    const breakGlass = assignment({ role: "super_admin", language: null, isBreakGlass: true, grants });
    expect(act(staff([normal]), "article.unpublish")).toMatchObject({ allowed: false });
    expect(act(staff([breakGlass]), "article.unpublish")).toMatchObject({ allowed: true });
  });
});

describe("scope", () => {
  test("wrong language: refused; right language: allowed", () => {
    expect(act(staff([assignment({ language: "en" })]))).toMatchObject({ allowed: false, code: "forbidden" });
    expect(act(staff([assignment({ language: "hi" })]))).toMatchObject({ allowed: true });
  });

  test("wrong section: refused; right section: allowed", () => {
    expect(act(staff([assignment({ section: "politics" })]))).toMatchObject({ allowed: false });
    expect(act(staff([assignment({ section: "sports" })]))).toMatchObject({ allowed: true });
  });

  test("a site-wide target is covered only by an unscoped assignment", () => {
    const siteWide = { language: null, section: null };
    expect(act(staff([assignment({ language: "hi" })]), "article.edit", siteWide)).toMatchObject({ allowed: false });
    expect(act(staff([assignment({ language: null })]), "article.edit", siteWide)).toMatchObject({ allowed: true });
  });

  test("the scope applies to F as well as S", () => {
    const managing = assignment({ role: "managing_editor", language: "en", grants: [["article.edit", "F"]] });
    expect(act(staff([managing]))).toMatchObject({ allowed: false });
  });

  test("a read with no target needs the permission in any scope", () => {
    expect(read(staff([assignment({ language: "en", grants: [["stats.view", "S"]] })]), "stats.view")).toMatchObject({ allowed: true });
  });

  test("an act with no target is refused (a change always has a target)", () => {
    const d = decide({ staff: staff([assignment({ language: null })]), aal: "aal2", permission: "article.edit", mode: "act", now: NOW });
    expect(d).toMatchObject({ allowed: false, code: "forbidden" });
  });

  test("ANY_SCOPE: the pre-check before a route loads its target asks whether the permission is held in some scope", () => {
    const hiOnly = staff([assignment({ language: "hi" })]);
    const anywhere = (s: StaffRecord, permission: PermissionKey) =>
      decide({ staff: s, aal: "aal2", permission, mode: "act", target: ANY_SCOPE, now: NOW });
    expect(anywhere(hiOnly, "article.edit")).toMatchObject({ allowed: true });
    expect(anywhere(hiOnly, "article.unpublish")).toMatchObject({ allowed: false, code: "forbidden" });
    expect(anywhere(staff([assignment({ expiresAt: EARLIER })]), "article.edit")).toMatchObject({ allowed: false });
    expect(decide({ staff: hiOnly, aal: "aal1", permission: "article.edit", mode: "act", target: ANY_SCOPE, now: NOW })).toMatchObject({ code: "mfa_required" });
  });

  test("one in-scope assignment among several is enough", () => {
    const d = act(staff([assignment({ id: "en", language: "en" }), assignment({ id: "hi", language: "hi" })]));
    expect(d).toEqual({ allowed: true, via: ["hi"] });
  });
});

describe("MFA (D3, Q1)", () => {
  test("a role that requires aal2, in an aal1 session: refused with mfa_required", () => {
    expect(act(staff([assignment({ requiresAal2: true })], { mfaRequired: false }), "article.edit", HI_SPORTS, "aal1")).toEqual({
      allowed: false,
      status: 403,
      code: "mfa_required",
    });
  });

  test("a profile with mfa_required needs aal2 even for a role that does not", () => {
    const writer = assignment({ role: "writer", requiresAal2: false });
    expect(act(staff([writer], { mfaRequired: true }), "article.edit", HI_SPORTS, "aal1")).toMatchObject({ code: "mfa_required" });
    expect(act(staff([writer], { mfaRequired: false }), "article.edit", HI_SPORTS, "aal1")).toMatchObject({ allowed: true });
  });

  test("mfa_required is reported only when MFA is the only thing missing", () => {
    expect(act(staff([assignment({ language: "en" })]), "article.edit", HI_SPORTS, "aal1")).toMatchObject({ code: "forbidden" });
  });
});

describe("the legacy shared password (Q3)", () => {
  test("holds exactly today's editorial and sync capabilities", () => {
    expect([...LEGACY_PERMISSIONS].sort()).toEqual(
      [
        "article.bulk_action", "article.create", "article.edit", "article.publish_direct", "article.unpublish",
        "article.view_admin", "breaking_banner.manage", "stats.view", "sync.run", "sync.view",
      ].sort()
    );
  });

  test.each(["user.manage", "role.assign", "audit.read", "settings.manage", "health.view", "content.purge"] as const)(
    "never %s",
    (permission) => {
      expect(decideLegacy(permission)).toEqual({ allowed: false, status: 403, code: "forbidden" });
    }
  );

  test("every permission outside the list is refused", () => {
    for (const permission of PERMISSION_KEYS) {
      expect(decideLegacy(permission).allowed).toBe(LEGACY_PERMISSIONS.has(permission));
    }
  });
});
