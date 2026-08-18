import { NextResponse } from "next/server";
import { saveArticlesToDB } from "@/lib/db";
import { paraphraseTitle, paraphraseText } from "@/lib/paraphraser";

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
        const articles = (data.results || []).map((art: any) => ({
          article_id: art.article_id || art.link,
          title: paraphraseTitle(art.title || "Untitled News"),
          link: art.link || "#",
          description: paraphraseText(art.description || ""),
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

    return NextResponse.json({
      status: "success",
      message: `Full news categories successfully synchronized to Supabase!`,
      totalArticlesProcessed: totalSaved,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    });
  } catch (err: any) {
    return NextResponse.json(
      { status: "error", message: err.message },
      { status: 500 }
    );
  }
}
