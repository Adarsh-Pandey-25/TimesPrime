/**
 * @jest-environment node
 *
 * loadStaffRecord: the staff profile and live assignments, read from Supabase on every request
 * (design, "Approval": no cache, so a revocation applies to the next request). What it returns is
 * decide()'s input, so anything malformed is dropped or refused, never widened.
 */

jest.mock("@/server/lib/supabase", () => ({ supabase: { from: jest.fn() }, isSupabaseConfigured: jest.fn(() => true) }));

import { loadStaffRecord, markSignedIn, StaffLookupError } from "./staff";

const { supabase, isSupabaseConfigured } = jest.requireMock("@/server/lib/supabase") as {
  supabase: { from: jest.Mock };
  isSupabaseConfigured: jest.Mock;
};

const NOW = new Date("2026-11-10T12:00:00Z");
let results: Record<string, { data: unknown; error: unknown }>;
let calls: Array<[string, string, unknown[]]>;

function builder(table: string): object {
  const b: object = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve(results[table]);
        return (...args: unknown[]) => {
          calls.push([table, prop, args]);
          return b;
        };
      },
    }
  );
  return b;
}

const profile = { user_id: "u-1", display_name: "Asha", status: "active", mfa_required: true };
const row = (over: object = {}) => ({
  id: "as-1",
  role_key: "desk_editor",
  language: "hi",
  section: null,
  is_break_glass: false,
  expires_at: "2026-12-01T00:00:00Z",
  revoked_at: null,
  roles: { requires_aal2: true, role_permissions: [{ permission_key: "article.edit", access: "S", break_glass_only: false }] },
  ...over,
});

beforeEach(() => {
  calls = [];
  results = { staff_profiles: { data: profile, error: null }, role_assignments: { data: [row()], error: null } };
  supabase.from.mockReset();
  supabase.from.mockImplementation((table: string) => builder(table));
  isSupabaseConfigured.mockReturnValue(true);
});

test("maps the profile and its live assignments into decide()'s shape", async () => {
  expect(await loadStaffRecord("u-1", NOW)).toEqual({
    userId: "u-1",
    displayName: "Asha",
    status: "active",
    mfaRequired: true,
    assignments: [
      {
        id: "as-1",
        role: "desk_editor",
        language: "hi",
        section: null,
        isBreakGlass: false,
        expiresAt: "2026-12-01T00:00:00Z",
        revokedAt: null,
        requiresAal2: true,
        grants: [{ permission: "article.edit", access: "S", breakGlassOnly: false }],
      },
    ],
  });
});

test("asks the database for this user's unrevoked, unexpired assignments only", async () => {
  await loadStaffRecord("u-1", NOW);
  const on = (table: string, method: string) => calls.filter(([t, m]) => t === table && m === method).map(([, , a]) => a);
  expect(on("staff_profiles", "eq")).toEqual([["user_id", "u-1"]]);
  expect(on("role_assignments", "eq")).toEqual([["user_id", "u-1"]]);
  expect(on("role_assignments", "is")).toEqual([["revoked_at", null]]);
  expect(on("role_assignments", "gt")).toEqual([["expires_at", NOW.toISOString()]]);
});

test("reads afresh on every call: nothing is cached between requests", async () => {
  await loadStaffRecord("u-1", NOW);
  results.role_assignments = { data: [], error: null };
  expect((await loadStaffRecord("u-1", NOW))?.assignments).toEqual([]);
  expect(supabase.from).toHaveBeenCalledTimes(4);
});

test("no profile: null (a signed-in user who is not staff)", async () => {
  results.staff_profiles = { data: null, error: null };
  expect(await loadStaffRecord("u-1", NOW)).toBeNull();
});

test.each([
  ["the profile query fails", "staff_profiles"],
  ["the assignments query fails", "role_assignments"],
])("%s: throws, so the caller refuses (503)", async (_label, table) => {
  results[table] = { data: null, error: { message: "boom" } };
  await expect(loadStaffRecord("u-1", NOW)).rejects.toBeInstanceOf(StaffLookupError);
});

test("Supabase not configured: throws", async () => {
  isSupabaseConfigured.mockReturnValue(false);
  await expect(loadStaffRecord("u-1", NOW)).rejects.toBeInstanceOf(StaffLookupError);
});

test("an unknown status counts as suspended", async () => {
  results.staff_profiles = { data: { ...profile, status: "pending" }, error: null };
  expect((await loadStaffRecord("u-1", NOW))?.status).toBe("suspended");
});

test("malformed or unknown data is dropped, never widened", async () => {
  results.role_assignments = {
    data: [
      row({ id: "unknown-role", role_key: "editor_in_chief" }),
      row({ id: "bad-language", language: "fr" }),
      row({ id: "no-role-join", roles: null }),
      row({
        id: "mixed-grants",
        roles: {
          requires_aal2: true,
          role_permissions: [
            { permission_key: "article.everything", access: "F", break_glass_only: false },
            { permission_key: "article.edit", access: "Z", break_glass_only: false },
            { permission_key: "stats.view", access: "R", break_glass_only: false },
          ],
        },
      }),
    ],
    error: null,
  };
  const record = await loadStaffRecord("u-1", NOW);
  expect(record?.assignments.map((a) => a.id)).toEqual(["no-role-join", "mixed-grants"]);
  expect(record?.assignments[0].grants).toEqual([]);
  expect(record?.assignments[1].grants).toEqual([{ permission: "stats.view", access: "R", breakGlassOnly: false }]);
});

test("a missing requires_aal2 is treated as true (the stricter reading)", async () => {
  results.role_assignments = { data: [row({ roles: { role_permissions: [] } })], error: null };
  expect((await loadStaffRecord("u-1", NOW))?.assignments[0].requiresAal2).toBe(true);
});

test("markSignedIn notes the sign-in time on the profile, and never throws", async () => {
  results.staff_profiles = { data: null, error: null };
  await markSignedIn("u-1");
  const update = calls.find(([t, m]) => t === "staff_profiles" && m === "update");
  expect(update?.[2][0]).toEqual({ last_sign_in_at: expect.any(String) });
  expect(calls.filter(([t, m]) => t === "staff_profiles" && m === "eq").map(([, , a]) => a)).toEqual([["user_id", "u-1"]]);
  results.staff_profiles = { data: null, error: { message: "boom" } };
  jest.spyOn(console, "error").mockImplementation(() => {});
  await expect(markSignedIn("u-1")).resolves.toBeUndefined();
});
