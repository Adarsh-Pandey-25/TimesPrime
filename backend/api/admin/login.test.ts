/**
 * @jest-environment node
 *
 * POST /api/admin/login. F-004: nothing limited how many passwords one
 * client could try. Upstash is not configured in tests, so the limiter runs
 * on its in-memory fallback; the Redis path has its own tests
 * (backend/lib/rateLimit.redis.test.ts).
 */

import { NextRequest } from "next/server";
import { POST } from "./login";

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
    const res = await attempt("anything", nextIp());
    expect(res.status).toBe(503);
    // It names the env file the owner actually has (BL-036): frontend/.env since restructure 3.
    expect((await res.json()).error).toBe("Admin login is not configured. Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET in frontend/.env.");
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
