import "server-only";

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { checkGlobalRateLimit, checkRateLimits, getClientIp, type RateLimitRule } from "@timesprime/server/lib/rateLimit";
import { readJsonBody } from "@timesprime/server/lib/readJsonBody";
import { GrievanceStoreError, storyIdByNumber, submitGrievance } from "@timesprime/server/repositories/grievances";
import { FORM_DAILY_CAP, FORM_PER_DAY, FORM_PER_HOUR, grievanceFields } from "@timesprime/shared/config/grievances";
import { isSection } from "@timesprime/shared/config/sections";
import { deskStoryNumberFrom } from "@timesprime/shared/lib/storyUrl";

// The grievance form (Panel 7 design §4, M1): a reader's complaint about anything published. It gets
// its ticket at once and is acknowledged on the spot; the decision is due within 15 days. The reader
// site's one write (decision 1): through grievance_submit, never a table. Decision 3: per address 3
// an hour and 10 a day, 500 a day across the site (the database holds that too), and a hidden field
// a person never fills. The answers carry a code the form words in the reader's language.

const BODY_LIMIT = 16 * 1024;
const HOUR = 3600;
const DAY = 24 * HOUR;
const PER_ADDRESS: readonly RateLimitRule[] = [
  { name: "grievance-hour", limit: FORM_PER_HOUR, windowSeconds: HOUR },
  { name: "grievance-day", limit: FORM_PER_DAY, windowSeconds: DAY },
];
const SITE: RateLimitRule = { name: "grievance-site-day", limit: FORM_DAILY_CAP, windowSeconds: DAY };
const NO_STORE = { "Cache-Control": "no-store" };

const answer = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });

export async function POST(request: NextRequest) {
  const read = await readJsonBody(request, BODY_LIMIT);
  if (!read.ok) return answer(read.tooLarge ? 413 : 400, { code: "invalid", error: read.tooLarge ? "The grievance is too long." : "The request was not valid JSON." });
  const body = read.value;
  if (!body || typeof body !== "object" || Array.isArray(body)) return answer(400, { code: "invalid", error: "The request must be a JSON object." });
  const input = body as Record<string, unknown>;
  // The hidden field: a person never sees it, so never fills it.
  if (typeof input.website === "string" && input.website.trim() !== "") return answer(400, { code: "invalid", error: "The grievance was not sent." });
  const checked = grievanceFields(input);
  if (!checked.ok) return answer(400, { code: "invalid", error: checked.error });

  // Counted only for a grievance that is whole, so a reader's typo does not use up their hour.
  const rate = await checkRateLimits(getClientIp(request), PER_ADDRESS);
  if (rate.limited) return answer(429, { code: "too_many", error: "Too many grievances from this address." }, { "Retry-After": String(rate.retryAfterSeconds) });
  const site = await checkGlobalRateLimit(SITE);
  if (site.limited) return answer(429, { code: "closed_today", error: "The form takes no more grievances today." }, { "Retry-After": String(site.retryAfterSeconds) });

  // The Desk story the address names, if it is published. A failed lookup only leaves it unlinked.
  let storyId: string | null = null;
  const number = checked.fields.aboutUrl ? deskStoryNumberFrom(checked.fields.aboutUrl, isSection) : null;
  if (number !== null) {
    try {
      storyId = await storyIdByNumber(number, true);
    } catch (err) {
      console.error("Grievance story lookup failed:", err);
    }
  }

  try {
    const sent = await submitGrievance(checked.fields, storyId);
    return answer(201, { ticket: sent.ticket, received_at: sent.received_at, decide_due_at: sent.decide_due_at });
  } catch (err) {
    if (err instanceof GrievanceStoreError && err.status === 429) return answer(429, { code: "closed_today", error: err.message });
    if (err instanceof GrievanceStoreError && err.status === 422) return answer(400, { code: "invalid", error: "The grievance was not accepted. Check each field." });
    console.error("Grievance submit failed:", err);
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "submitGrievance" } });
    return answer(503, { code: "failed", error: "The grievance could not be sent. Nothing was saved." });
  }
}
