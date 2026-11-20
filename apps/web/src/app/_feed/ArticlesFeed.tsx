import { Suspense } from "react";
import { reportFallback } from "@timesprime/server/lib/reportFallback";
import { pinnedStories } from "@timesprime/server/services/front/pins";
import { getTopHeadlines } from "@timesprime/server/services/news/topHeadlines";
import type { PinnedStory } from "@timesprime/shared/config/frontPage";
import { isSection } from "@timesprime/shared/config/sections";
import HomeClient from "@/components/home/HomeClient";
import NewsSkeletonGrid from "@/components/ui/NewsSkeletonGrid";

/** The page's English pins (Panel 3, M2), or none when they cannot be read: the feed still shows. */
async function englishPins(section: string | null): Promise<PinnedStory[]> {
  try {
    return await pinnedStories({ language: "en", section: section !== null && isSection(section) ? section : null });
  } catch (err) {
    console.error("Pinned stories read failed:", err);
    reportFallback("pins_unavailable", { section: section ?? "home" });
    return [];
  }
}

async function Feed({ category, search }: { category: string; search: string }) {
  const section = isSection(category) ? category : null;
  // The database, like every reader path (R1-12): the server render never calls NewsData.
  const [{ body }, pins] = await Promise.all([getTopHeadlines(new URLSearchParams({ category, language: "en", q: search })), englishPins(section)]);
  // Keyed by category (R2): moving between sections, which share one route, starts the feed afresh
  // from the server's stories instead of keeping the last section's.
  return <HomeClient key={category} initialArticles={body.results ?? []} initialCategory={category} initialSearch={search} initialPins={pins} pinSection={section} />;
}

/** The feed of the home page and of every section page (R2), server-rendered from the database. */
export default function ArticlesFeed({ category, search }: { category: string; search: string }) {
  return (
    <Suspense fallback={<NewsSkeletonGrid />}>
      <Feed category={category} search={search} />
    </Suspense>
  );
}
