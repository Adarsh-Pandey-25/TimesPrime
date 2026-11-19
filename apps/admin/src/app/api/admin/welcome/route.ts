import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getMfaState } from "@timesprime/server/auth/mfa";
import { auditEvent, type Actor } from "@timesprime/server/auth/requirePermission";
import { createRouteClient } from "@timesprime/server/auth/supabaseServer";
import { checkRateLimit, getClientIp } from "@timesprime/server/lib/rateLimit";
import { readJsonBody } from "@timesprime/server/lib/readJsonBody";
import { getRequestId } from "@timesprime/server/lib/requestId";
import { loadStaffRecord } from "@timesprime/server/repositories/staff";

// Opens a one-time "set your password" link (Panel 1 design §4, M2). Public (PUBLIC_ADMIN_ROUTES):
// its owner has no session yet; the token is the credential. Supabase exchanges it for a session
// (verifyOtp, type recovery), which this request's cookies carry. The person then sets a password
// (POST /api/admin/password); if they already have a second factor, they enter its code first, so a
// link alone does not take over an account. Only an active staff member may go on; anyone else is
// signed out again. Rate-limited by address, so tokens cannot be guessed at speed.
//   { token_hash, type: "recovery" }  →  { name, email, hasFactor }

const LIMIT = { name: "welcome", limit: 10, windowSeconds: 15 * 60 };
const TOKEN = /^[A-Za-z0-9_-]{16,256}$/;
const MAX_BODY_BYTES = 1024;

const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

const INVALID = "This link does not work any more: it was used, or it expired. Ask your admin for a new one.";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rate = await checkRateLimit(`ip:${ip}`, LIMIT);
  if (rate.limited) {
    return json({ error: `Too many tries. Try again in ${rate.retryAfterSeconds} seconds.` }, 429, { "Retry-After": String(rate.retryAfterSeconds) });
  }

  const body = await readJsonBody(request, MAX_BODY_BYTES);
  if (!body.ok) return json({ error: "Invalid request body." }, 400);
  const input = (body.value ?? {}) as { token_hash?: unknown; type?: unknown };
  if (typeof input.token_hash !== "string" || !TOKEN.test(input.token_hash) || input.type !== "recovery") {
    return json({ error: INVALID, code: "link_invalid" }, 400);
  }

  const client = await createRouteClient();
  if (!client) return json({ error: "Sign-in is not available right now. Try again later." }, 503);
  const { data, error } = await client.auth.verifyOtp({ token_hash: input.token_hash, type: "recovery" });
  const user = data?.user;
  if (error || !user) return json({ error: INVALID, code: "link_invalid" }, 400);

  let record;
  try {
    record = await loadStaffRecord(user.id);
  } catch (err) {
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "loadStaffRecord" } });
    await client.auth.signOut({ scope: "local" });
    return json({ error: "Could not check your account. Try the link again in a minute." }, 503);
  }
  if (!record || record.status !== "active") {
    await client.auth.signOut({ scope: "local" });
    return json({ error: "This account cannot use the back office. Ask your admin.", code: record ? "suspended" : "not_staff" }, 403);
  }

  const state = await getMfaState(client);
  const actor: Actor = {
    kind: "staff",
    userId: user.id,
    label: record.displayName,
    aal: "aal1",
    roles: [],
    via: [],
    record,
    meta: { ip, userAgent: request.headers.get("user-agent"), requestId: getRequestId(request) },
  };
  await auditEvent(actor, "auth.welcome_link_used", "succeeded");
  return json({ name: record.displayName, email: user.email ?? null, hasFactor: state?.enrolled ?? false });
}
