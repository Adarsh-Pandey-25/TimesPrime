import "server-only";

import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  createSessionToken,
  isLegacyLoginAllowed,
  sessionCookieOptions,
  verifyAdminPassword,
} from "@/backend/auth/adminSession";
import { checkRateLimit, getClientIp } from "@/backend/lib/rateLimit";

// F-004: every attempt counts, right or wrong. An admin who mistypes a few
// times stays well inside 10 per 15 minutes; a guesser gets 40 an hour per IP.
const LOGIN_RATE_LIMIT = { name: "login", limit: 10, windowSeconds: 15 * 60 };

export async function POST(request: NextRequest) {
  if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_SESSION_SECRET) {
    return NextResponse.json(
      { error: "Admin login is not configured. Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET in frontend/.env." },
      { status: 503 }
    );
  }

  // Q3: refused once retired, before the password is even compared, so a retired password cannot
  // be tested for correctness either.
  if (!isLegacyLoginAllowed()) {
    return NextResponse.json(
      { error: "The shared admin password has been retired. Sign in with your staff account." },
      { status: 403 }
    );
  }

  const rate = await checkRateLimit(getClientIp(request), LOGIN_RATE_LIMIT);
  if (rate.limited) {
    return NextResponse.json(
      { error: `Too many login attempts. Try again in ${rate.retryAfterSeconds} seconds.` },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  let password: unknown;
  try {
    const body = await request.json();
    password = body?.password;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof password !== "string" || !verifyAdminPassword(password)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const token = createSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Admin login is not configured." }, { status: 503 });
  }

  const response = NextResponse.json({ status: "success" });
  response.cookies.set(ADMIN_SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
