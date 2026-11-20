import type { Metadata } from "next";
import { rssAlternates } from "@timesprime/shared/config/rss";
import ArticlesFeed from "../_feed/ArticlesFeed";
import SiteJsonLd from "@/components/seo/SiteJsonLd";

// The top stories. A search (?search=) is a view of the home page, so it points search engines
// here (R1-09). Each section has its own URL since R2 ([section]/page.tsx), and /?category=<section>
// answers 308 there (next.config.ts).
// Panel 3, M4: the newsroom's RSS feeds, in English and Hindi, for feed readers to find.
export const metadata: Metadata = { alternates: { canonical: "/", types: { "application/rss+xml": rssAlternates(null) } } };

interface HomePageProps {
  searchParams: Promise<{ category?: string; search?: string }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  return (
    <>
      <SiteJsonLd />
      <ArticlesFeed category={params.category || "general"} search={params.search || ""} />
    </>
  );
}
