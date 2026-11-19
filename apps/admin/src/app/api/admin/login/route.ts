import "server-only";

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getMfaState } from "@timesprime/server/auth/mfa";
import { auditEvent, type Actor } from "@timesprime/server/auth/requirePermission";
import { createRouteClient } from "@timesprime/server/auth/supabaseServer";
import { checkRateLimit, getClientIp } from "@timesprime/server/lib/rateLimit";
import { getRequestId } from "@timesprime/server/lib/requestId";
import { loadStaffRecord, markSignedIn } from "@timesprime/server/repositories/staff";

// Sign-in, public by necessity (D10): { email, password }, a staff account through Supabase Auth
// (Panel 0). The second factor comes next, at /api/admin/mfa; the response says which step. The
// shared admin password was retired in Panel 1's M4: a body without an email is refused.

// F-004: every attempt counts, right or wrong. An admin who mistypes a few
// times stays well inside 10 per 15 minutes; a guesser gets 40 an hour per IP.
const LOGIN_RATE_LIMIT = { name: "login", limit: 10, windowSeconds: 15 * 60 };

export async function POST(request: NextRequest) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = (await request.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  return staffSignIn(request, body.email, body.password);
}

async function rateLimited(request: NextRequest): Promise<NextResponse | null> {
  const rate = await checkRateLimit(getClientIp(request), LOGIN_RATE_LIMIT);
  if (!rate.limited) return null;
  return NextResponse.json(
    { error: `Too many login attempts. Try again in ${rate.retryAfterSeconds} seconds.` },
    { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
  );
}

/** A staff account. Its session cookies are written by the route client (HttpOnly, supabaseServer.ts). */
async function staffSignIn(request: NextRequest, email: unknown, password: unknown): Promise<NextResponse> {
  const limited = await rateLimited(request);
  if (limited) return limited;

  if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
    return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  }

  const client = await createRouteClient();
  if (!client) return NextResponse.json({ error: "Staff sign-in is not configured." }, { status: 503 });

  const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  const userId = data?.user?.id;
  // One message for a wrong email and a wrong password: which one was wrong is not told.
  if (error || !userId) return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });

  const actor: Actor = {
    kind: "staff",
    userId,
    label: userId,
    aal: "aal1",
    roles: [],
    via: [],
    record: null,
    meta: { ip: getClientIp(request), userAgent: request.headers.get("user-agent"), requestId: getRequestId(request) },
  };

  let record;
  try {
    record = await loadStaffRecord(userId);
  } catch (err) {
    console.error("Staff record lookup failed at sign-in:", err);
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "loadStaffRecord", at: "sign-in" } });
    await client.auth.signOut({ scope: "local" });
    return NextResponse.json({ error: "Could not check your account. Try again." }, { status: 503 });
  }

  // A valid Supabase user is not necessarily staff: only a staff profile makes one (design §1).
  if (!record || record.status !== "active") {
    const reason = !record ? "not_staff" : "suspended";
    await client.auth.signOut({ scope: "local" });
    await auditEvent(actor, "auth.sign_in", "failed", { reason });
    return NextResponse.json(
      { error: !record ? "This account is not a staff account." : "This staff account is suspended.", code: reason },
      { status: 403 }
    );
  }

  actor.label = record.displayName;
  await auditEvent(actor, "auth.sign_in", "succeeded");
  await markSignedIn(userId);

  const mfa = await getMfaState(client);
  const needsAal2 = record.mfaRequired || record.assignments.some((a) => a.requiresAal2);
  const next = mfa?.enrolled ? "mfa_verify" : needsAal2 ? "mfa_enroll" : "done";
  return NextResponse.json({ status: "success", kind: "staff", next }, { headers: { "Cache-Control": "no-store" } });
}
