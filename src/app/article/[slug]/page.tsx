import { Metadata } from "next";
import Header from "@/components/news/Header";
import Footer from "@/components/news/Footer";
import ArticleDetailView from "@/components/article/ArticleDetailView";
import { Article } from "@/types";
import { findKnownArticle } from "@/server/services/news";
import { getTopHeadlines } from "@/server/services/news/topHeadlines";
import { scrapeArticle } from "@/server/services/scrape/scrapeArticle";
import { safePublisherHref } from "@/lib/urlValidation";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ url?: string; image?: string }>;
}

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://timesprimenews.com";

/**
 * The page's `?url=`, if it names an article this app serves; otherwise
 * undefined, and the page behaves as if no URL was given (F-005). Anyone can
 * put any URL in the query string: trusted, it became a branded link out, a
 * scraper target and the page's title. Exact match against the stored
 * articles (and the built-in mocks): the app's links carry the stored value.
 */
async function verifiedTargetUrl(url: string | undefined): Promise<string | undefined> {
  const known = await findKnownArticle(url);
  return known && safePublisherHref(known.link) ? known.link : undefined;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const title = decodeURIComponent(resolvedParams.slug || "Article View");

  return {
    // The root layout's title.template adds " | TimesPrime News" (F-022: it
    // was added here too, so the tab read "… | TimesPrime News | TimesPrime
    // News"). The template does not apply to openGraph.title, which keeps it.
    title,
    description: `Read full coverage and AI-synthesized analysis on ${title}.`,
    openGraph: {
      title: `${title} | TimesPrime News`,
      description: `Read full story on TimesPrime News.`,
      // The page's own address: the query string's url is the caller's, not ours (F-005).
      url: `${SITE_URL}/article/${encodeURIComponent(resolvedParams.slug || "")}`,
    },
  };
}

async function getArticleContent(targetUrl?: string) {
  if (!targetUrl) {
    return {
      title: "Story Overview",
      content: [],
    };
  }

  // The backend directly, not this app's own HTTP route (BL-016): over HTTP
  // every reader reached the route from the server's address, and so shared
  // one rate-limit bucket (BL-021). targetUrl is already a known article
  // (F-005); the scrape cache is still checked first.
  try {
    const { status, body } = await scrapeArticle(targetUrl);
    if (status !== 200 || "error" in body) throw new Error("Scrape request failed");
    return body;
  } catch {
    return {
      title: "Full Story Coverage",
      content: [],
    };
  }
}

// The feed's read path directly, not this app's own HTTP route: over HTTP the
// page depended on NEXT_PUBLIC_BASE_URL and silently got nothing without it.
async function getSuggestedArticles(): Promise<Article[]> {
  try {
    const { body, status } = await getTopHeadlines(new URLSearchParams());
    return status === 200 ? body.results || [] : [];
  } catch {
    return [];
  }
}

export default async function ArticlePage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  const rawSlug = decodeURIComponent(resolvedParams.slug || "Article View");
  const targetUrl = await verifiedTargetUrl(resolvedSearchParams.url);
  const imageUrl = resolvedSearchParams.image;

  // Execute both data fetches in parallel (Parallel Fast Loading)
  const [scrapedData, allArticles] = await Promise.all([
    getArticleContent(targetUrl),
    getSuggestedArticles(),
  ]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#1a1c1e] text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <Header articles={allArticles} />

      <main className="flex-1">
        <ArticleDetailView
          slug={rawSlug}
          targetUrl={targetUrl}
          imageUrl={imageUrl}
          scrapedData={scrapedData}
          allArticles={allArticles}
        />
      </main>

      <Footer />
    </div>
  );
}
