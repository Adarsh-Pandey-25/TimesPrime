import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/backend/lib/rateLimit";
import { scrapeArticle } from "@/backend/services/scrape/scrapeArticle";

/**
 * GET /api/news/scrape-article?url=… — the public scraper. The scraping
 * itself lives in backend/services/scrape/scrapeArticle.ts, which the
 * article page calls directly (BL-016); this route serves external callers.
 */

// F-011, owner decision D1: per client IP, counting only scrapes that reach
// a publisher (a cached answer costs nothing). Since BL-016 the article page
// no longer comes through here, so the limit sees real clients, not the
// server's own address (BL-021).
const SCRAPE_RATE_LIMIT = { name: "scrape", limit: 30, windowSeconds: 60 };

export async function GET(request: NextRequest) {
  const targetUrl = new URL(request.url).searchParams.get("url");
  if (!targetUrl) {
    return NextResponse.json({ error: "Missing required query parameter: url" }, { status: 400 });
  }

  const result = await scrapeArticle(targetUrl, {
    fallbackUrl: request.url,
    beforeFetch: async () => {
      const rate = await checkRateLimit(getClientIp(request), SCRAPE_RATE_LIMIT);
      if (!rate.limited) return null;
      return {
        status: 429,
        body: { error: `Too many scrape requests. Try again in ${rate.retryAfterSeconds} seconds.` },
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      };
    },
  });

  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
