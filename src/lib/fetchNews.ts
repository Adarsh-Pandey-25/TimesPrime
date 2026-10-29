import * as Sentry from "@sentry/nextjs";
import { Article, NewsDataRawArticle } from "@/types";
import { paraphraseTitle, paraphraseText } from "@/lib/paraphraser";
import {
  mapCategory,
  MOCK_ARTICLES,
  filterArticlesByLanguageScript,
  dedupeArticlesByTitle,
  isHoroscopeOrRitualFiller,
  isFromWireSpamSource,
  isFromNonNewsListingSource,
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

    // Mirrors the same country resolution used to build targetUrl below —
    // NewsData.io's country param becomes "in" whenever language is Hindi
    // or the category is India, but the article-mapping fallback used to
    // always default to the hardcoded "us" regardless, so an India article
    // missing its own `country` field silently got tagged "us" and vanished
    // from every India-scoped Supabase query afterward.
    const effectiveCountry = language === "hi" || categoryParam === "india" ? "in" : "us";

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

    // Category/country and the search query are independent NewsData.io
    // params, not alternatives — same fix and same reasoning as
    // top-headlines/route.ts's identical block: q, category, and country
    // all combine in one request per NewsData.io's docs, so a query
    // shouldn't replace category scoping.
    if (categoryParam === "india") {
      targetUrl.searchParams.set("country", "in");
      targetUrl.searchParams.set("category", "top");
    } else if (categoryParam === "world") {
      targetUrl.searchParams.set("category", "world");
    } else if (mappedCategory) {
      targetUrl.searchParams.set("category", mappedCategory);
    }
    if (query.trim()) {
      targetUrl.searchParams.set("q", query.trim());
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

    const fetchedArticles: Article[] = (data.results || []).map((art: NewsDataRawArticle) => ({
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
      country: art.country || [effectiveCountry],
      language: art.language || language,
    }));

    // Deliberately no "fall back to fetchedArticles" branch here — that used
    // to silently reintroduce wrong-language titles whenever NewsData.io's
    // own language tag was wrong and the script filter correctly produced
    // zero matches (e.g. a Hindi-scripted headline leaking into an English
    // SSR page load). MOCK_ARTICLES below is the correct empty-state
    // fallback, not the raw unfiltered upstream response.
    const scriptFiltered = filterArticlesByLanguageScript(fetchedArticles, language);
    // Horoscope/tarot filler isn't real news, but NewsData.io tags it under
    // real categories (business, world, technology, etc. — verified, not
    // just one) rather than keeping it separate. Confirmed wire-spam
    // accounts get the same treatment — see isFromWireSpamSource.
    const filtered = scriptFiltered.filter(
      (art) =>
        !isHoroscopeOrRitualFiller(art) &&
        !isFromWireSpamSource(art.source_id) &&
        !isFromNonNewsListingSource(art.source_id)
    );
    const deduped = dedupeArticlesByTitle(filtered);

    return deduped.length > 0 ? deduped : MOCK_ARTICLES;
  } catch (error) {
    console.error("Server-side news fetch error:", error);
    Sentry.captureException(error, { tags: { source: "newsdata" }, extra: { category, language } });
    return MOCK_ARTICLES;
  }
}
