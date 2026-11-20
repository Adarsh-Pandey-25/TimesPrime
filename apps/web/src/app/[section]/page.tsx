import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { rssAlternates } from "@timesprime/shared/config/rss";
import { isSection, SECTION_IDS, sectionMetadata } from "@timesprime/shared/config/sections";
import ArticlesFeed from "../_feed/ArticlesFeed";

// A section's page (R2): /india, /world, /tech and the rest (packages/shared/src/config/sections.ts),
// the same feed as the home page for one category, with its own title and canonical link.

interface SectionPageProps {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ search?: string }>;
}

// Only the listed sections exist. The route sits outside the (feed) group, so no loading file
// streams it first, and any other one-segment path answers a real 404 (gotcha 3.34); the feed's own
// Suspense skeleton (_feed/ArticlesFeed.tsx) starts only after that check.
export const dynamicParams = false;

export function generateStaticParams() {
  return SECTION_IDS.map((section) => ({ section }));
}

export async function generateMetadata({ params }: SectionPageProps): Promise<Metadata> {
  const { section } = await params;
  if (!isSection(section)) return {};
  const { title, description } = sectionMetadata(section);
  // A search within a section is a view of the section, so it points search engines here too.
  // Panel 3, M4: the section's RSS feeds, in English and Hindi.
  return {
    title,
    description,
    alternates: { canonical: `/${section}`, types: { "application/rss+xml": rssAlternates(section) } },
    openGraph: { title: `${title} | TimesPrime News`, description, url: `/${section}` },
  };
}

export default async function SectionPage({ params, searchParams }: SectionPageProps) {
  const [{ section }, { search }] = await Promise.all([params, searchParams]);
  if (!isSection(section)) notFound();
  return <ArticlesFeed category={section} search={search || ""} />;
}
