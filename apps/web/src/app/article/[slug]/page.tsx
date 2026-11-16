import { cache } from "react";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import Header from "@/components/news/Header";
import Footer from "@/components/news/Footer";
import ArticleDetailView from "@/components/article/ArticleDetailView";
import { Article } from "@timesprime/shared/types";
import { findKnownArticle } from "@timesprime/server/services/news";
import { getTopHeadlines } from "@timesprime/server/services/news/topHeadlines";
import { safePublisherHref } from "@timesprime/shared/lib/urlValidation";
import { SITE_URL } from "@timesprime/shared/config/site";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ url?: string }>;
}

/**
 * The outside story this page shows (B-05, Phase B): the stored row whose link is exactly the
 * page's `?url=` and is a safe http(s) publisher link (F-005), or null. Anyone can put any URL in
 * the query string; only a story we stored is shown. Cached per request, so the metadata and the
 * page share one lookup.
 */
const storyFor = cache(async (url: string | undefined): Promise<Article | null> => {
  const story = await findKnownArticle(url);
  return story && safePublisherHref(story.link) ? story : null;
});

/**
 * An outside story's page: its headline, NewsData's short summary, the source, the time and a link
 * to the full story on the publisher's site. Never the publisher's text or a translation of it. The
 * page carries noindex (owner's senior, 16 Nov 2026): it is a pointer to someone else's journalism,
 * not ours, and stays out of search engines and the sitemap. Links still count (follow).
 */
export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const [{ slug }, { url }] = await Promise.all([params, searchParams]);
  const story = await storyFor(url);
  const title = story?.title || "Story not found";
  const description = story?.description || "A news story on TimesPrime, with a link to the full story at its source.";

  return {
    // The root layout's title.template adds " | TimesPrime News" (F-022). It does not apply to
    // openGraph.title, which keeps it.
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: {
      title: `${title} | TimesPrime News`,
      description,
      // The page's own address: the query string's url is the caller's, not ours (F-005).
      url: `${SITE_URL}/article/${encodeURIComponent(slug || "")}`,
    },
  };
}

// The feed's read path directly, not this app's own HTTP route (BL-016).
async function getSuggestedArticles(): Promise<Article[]> {
  try {
    const { body, status } = await getTopHeadlines(new URLSearchParams());
    return status === 200 ? body.results || [] : [];
  } catch {
    return [];
  }
}

export default async function ArticlePage({ searchParams }: PageProps) {
  const { url } = await searchParams;
  const [story, allArticles] = await Promise.all([storyFor(url), getSuggestedArticles()]);
  // A link we never stored, or one the 7-day purge removed: the not-found page, not a guess.
  if (!story) notFound();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#1a1c1e] text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <Header articles={allArticles} />

      <main className="flex-1">
        <ArticleDetailView story={story} allArticles={allArticles} />
      </main>

      <Footer />
    </div>
  );
}
