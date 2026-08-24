import * as Sentry from "@sentry/nextjs";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export type AdminAction =
  | "article_deleted"
  | "articles_bulk_deleted"
  | "article_edited"
  | "article_published"
  | "breaking_news_set"
  | "breaking_news_removed"
  | "news_synced"
  | "database_purged"
  | "categories_seeded";

export interface AdminLog {
  id: string;
  action: AdminAction;
  details: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export const ACTION_LABELS: Record<AdminAction, string> = {
  article_deleted: "Article Deleted",
  articles_bulk_deleted: "Bulk Delete",
  article_edited: "Article Edited",
  article_published: "Article Published",
  breaking_news_set: "Breaking News Set",
  breaking_news_removed: "Breaking News Removed",
  news_synced: "News Synced",
  database_purged: "Database Purged",
  categories_seeded: "Categories Seeded",
};

export const ACTION_ICONS: Record<AdminAction, string> = {
  article_deleted: "🗑",
  articles_bulk_deleted: "🗑🗑",
  article_edited: "✏️",
  article_published: "📝",
  breaking_news_set: "🔴",
  breaking_news_removed: "⭕",
  news_synced: "🔄",
  database_purged: "🧹",
  categories_seeded: "🌱",
};

/**
 * Records an admin action to the admin_logs table for the Activity Log.
 * Deliberately swallows every failure (missing table, network error,
 * misconfiguration) — logging is observability, not a critical path, and
 * must never be the reason a real admin action (delete/edit/publish/etc.)
 * fails or throws. Callers should still `await` this so it actually
 * completes before a serverless function's response is sent, rather than
 * risking the invocation being frozen mid-write.
 */
export async function logAdminAction(
  action: AdminAction,
  details: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    if (!isSupabaseConfigured()) return;

    const { error } = await supabase.from("admin_logs").insert([{ action, details, metadata }]);

    if (error) {
      console.error("Admin log insert error:", error.message);
      Sentry.captureMessage(`Admin log insert error: ${error.message}`, {
        tags: { source: "supabase" },
        extra: { operation: "logAdminAction", action },
      });
    }
  } catch (err) {
    console.error("Admin log insert error:", err);
    Sentry.captureException(err, {
      tags: { source: "supabase" },
      extra: { operation: "logAdminAction", action },
    });
  }
}
