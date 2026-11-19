/**
 * @jest-environment node
 *
 * POST /api/admin/login: a staff account signs in with email and password through Supabase Auth
 * (Panel 0); the second factor comes next, at /api/admin/mfa. The shared admin password was retired
 * in Panel 1's M4: a body without an email is refused. F-004: attempts are limited per IP. Upstash
 * is not configured in tests, so the limiter runs on its in-memory fallback; the Redis path has its
 * own tests (packages/server/src/lib/rateLimit.redis.test.ts).
 */

jest.mock("@sentry/nextjs", () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));
jest.mock("@timesprime/server/auth/supabaseServer", () => ({ createRouteClient: jest.fn() }));
jest.mock("@timesprime/server/repositories/staff", () => {
  class StaffLookupError extends Error {}
  return { loadStaffRecord: jest.fn(), markSignedIn: jest.fn(async () => undefined), StaffLookupError };
});
jest.mock("@timesprime/server/repositories/auditLog", () => {
  class AuditWriteError extends Error {}
  return { recordAudit: jest.fn(async () => "audit-id"), AuditWriteError };
});

import * as Sentry from "@sentry/nextjs";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { createRouteClient } from "@timesprime/server/auth/supabaseServer";
import { loadStaffRecord, markSignedIn } from "@timesprime/server/repositories/staff";
import { recordAudit } from "@timesprime/server/repositories/auditLog";

let ipCounter = 0;
const nextIp = () => `198.51.100.${++ipCounter}`;

const auth = {
  signInWithPassword: jest.fn(),
  signOut: jest.fn(async () => ({ error: null })),
  mfa: { listFactors: jest.fn() },
};
const login = (body: unknown, ip = nextIp()) =>
  POST(
    new NextRequest("http://localhost:3000/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    })
  );
const staffLogin = (email: unknown, password: unknown, ip = nextIp()) => login({ email, password }, ip);
const record = (over: object = {}) => ({ userId: "u-1", displayName: "Asha", status: "active", mfaRequired: true, assignments: [], ...over });

beforeEach(() => {
  jest.clearAllMocks();
  (createRouteClient as jest.Mock).mockResolvedValue({ auth });
  auth.signInWithPassword.mockResolvedValue({ data: { user: { id: "u-1" } }, error: null });
  auth.mfa.listFactors.mockResolvedValue({ data: { all: [] }, error: null });
  (loadStaffRecord as jest.Mock).mockResolvedValue(record());
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("staff accounts", () => {
  test("the right email and password: signed in, next step MFA enrolment, audited, last sign-in noted", async () => {
    const res = await staffLogin("asha@example.com", "pw");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "success", kind: "staff", next: "mfa_enroll" });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "asha@example.com", password: "pw" });
    expect((recordAudit as jest.Mock).mock.calls.map(([r]) => `${r.action}:${r.outcome}:${r.actor_id}`)).toEqual(["auth.sign_in:succeeded:u-1"]);
    expect(markSignedIn).toHaveBeenCalledWith("u-1");
    expect(res.headers.get("set-cookie") ?? "").not.toMatch(/timesprime_admin_session=/);
  });

  test("with a factor enrolled, the next step is the code", async () => {
    auth.mfa.listFactors.mockResolvedValue({ data: { all: [{ id: "f-1", factor_type: "totp", status: "verified" }] }, error: null });
    expect((await (await staffLogin("asha@example.com", "pw")).json()).next).toBe("mfa_verify");
  });

  test("an account that needs no MFA and has none: done", async () => {
    (loadStaffRecord as jest.Mock).mockResolvedValue(record({ mfaRequired: false }));
    expect((await (await staffLogin("asha@example.com", "pw")).json()).next).toBe("done");
  });

  test("a wrong email or password: 401, one message for both, nothing audited", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { message: "Invalid login credentials" } });
    const res = await staffLogin("asha@example.com", "wrong");
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Incorrect email or password.");
    expect(recordAudit).not.toHaveBeenCalled();
  });

  test.each([
    ["not a staff account", null, "not_staff"],
    ["a suspended staff account", record({ status: "suspended" }), "suspended"],
  ])("%s: signed straight back out, 403, audited", async (_label, rec, code) => {
    (loadStaffRecord as jest.Mock).mockResolvedValue(rec);
    const res = await staffLogin("someone@example.com", "pw");
    expect(res.status).toBe(403);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.sign_in", outcome: "failed", reason: code }));
  });

  test("the staff record cannot be read: signed back out, 503, and Sentry hears of it", async () => {
    const down = new Error("down");
    (loadStaffRecord as jest.Mock).mockRejectedValue(down);
    expect((await staffLogin("asha@example.com", "pw")).status).toBe(503);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(Sentry.captureException).toHaveBeenCalledWith(down, { tags: { source: "supabase" }, extra: { operation: "loadStaffRecord", at: "sign-in" } });
  });

  test("Supabase not configured: 503", async () => {
    (createRouteClient as jest.Mock).mockResolvedValue(null);
    expect((await staffLogin("asha@example.com", "pw")).status).toBe(503);
  });

  test.each([[""], [123], [null]])("a malformed email (%j) or password: 400, nothing sent", async (email) => {
    expect((await staffLogin(email, "pw")).status).toBe(400);
    expect((await staffLogin("asha@example.com", "")).status).toBe(400);
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  test("a body that is not JSON: 400", async () => {
    const res = await POST(new NextRequest("http://localhost:3000/api/admin/login", { method: "POST", headers: { "x-forwarded-for": nextIp() }, body: "{" }));
    expect(res.status).toBe(400);
  });
});

// Panel 1, M4: the shared admin password is retired. A password alone is no way in, and no cookie.
test("the retired shared password: a body with only a password is refused (400), and Supabase is not asked", async () => {
  const res = await login({ password: "correct horse battery staple" });
  expect(res.status).toBe(400);
  expect(res.headers.get("set-cookie")).toBeNull();
  expect(auth.signInWithPassword).not.toHaveBeenCalled();
});

describe("attempts are rate-limited per IP (F-004)", () => {
  beforeEach(() => auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { message: "Invalid login credentials" } }));

  test("10 attempts in 15 minutes are answered; the 11th is 429 with Retry-After", async () => {
    const ip = nextIp();
    for (let i = 0; i < 10; i++) expect((await staffLogin("asha@example.com", `guess-${i}`, ip)).status).toBe(401);
    const res = await staffLogin("asha@example.com", "guess-10", ip);
    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
    expect((await res.json()).error).toMatch(/too many/i);
  });

  test("a limited IP is refused even with the right password; another IP is not affected", async () => {
    const ip = nextIp();
    for (let i = 0; i < 10; i++) await staffLogin("asha@example.com", `guess-${i}`, ip);
    auth.signInWithPassword.mockResolvedValue({ data: { user: { id: "u-1" } }, error: null });
    expect((await staffLogin("asha@example.com", "pw", ip)).status).toBe(429);
    expect((await staffLogin("asha@example.com", "pw", nextIp())).status).toBe(200);
  });
});
