import type { AdminAction } from "@/shared/types";

// Display labels and icons for the admin activity log. ActivityLog.tsx is the
// only consumer, so they live beside it rather than in a shared layer. They
// used to live in adminLogger.ts, which made a client component import a
// server module — and with it supabase.ts and the Supabase SDK (SC-1).
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
