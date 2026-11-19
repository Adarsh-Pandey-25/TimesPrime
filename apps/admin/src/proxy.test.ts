/**
 * @jest-environment node
 *
 * apps/admin/src/proxy.ts, the optimistic check in front of /admin/* and /api/admin/* (Next 16's renamed
 * Middleware). Since Panel 1's M4 it accepts one kind of session, a Supabase staff session; the
 * shared admin password's cookie, retired, is no session.
 */

jest.mock("@supabase/ssr", () => ({ createServerClient: jest.fn() }));

import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { config, proxy } from "./proxy";

const env = { ...process.env };
const getClaims = jest.fn();

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
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
// The retired shared password's cookie, as a browser may still send it.
const OLD_COOKIE = "timesprime_admin_session=1700000000000.abcdef0123456789";
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
    ["GET", "/admin/welcome"],
    ["POST", "/api/admin/welcome"],
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

  test("breaking news with no session: 401 for the read and the write (the public read is on the reader site)", async () => {
    expect((await proxy(req("/api/admin/breaking-news"))).status).toBe(401);
    expect((await proxy(req("/api/admin/breaking-news", "POST"))).status).toBe(401);
  });

  test("an admin page with no session: redirect to /admin/login", async () => {
    const res = await proxy(req("/admin"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/admin/login");
  });

  test("the retired shared password's cookie is no session: 401, and a redirect for pages", async () => {
    expect((await proxy(req("/api/admin/articles", "GET", OLD_COOKIE))).status).toBe(401);
    expect((await proxy(req("/admin", "GET", OLD_COOKIE))).status).toBe(307);
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

  test("an invalid staff JWT: 401", async () => {
    getClaims.mockResolvedValue({ data: null, error: { message: "invalid JWT" } });
    expect((await proxy(req("/api/admin/articles", "GET", "sb-ref-auth-token=x"))).status).toBe(401);
  });

  test("a thrown error while checking (network): treated as no staff session", async () => {
    getClaims.mockRejectedValue(new Error("fetch failed"));
    expect((await proxy(req("/api/admin/articles"))).status).toBe(401);
  });

  test("without Supabase configured, nothing passes: there is no other session", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect((await proxy(req("/api/admin/articles", "GET", OLD_COOKIE))).status).toBe(401);
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

  test("the public list is the shared one: GET /api/admin/logout is not public, POST is", async () => {
    expect((await proxy(req("/api/admin/logout", "GET"))).status).toBe(401);
    expect(passes(await proxy(req("/api/admin/logout", "POST")))).toBe(true);
  });
});
