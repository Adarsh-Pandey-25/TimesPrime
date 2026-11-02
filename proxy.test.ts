/**
 * @jest-environment node
 *
 * proxy.ts, the optimistic check in front of /admin/* and /api/admin/* (Next 16's renamed
 * Middleware). Characterization first: this pins its behaviour with the shared-password cookie
 * before Panel 0 teaches it the staff session. It was at 0% coverage.
 */

import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";
import { ADMIN_SESSION_COOKIE, createSessionToken } from "@/backend/auth/adminSession";

const env = { ...process.env };

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = "session-secret-for-tests";
  delete process.env.ADMIN_LEGACY_LOGIN;
  jest.useFakeTimers({ now: Date.parse("2026-11-10T12:00:00Z"), doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
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
