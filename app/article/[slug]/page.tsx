import { Metadata } from "next";
import { Header, Footer } from "@/frontend/features/news";
import ArticleDetailView from "@/frontend/views/article/ArticleDetailView";
import { Article } from "@/shared/types";
import { findKnownArticle } from "@/backend/services/news";
import { scrapeArticle } from "@/backend/services/scrape/scrapeArticle";
import { safePublisherHref } from "@/shared/validation/urlValidation";

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
    title: `${title} | TimesPrime News`,
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

async function getSuggestedArticles(): Promise<Article[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/news/top-headlines?pageSize=8`, {
      headers: { "ngrok-skip-browser-warning": "true" },
      next: { revalidate: 900 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
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
