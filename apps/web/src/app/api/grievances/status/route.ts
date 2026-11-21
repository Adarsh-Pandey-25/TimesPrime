import "server-only";

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { checkRateLimits, getClientIp, type RateLimitRule } from "@timesprime/server/lib/rateLimit";
import { readJsonBody } from "@timesprime/server/lib/readJsonBody";
import { grievanceStatus } from "@timesprime/server/repositories/grievances";
import { isEmail, normaliseTicket, STATUS_PER_HOUR, TICKET_PATTERN } from "@timesprime/shared/config/grievances";

// A grievance's status (Panel 7 design §4, M1): its state, its dates and, once decided, the decision
// and the reply. Only for whoever has both its ticket and its email; a wrong email answers as an
// unknown ticket does. Sent by POST, so the email is never in an address or a log. Per address, 20
// an hour, counted before anything is read, so ticket and email pairs cannot be tried at speed.

const BODY_LIMIT = 2 * 1024;
const PER_ADDRESS: readonly RateLimitRule[] = [{ name: "grievance-status-hour", limit: STATUS_PER_HOUR, windowSeconds: 3600 }];
const NO_STORE = { "Cache-Control": "no-store" };

const answer = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });

export async function POST(request: NextRequest) {
  const rate = await checkRateLimits(getClientIp(request), PER_ADDRESS);
  if (rate.limited) return answer(429, { code: "too_many", error: "Too many tries from this address." }, { "Retry-After": String(rate.retryAfterSeconds) });

  const read = await readJsonBody(request, BODY_LIMIT);
  const body = read.ok && read.value && typeof read.value === "object" && !Array.isArray(read.value) ? (read.value as Record<string, unknown>) : null;
  const ticket = typeof body?.ticket === "string" ? normaliseTicket(body.ticket) : "";
  if (!body || !TICKET_PATTERN.test(ticket) || !isEmail(body.email)) {
    return answer(400, { code: "invalid", error: "A ticket (like G-2026-00042) and the email it was sent with are required." });
  }

  try {
    const grievance = await grievanceStatus(ticket, (body.email as string).trim());
    if (!grievance) return answer(404, { code: "not_found", error: "No grievance has this ticket and email." });
    return answer(200, { grievance });
  } catch (err) {
    console.error("Grievance status failed:", err);
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "grievanceStatus" } });
    return answer(503, { code: "failed", error: "The status could not be read." });
  }
}
