/**
 * @jest-environment node
 *
 * The admin session and password check (audit Phase 2, step 2.1): what the
 * proxy relies on to gate /admin/* and /api/admin/*. These pin today's
 * behaviour; F-004 changes the password comparison and adds its own tests.
 */

// Pass-through spy on timingSafeEqual, so a test can see which comparison ran.
jest.mock("crypto", () => {
  const actual = jest.requireActual("crypto");
  return { ...actual, timingSafeEqual: jest.fn(actual.timingSafeEqual) };
});

import { timingSafeEqual } from "crypto";
import {
  ADMIN_SESSION_COOKIE,
  createSessionToken,
  isLegacyLoginAllowed,
  LEGACY_LOGIN_ENDS_AT,
  sessionCookieOptions,
  verifyAdminPassword,
  verifySessionToken,
} from "./adminSession";

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const env = { ...process.env };

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = "session-secret-for-tests";
  process.env.ADMIN_PASSWORD = "correct horse battery staple";
  jest.useFakeTimers();
  jest.setSystemTime(Date.parse("2026-11-02T10:00:00Z"));
});

afterEach(() => {
  jest.useRealTimers();
  process.env = { ...env };
});

describe("createSessionToken", () => {
  test("is <issuedAtMs>.<hmac-sha256 hex>", () => {
    expect(createSessionToken()).toMatch(/^\d+\.[0-9a-f]{64}$/);
    expect(createSessionToken()?.split(".")[0]).toBe(String(Date.parse("2026-11-02T10:00:00Z")));
  });

  test("returns null when ADMIN_SESSION_SECRET is unset, so no unverifiable token is issued", () => {
    delete process.env.ADMIN_SESSION_SECRET;
    expect(createSessionToken()).toBeNull();
  });
});

describe("verifySessionToken", () => {
  test("accepts a fresh token", () => {
    expect(verifySessionToken(createSessionToken())).toBe(true);
  });

  test("accepts a token at exactly twelve hours, and rejects it one second later", () => {
    const token = createSessionToken();
    jest.setSystemTime(Date.now() + TWELVE_HOURS_MS);
    expect(verifySessionToken(token)).toBe(true);
    jest.setSystemTime(Date.now() + 1000);
    expect(verifySessionToken(token)).toBe(false);
  });

  test("rejects a token signed with another secret", () => {
    const token = createSessionToken();
    process.env.ADMIN_SESSION_SECRET = "a-different-secret";
    expect(verifySessionToken(token)).toBe(false);
  });

  test("rejects everything when ADMIN_SESSION_SECRET is unset", () => {
    const token = createSessionToken();
    delete process.env.ADMIN_SESSION_SECRET;
    expect(verifySessionToken(token)).toBe(false);
  });

  test("rejects a tampered signature", () => {
    const [issuedAt, signature] = createSessionToken()!.split(".");
    const flipped = signature.slice(0, -1) + (signature.endsWith("0") ? "1" : "0");
    expect(verifySessionToken(`${issuedAt}.${flipped}`)).toBe(false);
  });

  test("rejects a tampered timestamp: extending a session breaks the signature", () => {
    const [issuedAt, signature] = createSessionToken()!.split(".");
    expect(verifySessionToken(`${Number(issuedAt) + TWELVE_HOURS_MS}.${signature}`)).toBe(false);
  });

  test("rejects a correctly signed token issued in the future", () => {
    jest.setSystemTime(Date.now() + 60_000);
    const token = createSessionToken();
    jest.setSystemTime(Date.now() - 60_000);
    expect(verifySessionToken(token)).toBe(false);
  });

  test.each([undefined, null, "", "garbage", "123", "123.", ".abc", "123.not-hex", "123.abcd", "abc.def.ghi"])(
    "rejects a malformed token: %j",
    (token) => {
      expect(verifySessionToken(token as string | null | undefined)).toBe(false);
    }
  );
});

