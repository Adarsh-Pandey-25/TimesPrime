import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { translateBatch } from "@/lib/googleTranslate";
import { isRateLimited, getClientIp } from "@/lib/rateLimit";

interface TranslateRequestBody {
  texts?: unknown;
  target?: unknown;
}

/**
 * Translates a batch of strings via the free Google Translate endpoint.
 * Body: { texts: string[], target: "hi" | "en" }. Returns
 * { translated: string[] } in the same order as the input. Rate-limited
 * per IP under its own "translate:" key prefix — separate budget from
 * /api/chat, which uses the bare IP as its own rate-limit key.
 */
export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(`translate:${getClientIp(request)}`)) {
      return NextResponse.json(
        { error: "Too many translation requests. Please try again shortly." },
        { status: 429 }
      );
    }

    let body: TranslateRequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const { texts, target } = body;

    if (!Array.isArray(texts) || texts.length === 0 || !texts.every((t): t is string => typeof t === "string")) {
      return NextResponse.json({ error: "texts must be a non-empty array of strings." }, { status: 400 });
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
