import { Article } from "@/types";
import { supabase, isSupabaseConfigured } from "./supabase";

export interface DBArticle extends Article {
  fetchedAt?: number;
  created_at?: string;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Automatically purges any article older than 7 days from Supabase.
 */
export async function purgeOldArticles(): Promise<number> {
  if (!isSupabaseConfigured()) {
    console.warn("Supabase credentials not configured in .env.local yet.");
    return 0;
  }

  try {
    const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
    const { data, error } = await supabase
      .from("articles")
      .delete()
      .lt("created_at", sevenDaysAgo)
      .select("id");

    if (error) {
      console.error("Supabase Purge Error:", error.message);
      return 0;
    }

    return data ? data.length : 0;
  } catch (err) {
    console.error("Failed to purge old articles from Supabase:", err);
    return 0;
  }
}

/**
 * Upserts new articles into Supabase table "articles" in Realtime
 * and triggers 7-day auto-purge.
 */
export async function saveArticlesToDB(incomingArticles: Article[]): Promise<DBArticle[]> {
  if (!incomingArticles || incomingArticles.length === 0) return [];

  // Run 7-day auto-purge first
  await purgeOldArticles();

  if (!isSupabaseConfigured()) {
    return incomingArticles;
  }

  try {
    const rowsToUpsert = incomingArticles.map((art) => ({
      article_id: art.article_id || art.link || art.title,
      title: art.title,
      link: art.link || "#",
      description: art.description || "",
      content: art.content || "",
      pub_date: art.pubDate || new Date().toISOString(),
      image_url: art.image_url || null,
      source_id: art.source_id || "",
      source_name: art.source_name || "News Source",
      category: art.category || ["general"],
      country: art.country || ["us"],
      language: art.language || "english",
    }));

    const { data, error } = await supabase
      .from("articles")
      .upsert(rowsToUpsert, { onConflict: "article_id" })
      .select("*");

    if (error) {
      console.error("Supabase Upsert Error:", error.message);
      return incomingArticles;
    }

    return (data || []).map((row: any) => ({
      article_id: row.article_id,
      title: row.title,
      link: row.link,
      description: row.description,
      content: row.content,
      pubDate: row.pub_date,
      image_url: row.image_url,
      source_id: row.source_id,
      source_name: row.source_name,
      category: row.category,
      country: row.country,
      language: row.language,
      created_at: row.created_at,
    }));
  } catch (err) {
    console.error("Error saving to Supabase:", err);
    return incomingArticles;
  }
}

/**
 * Retrieves articles stored in Supabase filtered by category and query.
 */
export async function getDBArticles(
  category: string = "general",
  query: string = "",
  language: string = "en"
): Promise<DBArticle[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  await purgeOldArticles();

  try {
    let queryBuilder = supabase
      .from("articles")
      .select("*")
      .order("created_at", { ascending: false });

    if (query.trim()) {
      const q = query.trim();
      queryBuilder = queryBuilder.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
    } else if (category === "india") {
      queryBuilder = queryBuilder.or(`country.cs.{"in"},category.cs.{"india"}`);
    } else if (category && category !== "general" && category !== "top") {
      queryBuilder = queryBuilder.contains("category", [category]);
    }

    const { data, error } = await queryBuilder.limit(80);

    if (error) {
      console.error("Supabase Select Error:", error.message);
      return [];
    }

    const hasHindiScript = (str?: string) => str && /[\u0900-\u097F]/.test(str);

    const filtered = (data || []).filter((row: any) => {
      const titleIsHindi = hasHindiScript(row.title);
      if (language === "hi") {
        // Hindi mode: only show articles with Hindi script in title
        return titleIsHindi;
      } else {
        // English mode: exclude any article with Hindi script in title
        return !titleIsHindi;
      }
    });

    return filtered.slice(0, 40).map((row: any) => ({
      article_id: row.article_id,
      title: row.title,
      link: row.link,
      description: row.description,
      content: row.content,
      pubDate: row.pub_date,
      image_url: row.image_url,
      source_id: row.source_id,
      source_name: row.source_name,
      category: row.category,
      country: row.country,
      language: row.language,
      created_at: row.created_at,
    }));
  } catch (err) {
    console.error("Error fetching from Supabase:", err);
    return [];
  }
}

/**
 * Returns Supabase database metrics for admin dashboard.
 */
export async function getDBStats() {
  const configured = isSupabaseConfigured();
  if (!configured) {
    return {
      configured: false,
      totalStoredArticles: 0,
      retentionDays: 7,
      databaseType: "Supabase PostgreSQL (Awaiting Credentials)",
      note: "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local",
    };
  }

  try {
    const { count, error } = await supabase
      .from("articles")
      .select("*", { count: "exact", head: true });

    return {
      configured: true,
      totalStoredArticles: count || 0,
      retentionDays: 7,
      databaseType: "Supabase Realtime PostgreSQL",
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    };
  } catch {
    return {
      configured: true,
      totalStoredArticles: 0,
      retentionDays: 7,
      databaseType: "Supabase Realtime PostgreSQL",
    };
  }
}