describe("verifyAdminPassword", () => {
  test("accepts the configured password", () => {
    expect(verifyAdminPassword("correct horse battery staple")).toBe(true);
  });

  test.each(["correct horse battery stapl!", "wrong", "correct horse battery staple ", ""])("rejects %j", (candidate) => {
    expect(verifyAdminPassword(candidate)).toBe(false);
  });

  test("rejects everything when ADMIN_PASSWORD is unset", () => {
    delete process.env.ADMIN_PASSWORD;
    expect(verifyAdminPassword("")).toBe(false);
    expect(verifyAdminPassword("anything")).toBe(false);
  });

  // F-004: a candidate of the wrong length returned early, before the
  // timing-safe compare, so response time told an attacker the length.
  describe("every candidate takes the same path (F-004)", () => {
    const compare = timingSafeEqual as jest.Mock;
    beforeEach(() => compare.mockClear());

    test.each([
      ["the correct password", "correct horse battery staple"],
      ["a wrong password of the same length", "correct horse battery stapl!"],
      ["a wrong password of a different length", "x"],
      ["a very long wrong password", "y".repeat(500)],
      ["an empty password", ""],
    ])("%s: one timingSafeEqual over two 32-byte digests", (_label, candidate) => {
      verifyAdminPassword(candidate);
      expect(compare).toHaveBeenCalledTimes(1);
      const [a, b] = compare.mock.calls[0] as [Buffer, Buffer];
      expect(a.length).toBe(32);
      expect(b.length).toBe(32);
    });
  });
});

describe("sessionCookieOptions", () => {
  test("httpOnly, SameSite=Lax, root path, twelve hours", () => {
    expect(sessionCookieOptions()).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 12 * 60 * 60 });
    expect(ADMIN_SESSION_COOKIE).toBe("timesprime_admin_session");
  });

  test("Secure only in production", () => {
    expect(sessionCookieOptions().secure).toBe(process.env.NODE_ENV === "production");
  });
});

// Owner decision Q3: the shared password runs until Panel 1 with a hard end in code, so it stops
// even if no one ever changes the code or the environment again; ADMIN_LEGACY_LOGIN=off ends it
// sooner. The end is midnight IST at the close of 2026-12-31.
describe("the shared password's end date and kill switch (Q3)", () => {
  const LAST_MOMENT = Date.parse("2026-12-31T18:29:59.999Z"); // 23:59:59.999 IST
  const END = Date.parse("2026-12-31T18:30:00.000Z"); // 2027-01-01 00:00 IST

  test("the end is 2027-01-01 00:00 IST", () => {
    expect(LEGACY_LOGIN_ENDS_AT.getTime()).toBe(END);
  });

  test("allowed before the end; refused at and after it", () => {
    expect(isLegacyLoginAllowed(new Date(LAST_MOMENT))).toBe(true);
    expect(isLegacyLoginAllowed(new Date(END))).toBe(false);
    expect(isLegacyLoginAllowed(new Date("2027-03-01T00:00:00Z"))).toBe(false);
  });

  test("after the end, even ADMIN_LEGACY_LOGIN=on cannot bring it back", () => {
    process.env.ADMIN_LEGACY_LOGIN = "on";
    expect(isLegacyLoginAllowed(new Date(END))).toBe(false);
  });

  test("ADMIN_LEGACY_LOGIN=off ends it before the date; any other value leaves it on", () => {
    process.env.ADMIN_LEGACY_LOGIN = "off";
    expect(isLegacyLoginAllowed(new Date(LAST_MOMENT))).toBe(false);
    process.env.ADMIN_LEGACY_LOGIN = "OFF ";
    expect(isLegacyLoginAllowed(new Date(LAST_MOMENT))).toBe(false);
    process.env.ADMIN_LEGACY_LOGIN = "on";
    expect(isLegacyLoginAllowed(new Date(LAST_MOMENT))).toBe(true);
  });

  test("a valid session cookie stops verifying at the end, so the proxy and the routes refuse it too", () => {
    jest.setSystemTime(END - 60 * 60 * 1000);
    const token = createSessionToken();
    expect(verifySessionToken(token)).toBe(true);
    jest.setSystemTime(END);
    expect(verifySessionToken(token)).toBe(false);
  });

  test("with the kill switch, a valid cookie stops verifying at once", () => {
    const token = createSessionToken();
    process.env.ADMIN_LEGACY_LOGIN = "off";
    expect(verifySessionToken(token)).toBe(false);
  });

  test("no token is issued once it is over", () => {
    process.env.ADMIN_LEGACY_LOGIN = "off";
    expect(createSessionToken()).toBeNull();
  });
});
