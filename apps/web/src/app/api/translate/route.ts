import "server-only";

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { translateBatch } from "@timesprime/server/services/translate/googleTranslate";
import { checkRateLimits, getClientIp, type RateLimitRule } from "@timesprime/server/lib/rateLimit";
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

// Per IP, in the shared Redis (R1-05), under names of its own, so translate and chat never share
// a budget: the burst limit it always had (10 a minute), then a daily cap. A Hindi reader's
// article page sends one batch per page, so the cap is a few hundred pages a day. The daily
// window is the UTC day (it resets at 05:30 IST).
const TRANSLATE_RATE_LIMITS: readonly RateLimitRule[] = [
  { name: "translate", limit: 10, windowSeconds: 60 },
  { name: "translate-day", limit: 300, windowSeconds: 24 * 60 * 60 },
];

/**
 * Translates a batch of strings via the free Google Translate endpoint.
 * Body: { texts: string[], target: "hi" | "en" }. Returns
 * { translated: string[] } in the same order as the input. Rate-limited
 * per IP by TRANSLATE_RATE_LIMITS, a budget separate from /api/chat's.
 */
export async function POST(request: NextRequest) {
  try {
    const rate = await checkRateLimits(getClientIp(request), TRANSLATE_RATE_LIMITS);
    if (rate.limited) {
      return NextResponse.json(
        { error: "Too many translation requests. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }

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
