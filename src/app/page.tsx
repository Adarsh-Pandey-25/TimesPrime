import { fetchInitialNews } from "@/lib/fetchNews";
import HomeClient from "@/components/HomeClient";

interface HomePageProps {
  searchParams: Promise<{ category?: string; search?: string }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const category = params.category || "general";
  const search = params.search || "";

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
