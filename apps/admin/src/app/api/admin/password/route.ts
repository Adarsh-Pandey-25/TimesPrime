import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getMfaState } from "@timesprime/server/auth/mfa";
import { auditEvent, requireSession } from "@timesprime/server/auth/requirePermission";
import { createRouteClient } from "@timesprime/server/auth/supabaseServer";
import { checkRateLimit } from "@timesprime/server/lib/rateLimit";
import { readJsonBody } from "@timesprime/server/lib/readJsonBody";
import { passwordProblem } from "@timesprime/shared/config/people";

// A staff member sets their own password (Panel 1 design §4, M2): after opening a one-time link
// (POST /api/admin/welcome), or to change it. Session-only (SESSION_ONLY_ADMIN_ROUTES). With a
// second factor set up, only from an aal2 session: a link or a stolen password alone cannot change
// it. Afterwards every session of the account is ended, and the person signs in again with the new
// password (and sets up a second factor, if they have none yet).
//   { password }  →  { status: "success", signIn: "/admin/login" }

const LIMIT = { name: "password", limit: 5, windowSeconds: 15 * 60 };
const MAX_BODY_BYTES = 1024;

const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

export async function POST(request: NextRequest) {
  const gate = await requireSession(request);
  if (!gate.ok) return gate.response;
  const actor = gate.actor;
  if (!actor.userId) return json({ error: "Sign in with your staff account." }, 400);

  const body = await readJsonBody(request, MAX_BODY_BYTES);
  if (!body.ok) return json({ error: body.tooLarge ? "Request body too large." : "Invalid request body." }, body.tooLarge ? 413 : 400);
  const password = (body.value as { password?: unknown } | null)?.password;

  const client = await createRouteClient();
  const state = client ? await getMfaState(client) : null;
  if (!client || !state) {
    if (client) Sentry.captureMessage("Password: the factors could not be read", { level: "error", tags: { source: "supabase" } });
    return json({ error: "Could not check your second factor. Try again." }, 503);
  }
  if (state.enrolled && actor.aal !== "aal2") {
    return json({ error: "Enter the code from your authenticator app first.", code: "mfa_required" }, 403);
  }

  const { data: who } = await client.auth.getUser();
  const problem = passwordProblem(password, who?.user?.email ?? null);
  if (problem) return json({ error: problem, code: "weak_password" }, 400);

  const rate = await checkRateLimit(`user:${actor.userId}`, LIMIT);
  if (rate.limited) {
    return json({ error: `Too many tries. Try again in ${rate.retryAfterSeconds} seconds.` }, 429, { "Retry-After": String(rate.retryAfterSeconds) });
  }

  const { error } = await client.auth.updateUser({ password: password as string });
  if (error) {
    await auditEvent(actor, "auth.password_set", "failed", { reason: error.message });
    // Supabase's own rules (a reused or weak password) come back in its words.
    return json({ error: error.message || "The password was not changed.", code: "refused" }, 422);
  }
  await auditEvent(actor, "auth.password_set", "succeeded");
  // Every session of the account ends, this one too: the next sign-in uses the new password.
  await client.auth.signOut({ scope: "global" });
  return json({ status: "success", signIn: "/admin/login" });
}
