/**
 * @jest-environment node
 *
 * POST /api/admin/welcome: opening a one-time "set your password" link (Panel 1 design §4, M2).
 * Public: the token is the credential. Supabase's Auth is stubbed here.
 */

jest.mock("@sentry/nextjs", () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));
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
import { loadStaffRecord } from "@timesprime/server/repositories/staff";
import { recordAudit } from "@timesprime/server/repositories/auditLog";
import { createRouteClient } from "@timesprime/server/auth/supabaseServer";

const auth = {
  verifyOtp: jest.fn(),
  signOut: jest.fn(async () => ({ error: null })),
  mfa: { listFactors: jest.fn() },
};
let ip = 0;
const TOKEN = "pkce_0123456789abcdef0123456789abcdef";

beforeEach(() => {
  jest.clearAllMocks();
  ip += 1; // a fresh address per test, so the limit does not carry over
  (createRouteClient as jest.Mock).mockResolvedValue({ auth });
  auth.verifyOtp.mockResolvedValue({ data: { user: { id: "u-5", email: "neha@example.com" }, session: {} }, error: null });
  auth.mfa.listFactors.mockResolvedValue({ data: { all: [] }, error: null });
  (loadStaffRecord as jest.Mock).mockResolvedValue({ userId: "u-5", displayName: "Neha", status: "active", mfaRequired: true, assignments: [] });
});

const post = (body: unknown, from = `198.51.100.${ip}`) =>
  POST(new NextRequest("http://localhost:3001/api/admin/welcome", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": from }, body: JSON.stringify(body) }));

test("a good link: a session, the person's name, and whether they have a second factor; audited", async () => {
  const res = await post({ token_hash: TOKEN, type: "recovery" });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ name: "Neha", email: "neha@example.com", hasFactor: false });
  expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: TOKEN, type: "recovery" });
  expect((recordAudit as jest.Mock).mock.calls.map(([row]) => `${row.action}:${row.outcome}`)).toEqual(["auth.welcome_link_used:succeeded"]);
  expect(JSON.stringify((recordAudit as jest.Mock).mock.calls)).not.toContain(TOKEN);
});

test("an account with a second factor is told so: its code comes before a new password", async () => {
  auth.mfa.listFactors.mockResolvedValue({ data: { all: [{ id: "f-1", factor_type: "totp", status: "verified" }] }, error: null });
  expect(await (await post({ token_hash: TOKEN, type: "recovery" })).json()).toMatchObject({ hasFactor: true });
});

test.each([
  ["no token", { type: "recovery" }],
  ["a token of the wrong shape", { token_hash: "../../etc", type: "recovery" }],
  ["another kind of link", { token_hash: TOKEN, type: "magiclink" }],
])("%s: 400, and Supabase is not asked", async (_name, body) => {
  const res = await post(body);
  expect(res.status).toBe(400);
  expect((await res.json()).code).toBe("link_invalid");
  expect(auth.verifyOtp).not.toHaveBeenCalled();
});

test("a used or expired link: 400, no session", async () => {
  auth.verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: { message: "Email link is invalid or has expired" } });
  const res = await post({ token_hash: TOKEN, type: "recovery" });
  expect(res.status).toBe(400);
  expect((await res.json()).error).toMatch(/does not work any more/);
});

test("someone who is not staff, or is suspended, is signed out again: 403", async () => {
  (loadStaffRecord as jest.Mock).mockResolvedValueOnce(null);
  expect((await post({ token_hash: TOKEN, type: "recovery" })).status).toBe(403);
  (loadStaffRecord as jest.Mock).mockResolvedValueOnce({ userId: "u-5", displayName: "Neha", status: "suspended", mfaRequired: true, assignments: [] });
  expect((await post({ token_hash: TOKEN, type: "recovery" })).status).toBe(403);
  expect(auth.signOut).toHaveBeenCalledTimes(2);
});

test("ten tries per address in 15 minutes; the eleventh is 429", async () => {
  const from = "203.0.113.250";
  for (let i = 0; i < 10; i++) await post({ token_hash: "x", type: "recovery" }, from);
  const res = await post({ token_hash: TOKEN, type: "recovery" }, from);
  expect(res.status).toBe(429);
  expect(res.headers.get("Retry-After")).toBeTruthy();
});
