import type { Metadata } from "next";
import ArticlesFeed from "../_feed/ArticlesFeed";

// The top stories. A search (?search=) is a view of the home page, so it points search engines
// here (R1-09). Each section has its own URL since R2 ([section]/page.tsx), and /?category=<section>
// answers 308 there (next.config.ts).
export const metadata: Metadata = { alternates: { canonical: "/" } };

interface HomePageProps {
  searchParams: Promise<{ category?: string; search?: string }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  return <ArticlesFeed category={params.category || "general"} search={params.search || ""} />;
}
