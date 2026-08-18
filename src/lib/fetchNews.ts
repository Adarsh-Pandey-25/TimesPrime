import * as Sentry from "@sentry/nextjs";
import { Article } from "@/types";
import { paraphraseTitle, paraphraseText } from "@/lib/paraphraser";
import {
  mapCategory,
  MOCK_ARTICLES,
  filterArticlesByLanguageScript,
  dedupeArticlesByTitle,
} from "@/lib/newsConfig";

/**
 * Server-side news fetching function.
 * Called directly on the server — no client-side fetch needed.
 * Works reliably via ngrok, Vercel, or any deployment.
 */
export async function fetchInitialNews(
  category: string = "general",
  language: string = "en",
  query: string = ""
): Promise<Article[]> {
  try {
    const apiKey = process.env.NEWSDATA_API_KEY;

    const categoryParam = category;
    const mappedCategory = mapCategory(categoryParam);

    if (!apiKey) {
      console.error(
        "NEWSDATA_API_KEY is not set — falling back to mock articles. Add it to .env.local."
      );
      return MOCK_ARTICLES;
    }

    const targetUrl = new URL("https://newsdata.io/api/1/latest");
    targetUrl.searchParams.set("apikey", apiKey);

    if (language === "hi") {
      targetUrl.searchParams.set("country", "in");
      targetUrl.searchParams.set("language", "hi");
    } else {
      targetUrl.searchParams.set("country", "us");
      targetUrl.searchParams.set("language", "en");
    }

    if (query.trim()) {
      targetUrl.searchParams.set("q", query.trim());
    } else if (categoryParam === "india") {
      targetUrl.searchParams.set("country", "in");
      targetUrl.searchParams.set("category", "top");
    } else if (categoryParam === "world") {
      targetUrl.searchParams.set("category", "world");
    } else if (mappedCategory) {
      targetUrl.searchParams.set("category", mappedCategory);
    }

    const apiRes = await fetch(targetUrl.toString(), {
      next: { revalidate: 900 },
    });

    if (!apiRes.ok) {
      console.error(`NewsData API error: status ${apiRes.status}`);
      Sentry.captureMessage(`NewsData API error: status ${apiRes.status}`, {
        tags: { source: "newsdata" },
        extra: { category, language, status: apiRes.status },
      });
      return MOCK_ARTICLES;
    }

    const data = await apiRes.json();

    const fetchedArticles: Article[] = (data.results || []).map((art: any) => ({
      article_id: art.article_id || art.link,
      title: paraphraseTitle(art.title || "Untitled Article"),
      link: art.link || "#",
      description: paraphraseText(art.description || ""),
      content: art.content || "",
      pubDate: art.pubDate || new Date().toISOString(),
      image_url: art.image_url || art.source_icon || null,
      source_id: art.source_id || "",
      source_name: art.source_name || art.source_id || "News Source",
      category: art.category || [mappedCategory],
      country: art.country || ["us"],
      language: art.language || language,
    }));

    const filtered = filterArticlesByLanguageScript(fetchedArticles, language);
    const deduped = dedupeArticlesByTitle(filtered.length > 0 ? filtered : fetchedArticles);

    return deduped.length > 0 ? deduped : MOCK_ARTICLES;
  } catch (error) {
    console.error("Server-side news fetch error:", error);
    Sentry.captureException(error, { tags: { source: "newsdata" }, extra: { category, language } });
    return MOCK_ARTICLES;
  }
}
