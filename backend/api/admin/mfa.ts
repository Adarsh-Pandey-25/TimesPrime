import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { enrollTotp, getMfaState, verifyTotp } from "@/backend/auth/mfa";
import { auditEvent, requireSession } from "@/backend/auth/requirePermission";
import { createRouteClient } from "@/backend/auth/supabaseServer";
import { checkRateLimit } from "@/backend/lib/rateLimit";
import { readJsonBody } from "@/backend/lib/readJsonBody";

// A staff member's second factor (design §5). Session-only (SESSION_ONLY_ADMIN_ROUTES): an aal1
// session must reach it, because this is how it becomes aal2.
//   { action: "enroll" }                     starts a TOTP enrolment: QR code and secret
//   { action: "verify", code, factorId? }    checks one code; success upgrades the session to aal2
// A verified factor cannot be replaced here: resetting a lost device is for an admin (the owner in
// the dashboard now, Panel 1 in the app), so a stolen password alone cannot swap the factor.

// Six digits in a 30-second window: five tries per user per 15 minutes leave a guesser nowhere.
const VERIFY_LIMIT = { name: "mfa", limit: 5, windowSeconds: 15 * 60 };
const MAX_BODY_BYTES = 1024;

const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

export async function POST(request: NextRequest) {
  const gate = await requireSession(request);
  if (!gate.ok) return gate.response;
  const actor = gate.actor;
  if (actor.kind === "legacy" || !actor.userId) {
    return json({ error: "The shared password has no second factor. Sign in with your staff account." }, 400);
  }

  const body = await readJsonBody(request, MAX_BODY_BYTES);
  if (!body.ok) return json({ error: body.tooLarge ? "Request body too large." : "Invalid request body." }, body.tooLarge ? 413 : 400);
  const input = (body.value ?? {}) as { action?: unknown; code?: unknown; factorId?: unknown };

  if (input.action !== "enroll" && input.action !== "verify") {
    return json({ error: 'action must be "enroll" or "verify".' }, 400);
  }

  const client = await createRouteClient();
  const state = client ? await getMfaState(client) : null;
  if (!client || !state) {
    // No client: Supabase is not configured, a set-up state the sign-in route answers too. A failed
    // read with a client is Auth failing, which is reported.
    if (client) Sentry.captureMessage("MFA: the factors could not be read", { level: "error", tags: { source: "supabase" }, extra: { operation: "listFactors" } });
    return json({ error: "Could not read your second-factor status. Try again." }, 503);
  }

  if (input.action === "enroll") {
    if (state.enrolled) {
      return json({ error: "A second factor is already set up. Ask an administrator to reset it if you lost the device." }, 409);
    }
    const enrolment = await enrollTotp(client, state);
    if (!enrolment) {
      Sentry.captureMessage("MFA: the enrolment could not start", { level: "error", tags: { source: "supabase" }, extra: { operation: "enroll" } });
      return json({ error: "Could not start the set-up. Try again." }, 502);
    }
    await auditEvent(actor, "auth.mfa_enroll_started", "succeeded");
    return json(enrolment);
  }

  const code = typeof input.code === "string" ? input.code.trim() : "";
  if (!/^\d{6}$/.test(code)) return json({ error: "Enter the 6-digit code from your authenticator app." }, 400);

  // Sign-in with an enrolled factor always uses that factor; the body cannot name another.
  // Confirming a new enrolment names it, and it must be one of this user's unconfirmed factors.
  const factorId = state.enrolled
    ? state.verifiedFactorId
    : typeof input.factorId === "string" && state.unverifiedFactorIds.includes(input.factorId)
      ? input.factorId
      : null;
  if (!factorId) return json({ error: "Start the set-up again." }, 400);

  const rate = await checkRateLimit(`user:${actor.userId}`, VERIFY_LIMIT);
  if (rate.limited) {
    return json({ error: `Too many codes. Try again in ${rate.retryAfterSeconds} seconds.` }, 429, { "Retry-After": String(rate.retryAfterSeconds) });
  }

  if (!(await verifyTotp(client, factorId, code))) {
    await auditEvent(actor, "auth.mfa_failed", "failed");
    return json({ error: "That code is not right. Enter the current one." }, 401);
  }
  await auditEvent(actor, state.enrolled ? "auth.mfa_verified" : "auth.mfa_enrolled", "succeeded");
  return json({ status: "success", aal: "aal2" });
}
