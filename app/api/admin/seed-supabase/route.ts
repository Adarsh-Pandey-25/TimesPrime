import { NextResponse } from "next/server";
import { saveArticlesToDB } from "@/features/news/server";
import { logAdminAction } from "@/server/auditLog";
import type { NewsDataRawArticle } from "@/types";

// Auth is handled upstream by proxy.ts (matcher covers /api/admin/:path*),
// so by the time a request reaches this handler it has already been validated.

const CATEGORIES = ["top", "technology", "business", "sports", "entertainment", "health", "science"];

export async function POST() {
  try {
    const apiKey = process.env.NEWSDATA_API_KEY || process.env.NEXT_PUBLIC_NEWSDATA_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { status: "error", message: "NEWSDATA_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    let totalSaved = 0;

    for (const cat of CATEGORIES) {
      try {
        const url = `https://newsdata.io/api/1/latest?apikey=${apiKey}&category=${cat}&language=en`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) continue;

        const data = await res.json();
        const articles = (data.results || []).map((art: NewsDataRawArticle) => ({
          article_id: art.article_id || art.link,
          title: art.title || "Untitled News",
          link: art.link || "#",
          description: art.description || "",
          content: art.content || art.description || "",
          pubDate: art.pubDate || new Date().toISOString(),
          image_url: art.image_url || art.source_icon || null,
          source_id: art.source_id || "",
          source_name: art.source_name || "News Source",
          category: art.category || [cat],
          country: art.country || ["us"],
          language: art.language || "english",
        }));

        const saved = await saveArticlesToDB(articles);
        totalSaved += saved.length;
      } catch (e) {
        // Continue loop for other categories
      }
    }

    await logAdminAction("categories_seeded", `Seeded all categories`, {
      categories_count: CATEGORIES.length,
      total_articles: totalSaved,
    });

    return NextResponse.json({
      status: "success",
      message: `Full news categories successfully synchronized to Supabase!`,
      totalArticlesProcessed: totalSaved,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { status: "error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
