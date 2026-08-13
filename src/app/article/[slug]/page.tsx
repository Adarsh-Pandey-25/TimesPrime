import { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ArticleDetailView from "@/components/ArticleDetailView";
import { Article } from "@/types";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ url?: string; image?: string }>;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const title = decodeURIComponent(resolvedParams.slug || "Article View");

  return {
    title: `${title} | TimesPrime News`,
    description: `Read full coverage and AI-synthesized analysis on ${title}.`,
    openGraph: {
      title: `${title} | TimesPrime News`,
      description: `Read full story on TimesPrime News.`,
      url: resolvedSearchParams.url || "https://timesprimenews.com",
    },
  };
}

async function getArticleContent(targetUrl?: string) {
  if (!targetUrl) {
    return {
      title: "Story Overview",
      content: [
        "Full coverage details for this article are presented below. Click the external publisher link to read directly on the source website.",
      ],
    };
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/news/scrape-article?url=${encodeURIComponent(targetUrl)}`, {
      headers: { "ngrok-skip-browser-warning": "true" },
      next: { revalidate: 3600 },
    });

    if (!res.ok) throw new Error("Scrape request failed");
    return await res.json();
  } catch {
    return {
      title: "Full Story Coverage",
      content: [
        "Full article coverage details for this report are available directly on the official publisher website below.",
      ],
    };
  }
}

async function getSuggestedArticles(): Promise<Article[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/news/top-headlines?pageSize=8`, {
      headers: { "ngrok-skip-browser-warning": "true" },
      next: { revalidate: 900 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch {
    return [];
  }
}

export default async function ArticlePage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  const rawSlug = decodeURIComponent(resolvedParams.slug || "Article View");
  const targetUrl = resolvedSearchParams.url;
  const imageUrl = resolvedSearchParams.image;

  // Execute both data fetches in parallel (Parallel Fast Loading)
  const [scrapedData, allArticles] = await Promise.all([
    getArticleContent(targetUrl),
    getSuggestedArticles(),
  ]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#1a1c1e] text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <Header articles={allArticles} />

      <main className="flex-1">
        <ArticleDetailView
          slug={rawSlug}
          targetUrl={targetUrl}
          imageUrl={imageUrl}
          scrapedData={scrapedData}
          allArticles={allArticles}
        />
      </main>

      <Footer />
    </div>
  );
}
