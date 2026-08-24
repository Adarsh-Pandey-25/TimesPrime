import { createHmac, timingSafeEqual } from "crypto";

export const ADMIN_SESSION_COOKIE = "timesprime_admin_session";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Session token shape: "<issuedAtMs>.<hmac-sha256 hex>". Stateless — no
 * server-side session store, so verification is just "was this payload
 * signed with our secret, and is it still inside the max-age window."
 * Returns null when ADMIN_SESSION_SECRET isn't configured, so a caller
 * can't accidentally issue a token nothing can ever verify.
 */
export function createSessionToken(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return null;

  const issuedAt = Date.now().toString();
  return `${issuedAt}.${sign(issuedAt, secret)}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || !token) return false;

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

/** Timing-safe comparison so a wrong-password guess can't be narrowed down character-by-character via response latency. */
export function verifyAdminPassword(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !candidate) return false;

  const expectedBuf = Buffer.from(expected);
  const candidateBuf = Buffer.from(candidate);
  if (expectedBuf.length !== candidateBuf.length) return false;
  return timingSafeEqual(expectedBuf, candidateBuf);
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
