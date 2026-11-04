/**
 * @jest-environment node
 *
 * POST /api/admin/login. F-004: nothing limited how many passwords one
 * client could try. Upstash is not configured in tests, so the limiter runs
 * on its in-memory fallback; the Redis path has its own tests
 * (packages/server/src/lib/rateLimit.redis.test.ts).
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

import { NextRequest } from "next/server";
import { POST } from "./route";
import { createRouteClient } from "@timesprime/server/auth/supabaseServer";
import { loadStaffRecord, markSignedIn } from "@timesprime/server/repositories/staff";
import { recordAudit } from "@timesprime/server/repositories/auditLog";

const env = { ...process.env };
let ipCounter = 0;
const nextIp = () => `198.51.100.${++ipCounter}`;

const attempt = (password: unknown, ip: string) =>
  POST(
    new NextRequest("http://localhost:3000/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ password }),
    })
  );

// The shared password ends on 2027-01-01 IST (Q3), so these run on a clock fixed before that,
// not on the real one: they must keep passing after the date.
const BEFORE_THE_END = Date.parse("2026-11-02T10:00:00Z");

beforeEach(() => {
  process.env.ADMIN_PASSWORD = "correct horse battery staple";
  process.env.ADMIN_SESSION_SECRET = "session-secret-for-tests";
  jest.useFakeTimers({ now: BEFORE_THE_END, doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  process.env = { ...env };
  jest.restoreAllMocks();
});

describe("POST /api/admin/login — the shared password's end (Q3)", () => {
  test("after 2027-01-01 00:00 IST the right password is refused with 403, and no cookie is set", async () => {
    jest.setSystemTime(Date.parse("2026-12-31T18:30:00Z"));
    const res = await attempt("correct horse battery staple", nextIp());
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect((await res.json()).error).toMatch(/retired/i);
  });

  test("ADMIN_LEGACY_LOGIN=on does not bring it back after the date", async () => {
    jest.setSystemTime(Date.parse("2027-02-01T00:00:00Z"));
    process.env.ADMIN_LEGACY_LOGIN = "on";
    expect((await attempt("correct horse battery staple", nextIp())).status).toBe(403);
  });

  test("ADMIN_LEGACY_LOGIN=off refuses it before the date", async () => {
    process.env.ADMIN_LEGACY_LOGIN = "off";
    expect((await attempt("correct horse battery staple", nextIp())).status).toBe(403);
  });

  test("the last minute of 2026 IST still works", async () => {
    jest.setSystemTime(Date.parse("2026-12-31T18:29:00Z"));
    expect((await attempt("correct horse battery staple", nextIp())).status).toBe(200);
  });
});

describe("POST /api/admin/login — unchanged behaviour", () => {
  test("the right password sets the session cookie", async () => {
    const res = await attempt("correct horse battery staple", nextIp());
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/timesprime_admin_session=/);
  });

  test("a wrong password is 401", async () => {
    expect((await attempt("wrong", nextIp())).status).toBe(401);
  });

  test("503 when login is not configured", async () => {
    delete process.env.ADMIN_PASSWORD;
    expect((await attempt("anything", nextIp())).status).toBe(503);
  });
});

describe("POST /api/admin/login — attempts are rate-limited per IP (F-004)", () => {
  test("10 attempts in 15 minutes are answered; the 11th is 429 with Retry-After", async () => {
    const ip = nextIp();
    for (let i = 0; i < 10; i++) expect((await attempt(`guess-${i}`, ip)).status).toBe(401);
    const res = await attempt("guess-10", ip);
    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
    expect((await res.json()).error).toMatch(/too many/i);
  });

  test("a limited IP is refused even with the right password", async () => {
    const ip = nextIp();
    for (let i = 0; i < 10; i++) await attempt(`guess-${i}`, ip);
    expect((await attempt("correct horse battery staple", ip)).status).toBe(429);
  });

  test("another IP is not affected", async () => {
    const ip = nextIp();
    for (let i = 0; i < 11; i++) await attempt(`guess-${i}`, ip);
    expect((await attempt("correct horse battery staple", nextIp())).status).toBe(200);
  });
});

// Panel 0: a staff account signs in with email and password through Supabase Auth. The shared
// password path above is unchanged (no lockout). The second factor comes next, at /api/admin/mfa.
describe("POST /api/admin/login — staff accounts (Panel 0)", () => {
  const auth = {
    signInWithPassword: jest.fn(),
    signOut: jest.fn(async () => ({ error: null })),
    mfa: { listFactors: jest.fn() },
  };
  const staffLogin = (email: unknown, password: unknown, ip = nextIp()) =>
    POST(
      new NextRequest("http://localhost:3000/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ email, password }),
      })
    );
  const record = (over: object = {}) => ({ userId: "u-1", displayName: "Asha", status: "active", mfaRequired: true, assignments: [], ...over });

  beforeEach(() => {
    jest.clearAllMocks();
    (createRouteClient as jest.Mock).mockResolvedValue({ auth });
    auth.signInWithPassword.mockResolvedValue({ data: { user: { id: "u-1" } }, error: null });
    auth.mfa.listFactors.mockResolvedValue({ data: { all: [] }, error: null });
    (loadStaffRecord as jest.Mock).mockResolvedValue(record());
  });

  test("the right email and password: signed in, next step MFA enrolment, audited, last sign-in noted", async () => {
    const res = await staffLogin("asha@example.com", "pw");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "success", kind: "staff", next: "mfa_enroll" });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "asha@example.com", password: "pw" });
    expect((recordAudit as jest.Mock).mock.calls.map(([r]) => `${r.action}:${r.outcome}:${r.actor_id}`)).toEqual(["auth.sign_in:succeeded:u-1"]);
    expect(markSignedIn).toHaveBeenCalledWith("u-1");
    // No shared-password cookie for a staff sign-in.
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

  test("the staff record cannot be read: signed back out, 503", async () => {
    (loadStaffRecord as jest.Mock).mockRejectedValue(new Error("down"));
    expect((await staffLogin("asha@example.com", "pw")).status).toBe(503);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  test("Supabase not configured: 503, the shared password still works", async () => {
    (createRouteClient as jest.Mock).mockResolvedValue(null);
    expect((await staffLogin("asha@example.com", "pw")).status).toBe(503);
    expect((await attempt("correct horse battery staple", nextIp())).status).toBe(200);
  });

  test.each([[""], [123], [null]])("a malformed email (%j) or password: 400, nothing sent", async (email) => {
    expect((await staffLogin(email, "pw")).status).toBe(400);
    expect((await staffLogin("asha@example.com", "")).status).toBe(400);
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  test("staff attempts count against the same per-IP limit as the shared password (F-004)", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { message: "Invalid login credentials" } });
    const ip = nextIp();
    for (let i = 0; i < 10; i++) await staffLogin("asha@example.com", `guess-${i}`, ip);
    expect((await staffLogin("asha@example.com", "pw", ip)).status).toBe(429);
    expect((await attempt("correct horse battery staple", ip)).status).toBe(429);
  });

  test("the shared password's end date does not affect staff sign-in", async () => {
    jest.setSystemTime(Date.parse("2027-02-01T00:00:00Z"));
    expect((await staffLogin("asha@example.com", "pw")).status).toBe(200);
  });
});
