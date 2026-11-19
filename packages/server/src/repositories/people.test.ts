/**
 * @jest-environment node
 *
 * Panel 1's repository (design §2): database errors as statuses, what Supabase Auth says of each
 * account, and the database's own test of "another active Super Admin".
 */

jest.mock("../lib/supabase", () => ({
  supabase: { from: jest.fn(), rpc: jest.fn(), auth: { admin: { listUsers: jest.fn(), getUserById: jest.fn() } } },
  isSupabaseConfigured: jest.fn(() => true),
}));

import { supabase } from "../lib/supabase";
import { anotherActiveSuperAdmin, authAccount, authAccounts, peopleError, PeopleStoreError } from "./people";

const mocked = supabase as unknown as {
  from: jest.Mock;
  rpc: jest.Mock;
  auth: { admin: { listUsers: jest.Mock; getUserById: jest.Mock } };
};
const NOW = new Date("2026-11-19T12:00:00Z");

function query(data: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "gt"]) q[m] = () => q;
  q.then = (resolve: (v: unknown) => void) => resolve({ data, error: null });
  return q;
}

beforeEach(() => jest.clearAllMocks());

test("peopleError: each database refusal becomes its own status, with the database's words", () => {
  expect(peopleError({ code: "40001", message: "access: request x has lapsed; ask again" })).toMatchObject({ status: 409, message: "request x has lapsed; ask again" });
  expect(peopleError({ code: "23505", message: "dup" }).status).toBe(409);
  expect(peopleError({ code: "P0002", message: "access: request x not found" }).status).toBe(404);
  expect(peopleError({ code: "P0001", message: "role_assignments: managing_editor is privileged and needs a second, different admin to approve" })).toMatchObject({
    status: 422,
    message: "managing_editor is privileged and needs a second, different admin to approve",
  });
  expect(peopleError({ code: "XX000", message: "boom" })).toBeInstanceOf(PeopleStoreError);
  expect(peopleError({ code: "XX000", message: "boom" }).status).toBe(500);
});

test("authAccounts: the email, a verified second factor only, the last sign-in; page by page", async () => {
  const full = Array.from({ length: 1000 }, (_, i) => ({ id: `p-${i}`, email: `p${i}@example.com`, factors: [] }));
  mocked.auth.admin.listUsers
    .mockResolvedValueOnce({ data: { users: full }, error: null })
    .mockResolvedValueOnce({
      data: { users: [{ id: "u-2", email: "ravi@example.com", last_sign_in_at: "2026-11-19T09:00:00Z", factors: [{ status: "unverified" }, { status: "verified" }] }, { id: "u-3", email: "new@example.com", factors: [{ status: "unverified" }] }] },
      error: null,
    });
  const accounts = await authAccounts();
  expect(mocked.auth.admin.listUsers).toHaveBeenCalledTimes(2);
  expect(accounts.get("u-2")).toEqual({ email: "ravi@example.com", hasFactor: true, lastSignInAt: "2026-11-19T09:00:00Z" });
  expect(accounts.get("u-3")?.hasFactor).toBe(false);
  expect(accounts.size).toBe(1002);
});

test("Supabase Auth's failure is an error the routes report, never an empty answer", async () => {
  mocked.auth.admin.listUsers.mockResolvedValueOnce({ data: null, error: { message: "down" } });
  await expect(authAccounts()).rejects.toThrow("Supabase Auth: down");
  mocked.auth.admin.getUserById.mockResolvedValueOnce({ data: { user: null }, error: null });
  await expect(authAccount("u-9")).resolves.toBeNull();
});

test("anotherActiveSuperAdmin: asks the database about each other holder, never about the person", async () => {
  mocked.from.mockReturnValue(
    query([
      { user_id: "u-1", role_key: "super_admin", is_break_glass: false, revoked_at: null, expires_at: "2027-01-01T00:00:00Z" },
      { user_id: "u-2", role_key: "super_admin", is_break_glass: false, revoked_at: null, expires_at: "2027-01-01T00:00:00Z" },
      { user_id: "u-3", role_key: "super_admin", is_break_glass: true, revoked_at: null, expires_at: "2027-01-01T00:00:00Z" },
      { user_id: "u-4", role_key: "super_admin", is_break_glass: false, revoked_at: null, expires_at: "2026-11-01T00:00:00Z" },
    ])
  );
  mocked.rpc.mockResolvedValue({ data: true, error: null });
  await expect(anotherActiveSuperAdmin("u-1", NOW)).resolves.toBe(true);
  expect(mocked.rpc.mock.calls).toEqual([["is_active_super_admin", { p_user: "u-2" }]]);

  mocked.rpc.mockClear().mockResolvedValue({ data: false, error: null });
  await expect(anotherActiveSuperAdmin("u-1", NOW)).resolves.toBe(false);
});
