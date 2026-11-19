/**
 * @jest-environment node
 *
 * readSession and the cookie flags on the staff session (design §3). The Supabase client is
 * stubbed: what matters here is that a session counts only when both getClaims() (a verified JWT)
 * and getUser() (the session still exists) agree, that aal comes from the verified claims, and that
 * every error is "no session".
 */

jest.mock("next/headers", () => ({ cookies: jest.fn() }));
jest.mock("@supabase/ssr", () => ({ createServerClient: jest.fn() }));

import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { readSession } from "./staffSession";
import { createRouteClient, hardenCookie } from "./supabaseServer";

const getClaims = jest.fn();
const getUser = jest.fn();
const store = { getAll: jest.fn(() => []), set: jest.fn() };
const env = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  (cookies as jest.Mock).mockResolvedValue(store);
  (createServerClient as jest.Mock).mockReturnValue({ auth: { getClaims, getUser } });
  getClaims.mockResolvedValue({ data: { claims: { sub: "u-1", aal: "aal2", session_id: "s-1" } }, error: null });
  getUser.mockResolvedValue({ data: { user: { id: "u-1" } }, error: null });
  jest.useFakeTimers({ now: Date.parse("2026-11-10T12:00:00Z"), doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
});

afterEach(() => {
  jest.useRealTimers();
  process.env = { ...env };
});

const request = (cookie?: string) => new NextRequest("http://localhost:3000/api/admin/articles", { headers: cookie ? { cookie } : {} });

describe("a staff session", () => {
  test("verified claims and a live session: staff, with aal and session id from the claims", async () => {
    expect(await readSession(request())).toEqual({ kind: "staff", userId: "u-1", aal: "aal2", sessionId: "s-1" });
  });

  test("aal is aal1 unless the verified claim says aal2", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "u-1", session_id: "s-1" } }, error: null });
    expect(await readSession(request())).toMatchObject({ aal: "aal1" });
  });

  test("no claims (no cookie, a forged or expired token): no session", async () => {
    getClaims.mockResolvedValue({ data: null, error: { message: "invalid JWT" } });
    expect(await readSession(request())).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  test("a valid JWT whose session was signed out (getUser fails): no session", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "session_not_found" } });
    expect(await readSession(request())).toBeNull();
  });

  test("getUser answering for a different user: no session", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-2" } }, error: null });
    expect(await readSession(request())).toBeNull();
  });

  test("a thrown error (network): no session, never a pass", async () => {
    getClaims.mockRejectedValue(new Error("fetch failed"));
    expect(await readSession(request())).toBeNull();
  });

  test("Supabase not configured: no client, no staff session", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(await readSession(request())).toBeNull();
    expect(createServerClient).not.toHaveBeenCalled();
  });
});

// Panel 1, M4: the shared admin password is retired. Its old cookie is nothing now.
test("the retired shared password's cookie is no session", async () => {
  getClaims.mockResolvedValue({ data: null, error: null });
  expect(await readSession(request("timesprime_admin_session=1700000000000.abcdef"))).toBeNull();
});

describe("the staff session cookie's flags", () => {
  test("HttpOnly, SameSite=Lax and root path, whatever @supabase/ssr proposes", () => {
    expect(hardenCookie({ httpOnly: false, sameSite: "none", maxAge: 400 })).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 400,
    });
  });

  // E-04: the back office lives on admin.timesprime247.com. A cookie without a Domain attribute is
  // host-only: the browser sends it to that exact host and to no other subdomain, nor the reader
  // site. A Domain attribute would widen it to every *.timesprime247.com, so none is ever set.
  test("host-only: a Domain that @supabase/ssr proposes is dropped", () => {
    const hardened = hardenCookie({ domain: ".timesprime247.com", maxAge: 400 });
    expect(hardened).not.toHaveProperty("domain");
    expect(hardened.maxAge).toBe(400);
  });

  test("the route client writes every cookie through hardenCookie", async () => {
    await createRouteClient();
    const { cookies: methods } = (createServerClient as jest.Mock).mock.calls[0][2];
    methods.setAll([{ name: "sb-ref-auth-token", value: "v", options: { httpOnly: false, sameSite: "none" } }], {});
    expect(store.set).toHaveBeenCalledWith("sb-ref-auth-token", "v", expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }));
  });

  test("it uses the public anon key: data is read elsewhere, behind requirePermission", async () => {
    await createRouteClient();
    expect((createServerClient as jest.Mock).mock.calls[0].slice(0, 2)).toEqual(["https://example.supabase.co", "anon"]);
  });
});
