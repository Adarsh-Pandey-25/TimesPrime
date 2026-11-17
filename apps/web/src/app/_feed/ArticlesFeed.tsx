import { Suspense } from "react";
import { getTopHeadlines } from "@timesprime/server/services/news/topHeadlines";
import HomeClient from "@/components/home/HomeClient";
import NewsSkeletonGrid from "@/components/ui/NewsSkeletonGrid";

async function Feed({ category, search }: { category: string; search: string }) {
  // The database, like every reader path (R1-12): the server render never calls NewsData.
  const { body } = await getTopHeadlines(new URLSearchParams({ category, language: "en", q: search }));
  // Keyed by category (R2): moving between sections, which share one route, starts the feed afresh
  // from the server's stories instead of keeping the last section's.
  return <HomeClient key={category} initialArticles={body.results ?? []} initialCategory={category} initialSearch={search} />;
}

/** The feed of the home page and of every section page (R2), server-rendered from the database. */
export default function ArticlesFeed({ category, search }: { category: string; search: string }) {
  return (
    <Suspense fallback={<NewsSkeletonGrid />}>
      <Feed category={category} search={search} />
    </Suspense>
  );
}
