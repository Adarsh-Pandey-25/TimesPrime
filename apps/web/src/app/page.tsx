import { Suspense } from "react";
import type { Metadata } from "next";
import { fetchInitialNews } from "@timesprime/server/services/news";
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
  const initialArticles = await fetchInitialNews(category, "en", search);

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
