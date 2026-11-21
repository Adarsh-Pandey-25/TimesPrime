import { cache } from "react";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Header from "@/components/news/Header";
import Footer from "@/components/news/Footer";
import StoryArticle from "@timesprime/ui/StoryArticle";
import { publicCorrections } from "@timesprime/server/repositories/corrections";
import { getPublishedStory } from "@timesprime/server/repositories/stories";
import { bylinePhotos, publishedImages } from "@timesprime/server/services/desk/storyImages";
import { liveFeed } from "@timesprime/server/services/front/live";
import { reportFallback } from "@timesprime/server/lib/reportFallback";
import { getTopHeadlines } from "@timesprime/server/services/news/topHeadlines";
import { isSection } from "@timesprime/shared/config/sections";
import type { LiveFeed } from "@timesprime/shared/config/liveBlog";
import { SITE_URL } from "@timesprime/shared/config/site";
import { jsonLdText, liveBlogPosting } from "@timesprime/shared/lib/structuredData";
import { deskStoryIdFrom, deskStoryPath } from "@timesprime/shared/lib/storyUrl";
import type { Article, PublishedStory } from "@timesprime/shared/types";
import LiveBlogFeed from "@/components/live/LiveBlogFeed";

/**
 * A Desk story's page (Panel 2 design §6), for the English route, [section]/[story], and the Hindi
 * one, hi/[section]/[story]. It shows the published revision only. An unknown story, one that is not
 * published, and one under embargo are a real 404: no loading file streams these routes first
 * (gotcha 3.34). An address with another slug, section or language than the story's own answers 308
 * there, so a mistyped or old link still arrives.
 */

export type StoryPageLanguage = "en" | "hi";

export interface StoryPageProps {
  params: Promise<{ section: string; story: string }>;
}

interface Resolved {
  story: PublishedStory | null;
  /** The story's own address, when the request used another one. */
  redirectTo: string | null;
}

/** Cached per request, so the metadata and the page share one database read. */
const resolveStory = cache(async (language: StoryPageLanguage, section: string, segment: string): Promise<Resolved> => {
  const publicId = isSection(section) ? deskStoryIdFrom(segment) : null;
  const story = publicId === null ? null : await getPublishedStory(publicId);
  if (!story) return { story: null, redirectTo: null };
  const path = deskStoryPath(story);
  const requested = `${language === "hi" ? "/hi" : ""}/${section}/${segment}`;
  return { story, redirectTo: path === requested ? null : path };
});

export async function storyMetadata(language: StoryPageLanguage, { params }: StoryPageProps): Promise<Metadata> {
  const { section, story: segment } = await params;
  const { story } = await resolveStory(language, section, segment);
  if (!story) return { title: "Story not found" };
  const path = deskStoryPath(story);
  // The root layout's title.template adds " | TimesPrime News"; openGraph.title keeps it whole.
  const title = story.revision.seo_title || story.revision.headline;
  const description = story.revision.seo_description || story.revision.dek || undefined;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      title: `${title} | TimesPrime News`,
      description,
      url: `${SITE_URL}${path}`,
      locale: story.language === "hi" ? "hi_IN" : "en_IN",
      publishedTime: story.first_published_at ?? undefined,
      modifiedTime: story.published_at ?? undefined,
    },
  };
}

// The menu's headlines come from the feed's read path directly, as on the article page (BL-016).
async function menuHeadlines(): Promise<Article[]> {
  try {
    const { body, status } = await getTopHeadlines(new URLSearchParams());
    return status === 200 ? body.results || [] : [];
  } catch {
    return [];
  }
}

/** A live blog's feed (Panel 3, M3), or an empty one when it cannot be read: the intro still shows. */
async function readLiveFeed(story: PublishedStory): Promise<LiveFeed> {
  try {
    return await liveFeed(story);
  } catch (err) {
    console.error("Live feed read failed:", err);
    reportFallback("live_feed_unavailable", { story: story.public_id });
    return { endedAt: story.live_ended_at ?? null, updates: [] };
  }
}

/**
 * Every correction of the story, oldest first (Panel 7, M2). A story with no correction note has none,
 * so it is not read. Without compliance-2, or when the read fails, the page shows the one note.
 */
async function readCorrections(story: PublishedStory): Promise<PublishedStory["corrections"]> {
  if (!story.correction_note) return undefined;
  try {
    const list = await publicCorrections({ storyId: story.id, limit: 100 });
    return list ? list.map(({ id, kind, text, published_at }) => ({ id, kind, text, published_at })).reverse() : undefined;
  } catch (err) {
    console.error("Corrections read failed:", err);
    reportFallback("corrections_unavailable", { story: story.public_id });
    return undefined;
  }
}

export async function renderStoryPage(language: StoryPageLanguage, { params }: StoryPageProps) {
  const { section, story: segment } = await params;
  const [{ story, redirectTo }, headlines] = await Promise.all([resolveStory(language, section, segment), menuHeadlines()]);
  if (!story) notFound();
  if (redirectTo) permanentRedirect(redirectTo);
  // The published revision's images and the authors' photos, with their renditions (design §7,
  // desk-8): only what readers may see.
  const live = story.format === "live_blog";
  const [images, photos, feed, corrections] = await Promise.all([
    publishedImages(story),
    bylinePhotos(story),
    live ? readLiveFeed(story) : Promise.resolve(null),
    readCorrections(story),
  ]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#1a1c1e] text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <Header articles={headlines} activeCategory={story.section} />
      <main className="flex-1">
        <StoryArticle story={{ ...story, images, photos, corrections }} />
        {/* A live blog's updates, under its intro (Panel 3, M3), and its search-engine markup. */}
        {feed && (
          <>
            <LiveBlogFeed publicId={story.public_id} language={story.language} feed={feed} />
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: jsonLdText(
                  liveBlogPosting(
                    {
                      headline: story.revision.headline,
                      dek: story.revision.dek,
                      language: story.language,
                      path: deskStoryPath(story),
                      firstPublishedAt: story.first_published_at,
                      publishedAt: story.published_at,
                    },
                    feed
                  )
                ),
              }}
            />
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
