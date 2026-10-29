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

export interface NewsResponse {
  status: string;
  totalResults: number;
  results: Article[];
  nextPage?: string;
}

export interface ScrapeResponse {
  url: string;
  title?: string;
  content: string[];
  text: string;
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
