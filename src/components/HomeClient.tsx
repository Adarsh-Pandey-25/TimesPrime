"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ArticleCard from "@/components/ArticleCard";
import MarqueeTicker from "@/components/MarqueeTicker";
import ThemeSpinner from "@/components/ThemeSpinner";
import { Article } from "@/types";
import { TrendingUp, Compass, Flame, Layers } from "lucide-react";
import { Language, TRANSLATIONS } from "@/lib/translations";
import { useTheme } from "@/context/ThemeContext";
import { useLanguage } from "@/context/LanguageContext";

interface HomeClientProps {
  initialArticles: Article[];
  initialCategory: string;
  initialSearch: string;
}

export default function HomeClient({
  initialArticles,
  initialCategory,
  initialSearch,
}: HomeClientProps) {
  const { theme } = useTheme();
  const { language } = useLanguage();
  const searchParams = useSearchParams();

  const [category, setCategory] = useState(initialCategory);
  const [articles, setArticles] = useState<Article[]>(initialArticles);
  const [loading, setLoading] = useState(false); // false: we have server data
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialSearch);

  const t = TRANSLATIONS[language];

  // Sync URL params on client navigation
  useEffect(() => {
    const urlCat = searchParams.get("category");
    const urlSearch = searchParams.get("search");
    if (urlCat && urlCat !== category) {
      setCategory(urlCat);
      fetchNews(urlCat, urlSearch || "", language);
    }
    if (urlSearch !== null && urlSearch !== searchQuery) {
      setSearchQuery(urlSearch);
      fetchNews(urlCat || category, urlSearch, language);
    }
  }, [searchParams]);

  const fetchNews = async (cat: string, query: string = "", lang: Language = language) => {
    setLoading(true);
    try {
      let url = `/api/news/top-headlines?category=${cat}&language=${lang}`;
      if (query.trim()) {
        url += `&q=${encodeURIComponent(query.trim())}`;
      }
      const res = await fetch(url, {
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      const data = await res.json();

      let fetchedResults: Article[] = data.results || [];
      if (query.trim()) {
        const terms = query.toLowerCase().trim().split(/\s+/);
        const matched = fetchedResults.filter((art) => {
          const t = art.title.toLowerCase();
          const d = (art.description || "").toLowerCase();
          const c = (art.content || "").toLowerCase();
          return terms.some((term) => t.includes(term) || d.includes(term) || c.includes(term));
        });
        if (matched.length > 0) {
          fetchedResults = matched;
        }
      }

      setArticles(fetchedResults);
    } catch (err) {
      console.error("Failed to fetch news:", err);
    } finally {
      setLoading(false);
    }
  };

  const isFirstRender = useRef(true);

  // Re-fetch when category or language changes on client side
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    fetchNews(category, searchQuery, language);
  }, [category, language]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    fetchNews(category, query, language);
  };

  const isDark = theme === "dark";

  const featuredArticle = articles[0];
  const topStories = articles.slice(1, 5);
  const latestStories = articles.slice(5);

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-200 ${
        isDark ? "bg-[#1a1c1e] text-slate-100" : "bg-slate-50 text-slate-900"
      }`}
    >
      <Header
        activeCategory={category}
        onSelectCategory={(cat) => {
          setCategory(cat);
          setSearchQuery("");
          fetchNews(cat, "", language);
        }}
        onToggleChatbot={() => setIsChatOpen(!isChatOpen)}
        isChatOpen={isChatOpen}
        searchQuery={searchQuery}
        onSearch={handleSearch}
        articles={articles}
      />

      {/* Breaking News Marquee Ticker */}
      <MarqueeTicker articles={articles} />

      {/* Ad Slot: Top Banner (responsive, hidden when no ad) */}
      <div className="w-full" id="ad-slot-top-banner">
        {/* Future ad integration: this container will expand when ads are served */}
      </div>

      <main className="flex-1 mx-auto w-full max-w-[1500px] px-3 py-6 sm:px-4 md:px-6 lg:px-10 space-y-8 sm:space-y-10 lg:space-y-12">
        {/* Category / Search Header Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 dark:border-[#2b2f36] pb-3 sm:pb-4 gap-2">
          <div>
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-red-600">
              {searchQuery ? `Search Results for "${searchQuery}"` : t.currentFeed}
            </span>
            <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-extrabold capitalize">
              {searchQuery
                ? `Results for "${searchQuery}"`
                : category === "general"
                ? t.topWorldStories
                : t.categories[category as keyof typeof t.categories] || category}
            </h1>
          </div>
        </div>

        {/* Ad Slot: Below Title (responsive) */}
        <div className="w-full" id="ad-slot-below-title">
          {/* Future ad integration */}
        </div>

        {/* Theme-Aware News Radar Spinner */}
        {loading ? (
          <ThemeSpinner
            message={
              searchQuery
                ? `Searching for "${searchQuery}"...`
                : `Fetching live ${category} headlines...`
            }
            subMessage="Connecting to verified global news feeds..."
          />
        ) : (
          <>
            {/* Featured Hero Article Section */}
            {featuredArticle && !searchQuery && (
              <section className="space-y-3 sm:space-y-4">
                <div className="flex items-center space-x-2 text-[10px] sm:text-xs font-black uppercase tracking-wider text-red-600 dark:text-red-400">
                  <Flame className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-600 animate-bounce" />
                  <span>{t.featuredCoverage}</span>
                </div>
                <ArticleCard
                  article={featuredArticle}
                  featured
                  language={language}
                  relatedStories={topStories}
                />
              </section>
            )}

            {/* Ad Slot: After Featured (responsive) */}
            <div className="w-full" id="ad-slot-after-featured">
              {/* Future ad integration */}
            </div>

            {/* Top Stories Grid */}
            {topStories.length > 0 && (
              <section className="space-y-4 sm:space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-sm sm:text-base font-black text-slate-900 dark:text-white uppercase tracking-wider">
                    <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-red-600 dark:text-red-400" />
                    <span>{t.topStories}</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6">
                  {topStories.map((art) => (
                    <ArticleCard key={art.article_id || art.link} article={art} language={language} />
                  ))}
                </div>
              </section>
            )}

            {/* Ad Slot: Mid-Feed (responsive) */}
            <div className="w-full" id="ad-slot-mid-feed">
              {/* Future ad integration */}
            </div>

            {/* Latest Stories Feed */}
            {latestStories.length > 0 && (
              <section className="space-y-4 sm:space-y-6">
                <div className="flex items-center justify-between border-t border-slate-200 dark:border-[#2b2f36] pt-6 sm:pt-8">
                  <div className="flex items-center space-x-2 text-sm sm:text-base font-black text-slate-900 dark:text-white uppercase tracking-wider">
                    <Compass className="h-4 w-4 sm:h-5 sm:w-5 text-red-600 dark:text-red-400" />
                    <span>{t.latestUpdates}</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6">
                  {latestStories.map((art) => (
                    <ArticleCard key={art.article_id || art.link} article={art} language={language} />
                  ))}
                </div>
              </section>
            )}

            {/* No Articles Found Fallback */}
            {articles.length === 0 && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 sm:p-12 text-center space-y-4">
                <Layers className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-slate-400" />
                <h3 className="font-serif text-lg sm:text-xl font-bold">
                  No News Stories Found
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
                  Try switching categories or refreshing your feed to fetch the latest global news reports.
                </p>
                <button
                  onClick={() => {
                    setCategory("general");
                    setSearchQuery("");
                    fetchNews("general", "", language);
                  }}
                  className="rounded-xl bg-red-600 px-6 py-2 text-xs font-bold text-white hover:bg-red-700 transition-colors"
                >
                  Reset Category
                </button>
              </div>
            )}
          </>
        )}

        {/* Ad Slot: Bottom Feed (responsive) */}
        <div className="w-full" id="ad-slot-bottom-feed">
          {/* Future ad integration */}
        </div>
      </main>

      <Footer language={language} />
    </div>
  );
}
