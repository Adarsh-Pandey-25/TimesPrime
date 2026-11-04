/**
 * @jest-environment node
 *
 * src/proxy.ts, the optimistic check in front of /admin/* and /api/admin/* (Next 16's renamed
 * Middleware). Characterization first: this pins its behaviour with the shared-password cookie
 * before Panel 0 teaches it the staff session. It was at 0% coverage.
 */

jest.mock("@supabase/ssr", () => ({ createServerClient: jest.fn() }));

import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { config, proxy } from "./proxy";
import { ADMIN_SESSION_COOKIE, createSessionToken } from "@timesprime/server/auth/adminSession";

const env = { ...process.env };
const getClaims = jest.fn();

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = "session-secret-for-tests";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  delete process.env.ADMIN_LEGACY_LOGIN;
  jest.useFakeTimers({ now: Date.parse("2026-11-10T12:00:00Z"), doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
  getClaims.mockReset();
  getClaims.mockResolvedValue({ data: null, error: null });
  (createServerClient as jest.Mock).mockReset();
  (createServerClient as jest.Mock).mockImplementation(() => ({ auth: { getClaims } }));
});

afterEach(() => {
  jest.useRealTimers();
  process.env = { ...env };
});

const req = (path: string, method = "GET", cookie?: string) =>
  new NextRequest(`http://localhost:3000${path}`, { method, headers: cookie ? { cookie } : {} });
const legacy = () => `${ADMIN_SESSION_COOKIE}=${createSessionToken()}`;
const passes = (res: Response) => res.headers.get("x-middleware-next") === "1";

describe("the matcher", () => {
  test("covers exactly /admin/* and /api/admin/* (CR-05)", () => {
    expect(config.matcher).toEqual(["/admin/:path*", "/api/admin/:path*"]);
  });
});

describe("public without a session", () => {
  test.each([
    ["GET", "/admin/login"],
    ["POST", "/api/admin/login"],
    ["POST", "/api/admin/logout"],
    ["GET", "/api/admin/breaking-news"],
  ])("%s %s", async (method, path) => {
    expect(passes(await proxy(req(path, method)))).toBe(true);
  });
});

describe("everything else needs a session", () => {
  test("an admin API call with no session: 401 JSON", async () => {
    const res = await proxy(req("/api/admin/articles"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized: please log in." });
  });

  test("the breaking-news write with no session: 401 (only its GET is public)", async () => {
    expect((await proxy(req("/api/admin/breaking-news", "POST"))).status).toBe(401);
  });

  test("an admin page with no session: redirect to /admin/login", async () => {
    const res = await proxy(req("/admin"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/admin/login");
  });

  test("a forged cookie is no session", async () => {
    expect((await proxy(req("/api/admin/articles", "GET", `${ADMIN_SESSION_COOKIE}=123.abc`))).status).toBe(401);
  });

  test("a valid shared-password cookie passes, for pages and API calls", async () => {
    expect(passes(await proxy(req("/admin", "GET", legacy())))).toBe(true);
    expect(passes(await proxy(req("/api/admin/articles", "DELETE", legacy())))).toBe(true);
  });
});

// Panel 0: the proxy also accepts a Supabase staff session. It stays optimistic (no database call):
// getClaims() verifies the JWT and refreshes it when due; requirePermission decides in each route.
describe("the staff session (Panel 0)", () => {
  const staffClaims = () => getClaims.mockResolvedValue({ data: { claims: { sub: "u-1", aal: "aal1", session_id: "s-1" } }, error: null });

  test("a verified staff JWT passes, for pages and API calls", async () => {
    staffClaims();
    expect(passes(await proxy(req("/admin", "GET", "sb-ref-auth-token=x")))).toBe(true);
    expect(passes(await proxy(req("/api/admin/articles", "PATCH", "sb-ref-auth-token=x")))).toBe(true);
  });

  test("an invalid staff JWT and no legacy cookie: 401", async () => {
    getClaims.mockResolvedValue({ data: null, error: { message: "invalid JWT" } });
    expect((await proxy(req("/api/admin/articles", "GET", "sb-ref-auth-token=x"))).status).toBe(401);
  });

  test("a thrown error while checking (network): treated as no staff session", async () => {
    getClaims.mockRejectedValue(new Error("fetch failed"));
    expect((await proxy(req("/api/admin/articles"))).status).toBe(401);
  });

  test("no lockout: the shared-password cookie still passes alongside, and without Supabase configured", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });
    expect(passes(await proxy(req("/api/admin/articles", "GET", legacy())))).toBe(true);
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(passes(await proxy(req("/api/admin/articles", "GET", legacy())))).toBe(true);
  });

  test("a refreshed token is written to the response, HttpOnly, and passed on to the route", async () => {
    (createServerClient as jest.Mock).mockImplementation((_url: string, _key: string, opts: { cookies: { setAll: (l: unknown[], h: Record<string, string>) => void } }) => ({
      auth: {
        getClaims: async () => {
          opts.cookies.setAll([{ name: "sb-ref-auth-token", value: "fresh", options: { httpOnly: false, sameSite: "none", path: "/" } }], { "Cache-Control": "private, no-store" });
          return { data: { claims: { sub: "u-1" } }, error: null };
        },
      },
    }));
    const res = await proxy(req("/api/admin/articles", "GET", "sb-ref-auth-token=stale"));
    expect(passes(res)).toBe(true);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/sb-ref-auth-token=fresh/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    // The route handler sees the refreshed cookie, so it does not refresh (and spend the token) again.
    expect(res.headers.get("x-middleware-request-cookie") ?? res.headers.get("x-middleware-override-headers") ?? "").not.toBe("");
  });

  test("the shared password's end date applies here too: after it, its cookie is refused", async () => {
    const cookie = legacy();
    jest.setSystemTime(Date.parse("2026-12-31T18:30:00Z"));
    expect((await proxy(req("/api/admin/articles", "GET", cookie))).status).toBe(401);
  });

  test("the public list is the shared one: GET /api/admin/logout is not public, POST is", async () => {
    expect((await proxy(req("/api/admin/logout", "GET"))).status).toBe(401);
    expect(passes(await proxy(req("/api/admin/logout", "POST")))).toBe(true);
  });
});
