import { Suspense } from "react";
import { fetchInitialNews } from "@/lib/fetchNews";
import HomeClient from "@/components/HomeClient";
import NewsSkeletonGrid from "@/components/NewsSkeletonGrid";

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
  // Server-side fetch — works reliably via ngrok, Vercel, etc.
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
