import "server-only";

import * as Sentry from "@sentry/nextjs";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";

// The breaking_news table and its RLS policies: database/schema.sql and database/policies.sql (F-008).

export interface BreakingNewsItem {
  id: string;
  text: string;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

export interface BreakingNewsResult {
  status: number;
  body: { items: BreakingNewsItem[] } | { error: string };
}

/**
 * Active, unexpired breaking news items, newest first. Read by the reader site's banner
 * (GET /api/news/breaking-news, public) and by the admin's banner manager.
 */
export async function listActiveBreakingNews(): Promise<BreakingNewsResult> {
  try {
    if (!isSupabaseConfigured()) {
      return { status: 503, body: { error: "Supabase is not configured on the server." } };
    }

    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("breaking_news")
      .select("id, text, is_active, expires_at, created_at")
      .eq("is_active", true)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Breaking news list error:", error.message);
      Sentry.captureMessage(`Breaking news list error: ${error.message}`, {
        tags: { source: "supabase" },
        extra: { operation: "listBreakingNews" },
      });
      return { status: 500, body: { error: error.message } };
    }

    return { status: 200, body: { items: (data ?? []) as BreakingNewsItem[] } };
  } catch (err) {
    console.error("Breaking news list error:", err);
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "listBreakingNews" } });
    return { status: 500, body: { error: err instanceof Error ? err.message : "Failed to fetch breaking news." } };
  }
}
