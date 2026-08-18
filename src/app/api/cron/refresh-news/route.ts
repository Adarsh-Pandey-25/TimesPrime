import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { saveArticlesToDB } from "@/lib/db";
import { fetchNewsDataArticles } from "@/lib/newsdata";

/**
 * Background refresh: pulls every category from NewsData.io into Supabase.
 *
 * Scheduled by vercel.json (*\/30 * * * *). Vercel sends
 * `Authorization: Bearer $CRON_SECRET` automatically when CRON_SECRET is
 * set in the project's environment variables.
 *
 * With this running, user requests are served from Supabase (see
 * top-headlines/route.ts) instead of hitting NewsData.io per visitor.
 */

// The 7 categories the UI exposes as primary feeds.
const REFRESH_CATEGORIES = [
  "general",
  "india",
  "world",
  "tech",
  "business",
  "sports",
  "entertainment",
] as const;

interface RefreshDetail {
  category: string;
  ok: boolean;
  fetched: number;
  saved: number;
  error?: string;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  // Fail closed — an unprotected refresh endpoint is a free way for anyone
  // to burn the NewsData.io quota.
  if (!cronSecret) {
    return NextResponse.json(
      { error: "Cron is not configured. Set CRON_SECRET in the environment." },
      { status: 503 }
    );
  }

  const bearerToken = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (bearerToken !== cronSecret) {
    return NextResponse.json(
      { error: "Unauthorized: valid cron secret required." },
      { status: 401 }
    );
  }

  const apiKey = process.env.NEWSDATA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "NEWSDATA_API_KEY is not set — nothing to refresh." },
      { status: 503 }
    );
  }

  const details: RefreshDetail[] = [];
  let refreshed = 0;
  let failed = 0;

  // Sequential on purpose: NewsData.io rate-limits bursts, and 7 parallel
  // requests is the fastest way to get the whole run throttled.
  for (const category of REFRESH_CATEGORIES) {
    try {
      const articles = await fetchNewsDataArticles(apiKey, {
        categoryParam: category,
        language: "en",
        country: category === "india" ? "in" : "us",
      });

      const saved = await saveArticlesToDB(articles);

      refreshed += 1;
      details.push({
        category,
        ok: true,
        fetched: articles.length,
        saved: saved.length,
      });
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);

      console.error(`Cron refresh failed for category "${category}":`, message);
      Sentry.captureException(err, {
        tags: { source: "cron" },
        extra: { operation: "refresh-news", category },
      });

      // Keep going — one bad category shouldn't abort the whole refresh.
      details.push({ category, ok: false, fetched: 0, saved: 0, error: message });
    }
  }

  return NextResponse.json({
    refreshed,
    failed,
    timestamp: new Date().toISOString(),
    details,
  });
}
