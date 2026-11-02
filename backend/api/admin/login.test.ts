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

beforeEach(() => {
  process.env.ADMIN_PASSWORD = "correct horse battery staple";
  process.env.ADMIN_SESSION_SECRET = "session-secret-for-tests";
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...env };
  jest.restoreAllMocks();
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
