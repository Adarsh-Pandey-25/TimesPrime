import { cache } from "react";
import { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Header from "@/components/news/Header";
import Footer from "@/components/news/Footer";
import ArticleDetailView from "@/components/article/ArticleDetailView";
import { Article } from "@timesprime/shared/types";
import { findKnownArticle, findKnownArticleById } from "@timesprime/server/services/news";
import { getTopHeadlines } from "@timesprime/server/services/news/topHeadlines";
import { safePublisherHref } from "@timesprime/shared/lib/urlValidation";
import { SITE_URL } from "@timesprime/shared/config/site";
import { storyIdFrom, storyPath, storySegment } from "@timesprime/shared/lib/storyUrl";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ url?: string }>;
}

interface Resolved {
  story: Article | null;
  /** The story's current address, when this request used another one. */
  redirectTo: string | null;
}

/**
 * The outside story this page shows (B-05, Phase B), only ever a stored row with a safe http(s)
 * publisher link (F-005). Cached per request, so the metadata and the page share one lookup.
 *
 * R2's addresses, /article/{headline-slug}-{article_id} (storyUrl.ts), find it by the id, and an
 * out-of-date slug redirects to the current one. An old address, /article/<anything>?url=<link>,
 * finds it by the link and redirects to its new address; a story whose id the new scheme cannot
 * carry is shown at the old address. Anything else is not found: a real 404, since no loading
 * file streams this route first (BL-042).
 */
const resolveStory = cache(async (slug: string, url: string | undefined): Promise<Resolved> => {
  const found = url !== undefined ? await findKnownArticle(url) : await findKnownArticleById(storyIdFrom(slug));
  const story = found && safePublisherHref(found.link) ? found : null;
  if (!story) return { story: null, redirectTo: null };
  const segment = storySegment(story);
  const current = url === undefined && segment === slug;
  return { story, redirectTo: segment && !current ? `/article/${segment}` : null };
});

/**
 * An outside story's page: its headline, NewsData's short summary, the source, the time and a link
 * to the full story on the publisher's site. Never the publisher's text or a translation of it. The
 * page carries noindex (owner's senior, 16 Nov 2026): it is a pointer to someone else's journalism,
 * not ours, and stays out of search engines and the sitemap. Links still count (follow).
 */
export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const [{ slug }, { url }] = await Promise.all([params, searchParams]);
  const { story } = await resolveStory(slug, url);
  const title = story?.title || "Story not found";
  const description = story?.description || "A news story on TimesPrime, with a link to the full story at its source.";

  return {
    // The root layout's title.template adds " | TimesPrime News" (F-022). It does not apply to
    // openGraph.title, which keeps it.
    title,
    description,
    robots: { index: false, follow: true },
    // Its own address (R2): the story's current URL, never the caller's query string (F-005).
    alternates: story ? { canonical: storyPath(story) } : undefined,
    openGraph: {
      title: `${title} | TimesPrime News`,
      description,
      url: story ? `${SITE_URL}${storyPath(story)}` : undefined,
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

export default async function ArticlePage({ params, searchParams }: PageProps) {
  const [{ slug }, { url }] = await Promise.all([params, searchParams]);
  const [{ story, redirectTo }, allArticles] = await Promise.all([resolveStory(slug, url), getSuggestedArticles()]);
  // A story we never stored, or one the 7-day purge removed: the not-found page, with a 404.
  if (!story) notFound();
  // 308: an old address, or a headline that has changed since the link was made.
  if (redirectTo) permanentRedirect(redirectTo);

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
