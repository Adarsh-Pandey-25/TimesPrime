/**
 * @jest-environment node
 *
 * POST /api/admin/password: a staff member sets their own password (Panel 1 design §4, M2).
 * Session-only; with a second factor set up, only from an aal2 session. Supabase's Auth is stubbed.
 */

jest.mock("@sentry/nextjs", () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));
jest.mock("@timesprime/server/auth/staffSession", () => ({ readSession: jest.fn() }));
jest.mock("@timesprime/server/repositories/staff", () => {
  class StaffLookupError extends Error {}
  return { loadStaffRecord: jest.fn(), StaffLookupError };
});
jest.mock("@timesprime/server/repositories/auditLog", () => {
  class AuditWriteError extends Error {}
  return { recordAudit: jest.fn(async () => "audit-id"), AuditWriteError };
});
jest.mock("@timesprime/server/auth/supabaseServer", () => ({ createRouteClient: jest.fn() }));

import { NextRequest } from "next/server";
import { POST } from "./route";
import { readSession } from "@timesprime/server/auth/staffSession";
import { loadStaffRecord } from "@timesprime/server/repositories/staff";
import { recordAudit } from "@timesprime/server/repositories/auditLog";
import { createRouteClient } from "@timesprime/server/auth/supabaseServer";

const auth = {
  getUser: jest.fn(),
  updateUser: jest.fn(),
  signOut: jest.fn(async () => ({ error: null })),
  mfa: { listFactors: jest.fn() },
};
let user = 0;
const GOOD = "correct horse battery staple";

beforeEach(() => {
  jest.clearAllMocks();
  user += 1;
  (readSession as jest.Mock).mockResolvedValue({ kind: "staff", userId: `u-${user}`, aal: "aal1", sessionId: "s-1" });
  (loadStaffRecord as jest.Mock).mockImplementation(async (id: string) => ({ userId: id, displayName: "Neha", status: "active", mfaRequired: true, assignments: [] }));
  (createRouteClient as jest.Mock).mockResolvedValue({ auth });
  auth.getUser.mockResolvedValue({ data: { user: { email: "neha@example.com" } }, error: null });
  auth.updateUser.mockResolvedValue({ data: {}, error: null });
  auth.mfa.listFactors.mockResolvedValue({ data: { all: [] }, error: null });
});

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost:3001/api/admin/password", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" }, body: JSON.stringify(body) }));
const audited = () => (recordAudit as jest.Mock).mock.calls.map(([row]) => `${row.action}:${row.outcome}`);

test("no session: 401", async () => {
  (readSession as jest.Mock).mockResolvedValue(null);
  expect((await post({ password: GOOD })).status).toBe(401);
});

test("the shared password has no account to change: 400", async () => {
  (readSession as jest.Mock).mockResolvedValue({ kind: "legacy" });
  expect((await post({ password: GOOD })).status).toBe(400);
});

test("a new person, with no second factor yet, sets a password; every session then ends; audited", async () => {
  const res = await post({ password: GOOD });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: "success", signIn: "/admin/login" });
  expect(auth.updateUser).toHaveBeenCalledWith({ password: GOOD });
  expect(auth.signOut).toHaveBeenCalledWith({ scope: "global" });
  expect(audited()).toEqual(["auth.password_set:succeeded"]);
  expect(JSON.stringify((recordAudit as jest.Mock).mock.calls)).not.toContain(GOOD);
});

test("with a second factor set up, an aal1 session (a link, or a password alone) cannot change it: 403", async () => {
  auth.mfa.listFactors.mockResolvedValue({ data: { all: [{ id: "f-1", factor_type: "totp", status: "verified" }] }, error: null });
  const res = await post({ password: GOOD });
  expect(res.status).toBe(403);
  expect((await res.json()).code).toBe("mfa_required");
  expect(auth.updateUser).not.toHaveBeenCalled();
});

test("after the code (aal2), it can", async () => {
  auth.mfa.listFactors.mockResolvedValue({ data: { all: [{ id: "f-1", factor_type: "totp", status: "verified" }] }, error: null });
  (readSession as jest.Mock).mockResolvedValue({ kind: "staff", userId: `u-${user}`, aal: "aal2", sessionId: "s-1" });
  expect((await post({ password: GOOD })).status).toBe(200);
});

test.each([["too short", "short"], ["the email's name in it", "neha-strong-pass-2026"], ["not a string", 42]])("a weak password (%s): 400, unchanged", async (_name, password) => {
  expect((await post({ password })).status).toBe(400);
  expect(auth.updateUser).not.toHaveBeenCalled();
});

test("Supabase's own refusal comes back in its words: 422, audited as failed, still signed in", async () => {
  auth.updateUser.mockResolvedValue({ data: null, error: { message: "New password should be different from the old password." } });
  const res = await post({ password: GOOD });
  expect(res.status).toBe(422);
  expect((await res.json()).error).toMatch(/different from the old/);
  expect(audited()).toEqual(["auth.password_set:failed"]);
  expect(auth.signOut).not.toHaveBeenCalled();
});

test("a suspended staff member cannot: 403", async () => {
  (loadStaffRecord as jest.Mock).mockResolvedValue({ userId: "u-x", displayName: "Neha", status: "suspended", mfaRequired: true, assignments: [] });
  expect((await post({ password: GOOD })).status).toBe(403);
  expect(auth.updateUser).not.toHaveBeenCalled();
});
