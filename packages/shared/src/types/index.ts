export interface Article {
  article_id: string;
  title: string;
  link: string;
  keywords?: string[] | null;
  creator?: string[] | null;
  video_url?: string | null;
  description?: string | null;
  content?: string | null;
  pubDate: string;
  image_url?: string | null;
  source_id?: string;
  source_priority?: number;
  source_name?: string;
  source_url?: string;
  source_icon?: string | null;
  language?: string;
  country?: string[];
  category?: string[];
  ai_tag?: string;
  sentiment?: string;
  sentiment_stats?: string;
  duplicate?: boolean;
}

/**
 * The scraper's answer for an article it read (status 200), from
 * scrapeArticle() and GET /api/news/scrape-article. `content` is empty when
 * nothing could be extracted or the page is paywalled; it never holds
 * placeholder prose. Any failure is a non-200 status with a
 * ScrapeErrorResponse instead (F-017).
 */
export interface ScrapeResponse {
  url: string;
  title?: string;
  content: string[];
  text: string;
  isPaywalled: boolean;
  description?: string;
  image?: string;
  cached?: boolean;
}

/** The scraper's body for any non-200 status (F-017). */
export interface ScrapeErrorResponse {
  error: string;
}

/**
 * One raw result row from NewsData.io's /api/1/latest response, before it is
 * normalized into `Article`. Field set is exactly what the mapping code in
 * fetchNews.ts, newsdata.ts, top-headlines/route.ts and seed-supabase/route.ts
 * actually reads — not NewsData.io's full documented schema.
 *
 * `article_id` and `link` are modelled as required because every mapping
 * site uses `art.article_id || art.link` to produce the required
 * `Article.article_id`; if upstream ever omits both, that is a data bug to
 * surface, not a type to widen.
 */
export interface NewsDataRawArticle {
  article_id: string;
  link: string;
  title?: string;
  description?: string;
  content?: string;
  pubDate?: string;
  image_url?: string | null;
  source_icon?: string | null;
  source_id?: string;
  source_name?: string;
  category?: string[];
  country?: string[];
  language?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
}

/**
 * An admin action recorded in admin_logs. Shared by the server-side writer
 * (logAdminAction) and the admin activity log UI, so it lives in the bottom
 * layer that both import from.
 */
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

/**
 * GET /api/admin/me (Panel 0): who is signed in and what they hold, so the admin UI can hide what
 * they lack. UX only: every route checks again on the server. `permissions` maps each permission
 * key held now, in some scope, to "act" or "read" (keys: packages/shared/src/config/permissions.ts).
 */
export type AdminMe =
  | {
      kind: "staff";
      displayName: string;
      aal: "aal1" | "aal2";
      roles: Array<{ role: string; language: string | null; section: string | null; expiresAt: string }>;
      permissions: Record<string, "act" | "read">;
      /** required: this account needs aal2; enrolled: a TOTP factor is set up. */
      mfa: { required: boolean; enrolled: boolean };
    }
  | {
      kind: "legacy";
      displayName: string;
      /** When the shared password stops working (ISO). */
      retiresAt: string;
      permissions: Record<string, "act" | "read">;
    };

export interface AdminLog {
  id: string;
  action: AdminAction;
  details: string;
  metadata: Record<string, unknown>;
  created_at: string;
}
