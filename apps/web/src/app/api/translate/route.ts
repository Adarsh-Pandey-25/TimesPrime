import "server-only";

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { translateBatch } from "@timesprime/server/services/translate/googleTranslate";
import { checkGlobalRateLimit, checkRateLimits, getClientIp, type RateLimitRule } from "@timesprime/server/lib/rateLimit";
import { TRANSLATE_LIMITS } from "@timesprime/shared/config/aiLimits";
import { readJsonBody } from "@timesprime/server/lib/readJsonBody";

interface TranslateRequestBody {
  texts?: unknown;
  target?: unknown;
}

// Input caps (F-010), sized from the one caller: the article page sends
// [title, description, ...paragraphs], and the scraper caps the paragraphs
// at 5,000 characters in total (MAX_CONTENT_CHARS), so one paragraph can be
// up to 5,000 on its own. 50 items and 10,000 characters leave room for
// short paragraphs and a long description; 64 KB covers that in JSON, in
// any script.
const MAX_TEXTS = 50;
const MAX_TEXT_CHARS = 5_000;
const MAX_TOTAL_CHARS = 10_000;
const MAX_BODY_BYTES = 64 * 1024;

// The limits are TRANSLATE_LIMITS (packages/shared/src/config/aiLimits.ts), in the shared Redis,
// under names of their own, so translate and chat never share a budget. Per IP, checked first: the
// burst limit it always had, then a daily cap (R1-05); a Hindi reader's article page sends one
// batch per page. Then, only for a valid request about to reach the translator, the cap for every
// reader together (STOP R1). The daily windows are the UTC day (they reset at 05:30 IST).
const DAY_SECONDS = 24 * 60 * 60;
const TRANSLATE_RATE_LIMITS: readonly RateLimitRule[] = [
  { name: "translate", limit: TRANSLATE_LIMITS.perIpPerMinute, windowSeconds: 60 },
  { name: "translate-day", limit: TRANSLATE_LIMITS.perIpPerDay, windowSeconds: DAY_SECONDS },
];
const TRANSLATE_GLOBAL_LIMIT: RateLimitRule = {
  name: "translate-global-day",
  limit: TRANSLATE_LIMITS.globalPerDay,
  windowSeconds: DAY_SECONDS,
};

/** 429 with Retry-After. The article page falls back to the original text on any error. */
function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Too many translation requests. Please try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}

/**
 * Translates a batch of strings via the free Google Translate endpoint.
 * Body: { texts: string[], target: "hi" | "en" }. Returns
 * { translated: string[] } in the same order as the input. Rate-limited
 * per IP by TRANSLATE_RATE_LIMITS, a budget separate from /api/chat's.
 */
export async function POST(request: NextRequest) {
  try {
    const rate = await checkRateLimits(getClientIp(request), TRANSLATE_RATE_LIMITS);
    if (rate.limited) return tooManyRequests(rate.retryAfterSeconds);

    const read = await readJsonBody(request, MAX_BODY_BYTES);
    if (!read.ok) {
      return read.tooLarge
        ? NextResponse.json({ error: `Request body is too large (limit ${MAX_BODY_BYTES / 1024} KB).` }, { status: 413 })
        : NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    const body = (read.value ?? {}) as TranslateRequestBody;

    const { texts, target } = body;

    if (!Array.isArray(texts) || texts.length === 0 || !texts.every((t): t is string => typeof t === "string")) {
      return NextResponse.json({ error: "texts must be a non-empty array of strings." }, { status: 400 });
    }
    if (texts.length > MAX_TEXTS) {
      return NextResponse.json({ error: `texts may hold at most ${MAX_TEXTS} items.` }, { status: 400 });
    }
    if (texts.some((t) => t.length > MAX_TEXT_CHARS)) {
      return NextResponse.json({ error: `Each text may be at most ${MAX_TEXT_CHARS.toLocaleString("en-US")} characters.` }, { status: 400 });
    }
    if (texts.reduce((sum, t) => sum + t.length, 0) > MAX_TOTAL_CHARS) {
      return NextResponse.json({ error: `texts may hold at most ${MAX_TOTAL_CHARS.toLocaleString("en-US")} characters in total.` }, { status: 400 });
    }
    if (target !== "hi" && target !== "en") {
      return NextResponse.json({ error: 'target must be "hi" or "en".' }, { status: 400 });
    }

    // Every reader together, counted only now: this request is valid and about to be translated.
    const allReaders = await checkGlobalRateLimit(TRANSLATE_GLOBAL_LIMIT);
    if (allReaders.limited) return tooManyRequests(allReaders.retryAfterSeconds);

    const translated = await translateBatch(texts, target);

    return NextResponse.json({ translated });
  } catch (err) {
    console.error("Translate API error:", err);
    Sentry.captureException(err, { tags: { source: "translate" }, extra: { operation: "translateBatch" } });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to translate text." },
      { status: 500 }
    );
  }
}
