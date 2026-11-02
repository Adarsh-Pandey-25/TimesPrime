/**
 * @jest-environment node
 *
 * The admin session and password check (audit Phase 2, step 2.1): what the
 * proxy relies on to gate /admin/* and /api/admin/*. These pin today's
 * behaviour; F-004 changes the password comparison and adds its own tests.
 */

import {
  ADMIN_SESSION_COOKIE,
  createSessionToken,
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
