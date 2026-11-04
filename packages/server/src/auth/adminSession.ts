import "server-only";

import { createHash, createHmac, timingSafeEqual } from "crypto";

export const ADMIN_SESSION_COOKIE = "timesprime_admin_session";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

/**
 * The shared admin password is retired here: midnight IST at the close of 2026-12-31 (owner
 * decision Q3). It is a constant, not configuration, so the password stops working on that date
 * even if nobody changes the code or the environment again. From this instant no session token is
 * issued and none verifies, so the login route, the proxy and requirePermission all refuse it.
 */
export const LEGACY_LOGIN_ENDS_AT = new Date("2027-01-01T00:00:00+05:30");

/** ADMIN_LEGACY_LOGIN=off ends the shared password sooner, with no deploy. It cannot extend it. */
export function isLegacyLoginAllowed(now: Date = new Date()): boolean {
  if (now.getTime() >= LEGACY_LOGIN_ENDS_AT.getTime()) return false;
  return process.env.ADMIN_LEGACY_LOGIN?.trim().toLowerCase() !== "off";
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Session token shape: "<issuedAtMs>.<hmac-sha256 hex>". Stateless — no
 * server-side session store, so verification is just "was this payload
 * signed with our secret, and is it still inside the max-age window."
 * Returns null when ADMIN_SESSION_SECRET isn't configured, so a caller
 * can't accidentally issue a token nothing can ever verify, and once the
 * shared password is retired (isLegacyLoginAllowed).
 */
export function createSessionToken(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || !isLegacyLoginAllowed()) return null;

  const issuedAt = Date.now().toString();
  return `${issuedAt}.${sign(issuedAt, secret)}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || !token || !isLegacyLoginAllowed()) return false;

  const [issuedAt, signature] = token.split(".");
  if (!issuedAt || !signature) return false;

  const expected = sign(issuedAt, secret);
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  // timingSafeEqual throws on mismatched lengths rather than returning
  // false, so an invalid-length signature has to be rejected before the
  // call instead of by it.
  if (expectedBuf.length !== actualBuf.length) return false;
  if (!timingSafeEqual(expectedBuf, actualBuf)) return false;

  const issuedAtMs = Number(issuedAt);
  if (!Number.isFinite(issuedAtMs)) return false;
  const ageSeconds = (Date.now() - issuedAtMs) / 1000;
  return ageSeconds >= 0 && ageSeconds <= SESSION_MAX_AGE_SECONDS;
}

const sha256 = (value: string) => createHash("sha256").update(value).digest();

/**
 * Timing-safe comparison so a wrong-password guess can't be narrowed down
 * character-by-character via response latency. Both sides are hashed first,
 * so timingSafeEqual always compares two 32-byte digests: a candidate of the
 * wrong length takes the same path as any other (F-004). It used to return
 * early on a length mismatch, which told an attacker the password's length.
 */
export function verifyAdminPassword(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return timingSafeEqual(sha256(candidate), sha256(expected));
}

export function sessionCookieOptions(maxAge: number = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
