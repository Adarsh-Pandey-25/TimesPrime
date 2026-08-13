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

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
}
