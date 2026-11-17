import { Suspense } from "react";
import type { Metadata } from "next";
import { getTopHeadlines } from "@timesprime/server/services/news/topHeadlines";
import HomeClient from "@/components/home/HomeClient";
import NewsSkeletonGrid from "@/components/ui/NewsSkeletonGrid";

// The feed's category and search views (?category=, ?search=) are views of the home page, so
// they point search engines at it (R1-09). Sections get their own URLs in R2.
export const metadata: Metadata = { alternates: { canonical: "/" } };

interface HomePageProps {
  searchParams: Promise<{ category?: string; search?: string }>;
}

async function ArticlesFeed({
  category,
  search,
}: {
  category: string;
  search: string;
}) {
  // The database, like every reader path (R1-12): the server render never calls NewsData.
  const { body } = await getTopHeadlines(new URLSearchParams({ category, language: "en", q: search }));
  const initialArticles = body.results ?? [];

  return (
    <HomeClient
      initialArticles={initialArticles}
      initialCategory={category}
      initialSearch={search}
    />
  );
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const category = params.category || "general";
  const search = params.search || "";

  return (
    <Suspense fallback={<NewsSkeletonGrid />}>
      <ArticlesFeed category={category} search={search} />
    </Suspense>
  );
}
