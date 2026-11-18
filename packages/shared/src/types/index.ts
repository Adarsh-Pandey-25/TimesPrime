/**
 * A Desk story as a reader sees it (Panel 2 design §6): only what is live. The revision is the
 * published one, never a draft; the fields are those the database grants readers (desk-1
 * migration), so no staff ids or desk flags.
 */
export interface PublishedStory {
  id: string;
  public_id: number;
  language: "en" | "hi";
  section: string;
  format: string;
  slug: string | null;
  correction_note: string | null;
  first_published_at: string | null;
  published_at: string | null;
  revision: {
    id: string;
    headline: string;
    dek: string | null;
    seo_title: string | null;
    seo_description: string | null;
    body: unknown;
  };
  bylines: Array<{ name: string; role: "byline" | "additional_reporting" | "translated_by"; photoId?: string | null }>;
  /** The library's images the body uses, by id, as the page draws them (Panel 2 design §7). */
  images?: Record<string, StoryImageData>;
  /** The authors' photos, by image id: their square crop, beside the byline (desk-8). */
  photos?: Record<string, StoryImageData>;
}

/** One crop of an image, as a page draws it: AVIF and WebP sources, and the WebP it falls back to. */
export interface StoryImageCrop {
  avif: string;
  webp: string;
  src: string;
  width: number;
  height: number;
}

/**
 * An image of a story, in the story's language: its alt text, caption and credit, and its
 * renditions by crop. While it has none (the Desk's preview only), the original through the back
 * office stands in. Readers only ever get renditions.
 */
export interface StoryImageData {
  alt: string;
  caption: string | null;
  credit: string | null;
  crops: Partial<Record<"16x9" | "4x3" | "1x1", StoryImageCrop>>;
  fallbackUrl?: string;
}

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
 * key held now, in some scope, to "act", "read", or "ask" (the matrix's A: the person may ask, and
 * a second person decides) (keys: packages/shared/src/config/permissions.ts).
 */
export type AdminMe =
  | {
      kind: "staff";
      displayName: string;
      aal: "aal1" | "aal2";
      roles: Array<{ role: string; language: string | null; section: string | null; expiresAt: string }>;
      permissions: Record<string, "act" | "read" | "ask">;
      /** required: this account needs aal2; enrolled: a TOTP factor is set up. */
      mfa: { required: boolean; enrolled: boolean };
    }
  | {
      kind: "legacy";
      displayName: string;
      /** When the shared password stops working (ISO). */
      retiresAt: string;
      permissions: Record<string, "act" | "read" | "ask">;
    };

export interface AdminLog {
  id: string;
  action: AdminAction;
  details: string;
  metadata: Record<string, unknown>;
  created_at: string;
}
