import "server-only";

import * as Sentry from "@sentry/nextjs";
import { bannerShows, type BannerLanguage } from "@timesprime/shared/config/breakingNews";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";

// The breaking_news table and its RLS policies: database/schema.sql and database/policies.sql (F-008);
// its language: database/migrations/2026-11-19-front-1-banner-language.sql (Panel 3, M1).

export interface BreakingNewsItem {
  id: string;
  text: string;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  /** 'en', 'hi', or null for both languages. */
  language: BannerLanguage | null;
}

export interface BreakingNewsResult {
  status: number;
  body: { items: BreakingNewsItem[] } | { error: string };
}

/**
 * Active, unexpired breaking news items, newest first. Read by the reader site's banner
 * (GET /api/news/breaking-news, public), which passes the reader's language, and by the admin's
 * banner manager, which reads every language. With a language: that language's items and those
 * for both. The table is small, so the language is applied in code, not as a second `or` filter.
 */
export async function listActiveBreakingNews(language?: BannerLanguage): Promise<BreakingNewsResult> {
  try {
    if (!isSupabaseConfigured()) {
      return { status: 503, body: { error: "Supabase is not configured on the server." } };
    }

    const nowIso = new Date().toISOString();
    const read = (columns: string) =>
      supabase
        .from("breaking_news")
        .select(columns)
        .eq("is_active", true)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .order("created_at", { ascending: false });

    let { data, error } = await read("id, text, is_active, expires_at, created_at, language");
    // Until the owner applies front-1 the column does not exist (Postgres 42703): read without it,
    // and every item is for both languages, as the migration leaves them.
    if (error && (error as { code?: string }).code === "42703") {
      ({ data, error } = await read("id, text, is_active, expires_at, created_at"));
    }

    if (error) {
      console.error("Breaking news list error:", error.message);
      Sentry.captureMessage(`Breaking news list error: ${error.message}`, {
        tags: { source: "supabase" },
        extra: { operation: "listBreakingNews" },
      });
      return { status: 500, body: { error: error.message } };
    }

    // An absent language is "both languages", as front-1 leaves every existing item.
    const items = ((data ?? []) as unknown as Array<Omit<BreakingNewsItem, "language"> & { language?: BannerLanguage | null }>).map((row) => ({
      ...row,
      language: row.language ?? null,
    }));
    return { status: 200, body: { items: language ? items.filter((item) => bannerShows(item, language)) : items } };
  } catch (err) {
    console.error("Breaking news list error:", err);
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "listBreakingNews" } });
    return { status: 500, body: { error: err instanceof Error ? err.message : "Failed to fetch breaking news." } };
  }
}
