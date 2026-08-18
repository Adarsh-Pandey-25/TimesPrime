"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ArticleCard from "@/components/ArticleCard";
import MarqueeTicker from "@/components/MarqueeTicker";
import ThemeSpinner from "@/components/ThemeSpinner";
import { Article } from "@/types";
import { TrendingUp, Compass, Flame, Layers, RefreshCw, X } from "lucide-react";
import { Language, TRANSLATIONS } from "@/lib/translations";
import { useTheme } from "@/context/ThemeContext";
import { useLanguage } from "@/context/LanguageContext";
import { assignDedupedTopicImages } from "@/lib/topicImages";

interface HomeClientProps {
  initialArticles: Article[];
  initialCategory: string;
  initialSearch: string;
}

/** How often to silently check Supabase for newer stories. */
const NEW_STORIES_POLL_MS = 120000;

/**
 * Newest server-side `created_at` among the articles currently on screen.
 *
 * Preferred over the browser clock as the "since" marker: the comparison
 * runs in Postgres against the same column, so a skewed client clock can't
 * make the banner either never appear or never go away. Falls back to null
 * for sources that carry no timestamp (mock articles, cached payloads).
 */
function latestCreatedAt(articles: Article[]): Date | null {
  let newestMs: number | null = null;

  for (const art of articles) {
    const raw = (art as { created_at?: string }).created_at;
    if (!raw) continue;
    const ms = new Date(raw).getTime();
    if (!Number.isNaN(ms) && (newestMs === null || ms > newestMs)) {
      newestMs = ms;
    }
  }

  return newestMs === null ? null : new Date(newestMs);
}

/**
 * Grid column classes for Top Stories, sized to avoid a lone orphan card on
 * its own row. 4 is the one count a 3-col grid always splits unevenly
 * (3 + 1) — force 2 columns there instead so it's an even 2 + 2. Every
 * other count (0-3, 5, 6, 7+) already fills a 3-col grid evenly or with a
 * multi-card final row, so lg:grid-cols-3 stays as-is.
 *
 * Under the current `articles.slice(1, 5)` split, topStories can only ever
 * be 0-4 long, so the 5/6/7+ branches below are unreachable today — kept
 * anyway since the rule is correct if that slice range ever changes.
 */
function getTopStoriesGridClass(count: number): string {
  if (count === 4) return "grid-cols-1 sm:grid-cols-2";
  return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
}

/** "Updated X min ago" label for the Latest Updates header. */
function formatUpdatedAgo(since: Date): string {
  const minutes = Math.max(0, Math.round((Date.now() - since.getTime()) / 60000));
  if (minutes < 1) return "Updated just now";
  if (minutes === 1) return "Updated 1 min ago";
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "Updated 1 hour ago" : `Updated ${hours} hours ago`;
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

  // "New stories" banner state.
  const [lastFetchedAt, setLastFetchedAt] = useState<Date>(
    () => latestCreatedAt(initialArticles) ?? new Date()
  );
  const [newStoriesCount, setNewStoriesCount] = useState(0);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  // "Load More" reveal count for the Latest Updates grid — shows 8 at a
  // time instead of dumping the whole feed on screen at once.
  const [visibleLatestCount, setVisibleLatestCount] = useState(8);
  // Remembers the count the user dismissed at, so the banner stays hidden
  // until genuinely newer stories arrive instead of popping straight back
  // up on the next poll two minutes later.
  const dismissedAtCountRef = useRef(0);

  const t = TRANSLATIONS[language];

  // Stable across renders (no external deps — every caller passes `lang`
  // explicitly) so it's safe to reference from effects below.
  const fetchNews = useCallback(async (
    cat: string,
    query: string = "",
    lang: Language,
    bypassCache: boolean = false
  ) => {
    setLoading(true);
    try {
      let url = `/api/news/top-headlines?category=${cat}&language=${lang}`;
      if (query.trim()) {
        url += `&q=${encodeURIComponent(query.trim())}`;
      }
      // The banner's Refresh Feed must skip the 15-minute response cache,
      // or the user clicks it and sees the exact same articles they were
      // just told are out of date. The route still serves from Supabase.
      if (bypassCache) {
        url += "&refresh=true";
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
      setVisibleLatestCount(8);

      // Re-baseline the "new stories" tracker against what we just loaded.
      setLastFetchedAt(latestCreatedAt(fetchedResults) ?? new Date());
      setNewStoriesCount(0);
      setBannerDismissed(false);
      dismissedAtCountRef.current = 0;
    } catch (err) {
      console.error("Failed to fetch news:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Sync URL params on client navigation. Necessary setState-in-effect: the
  // URL (back/forward navigation, external links) is an external source
  // React can't know about during render, so state can only be synced to it
  // after the fact.
  //
  // Deps intentionally scoped to `searchParams` only: this effect's job is
  // to sync local state FROM the URL, not to re-run whenever category/
  // searchQuery/language change for other reasons — those are handled by
  // the effect below and by direct handlers (handleSearch, category
  // clicks). Adding them here would cause redundant/duplicate fetches.
  useEffect(() => {
    const urlCat = searchParams.get("category");
    const urlSearch = searchParams.get("search");
    if (urlCat && urlCat !== category) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCategory(urlCat);
      fetchNews(urlCat, urlSearch || "", language);
    }
    if (urlSearch !== null && urlSearch !== searchQuery) {
      setSearchQuery(urlSearch);
      fetchNews(urlCat || category, urlSearch, language);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const isFirstRender = useRef(true);

  // Re-fetch when category or language changes on client side.
  // `searchQuery` is intentionally excluded from deps: handleSearch already
  // triggers its own fetch when the search query changes, so including it
  // here would fire a second, duplicate request on every keystroke-driven
  // search.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    fetchNews(category, searchQuery, language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, language, fetchNews]);

  // Silently poll Supabase for stories newer than what's on screen.
  //
  // Skipped entirely while a search is active: the banner's "refresh" would
  // reload the search results, and check-new counts category rows, not
  // query matches — so the count would be meaningless there.
  //
  // Polling pauses when the tab is hidden (no point burning requests on a
  // backgrounded tab) and does one immediate catch-up check on return.
  useEffect(() => {
    if (searchQuery.trim()) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const checkForNewStories = async () => {
      if (document.visibilityState === "hidden") return;

      try {
        const params = new URLSearchParams({
          category,
          language,
          since: lastFetchedAt.toISOString(),
        });
        const res = await fetch(`/api/news/check-new?${params.toString()}`, {
          headers: { "ngrok-skip-browser-warning": "true" },
        });
        if (!res.ok || cancelled) return;

        const data = await res.json();
        if (cancelled || typeof data.newCount !== "number" || data.newCount <= 0) return;

        setNewStoriesCount(data.newCount);
        // Only resurrect a dismissed banner once there's genuinely more
        // than the user already waved away.
        if (data.newCount > dismissedAtCountRef.current) {
          setBannerDismissed(false);
        }
      } catch {
        // Silent by design — a failed background poll must never disturb
        // the feed the user is currently reading.
      }
    };

    const startPolling = () => {
      if (!intervalId) intervalId = setInterval(checkForNewStories, NEW_STORIES_POLL_MS);
    };
    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopPolling();
      } else {
        checkForNewStories();
        startPolling();
      }
    };

    startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [category, language, lastFetchedAt, searchQuery]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    fetchNews(category, query, language);
  };

  const handleRefreshFeed = () => {
    setNewStoriesCount(0);
    setBannerDismissed(false);
    dismissedAtCountRef.current = 0;
    fetchNews(category, searchQuery, language, true);
  };

  const handleDismissBanner = () => {
    dismissedAtCountRef.current = newStoriesCount;
    setBannerDismissed(true);
  };

  const showNewStoriesBanner = newStoriesCount > 0 && !bannerDismissed;

  const isDark = theme === "dark";

  const featuredArticle = articles[0];
  const topStories = articles.slice(1, 5);
  const latestStories = articles.slice(5);

  // Dedupe topic images across every visible card: several articles from
  // the same category otherwise resolve to the same pooled Unsplash photo
  // (see topicImages.ts). One Map spans featured + topStories + latestStories
  // so no two cards on the page share an image.
  const cardImageUrls = assignDedupedTopicImages([featuredArticle, ...topStories, ...latestStories].filter(Boolean));

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-200 ${
        isDark ? "bg-[#1a1c1e] text-slate-100" : "bg-gray-50/80 text-slate-900"
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

      {/* New Stories Available Banner */}
      {showNewStoriesBanner && (
        <div className="w-full bg-red-600 text-white shadow-md animate-in fade-in duration-300">
          <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-3 py-2.5 sm:px-4 md:px-6 lg:px-10">
            <span className="flex items-center gap-2 text-xs sm:text-sm font-bold">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
              </span>
              {newStoriesCount} {newStoriesCount === 1 ? "new story" : "new stories"} available
            </span>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleRefreshFeed}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[11px] sm:text-xs font-black uppercase tracking-wider text-red-600 transition-colors hover:bg-red-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh Feed
              </button>
              <button
                onClick={handleDismissBanner}
                className="rounded-lg p-1.5 text-white/80 transition-colors hover:bg-red-700 hover:text-white"
                aria-label="Dismiss new stories notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Breaking News Marquee Ticker */}
      <MarqueeTicker articles={articles} />

      {/* Ad Slot: Top Banner (responsive, hidden when no ad) */}
      <div className="w-full" id="ad-slot-top-banner">
        {/* Future ad integration: this container will expand when ads are served */}
      </div>

      <main className="flex-1 mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 md:px-8 lg:px-12 space-y-10 sm:space-y-12 lg:space-y-16">
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
            <div className="mt-2 h-1 w-10 rounded-full bg-[#1E3A5F]" aria-hidden="true" />
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
              <section className="space-y-4 sm:space-y-5">
                <div className="flex items-center space-x-2 text-xs sm:text-sm font-black uppercase tracking-wider text-red-600 dark:text-red-400 pt-1">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-600 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" />
                  </span>
                  <Flame className="h-4 w-4 sm:h-5 sm:w-5 text-red-600 animate-bounce" />
                  <span>{t.featuredCoverage}</span>
                </div>
                <ArticleCard
                  article={featuredArticle}
                  featured
                  language={language}
                  relatedStories={topStories}
                  imageUrl={cardImageUrls.get(featuredArticle)}
                />
              </section>
            )}

            {/* Ad Slot: After Featured (responsive) */}
            <div className="w-full" id="ad-slot-after-featured">
              {/* Future ad integration */}
            </div>

            {/* Top Stories Grid */}
            {topStories.length > 0 && (
              <section className="space-y-5 sm:space-y-6 mt-12 sm:mt-16">
                <hr className="border-slate-200 dark:border-[#2b2f36]" />
                <div className="flex items-center justify-between border-b-2 border-[#1E3A5F] pb-2">
                  <div className="flex items-center space-x-2 text-base sm:text-lg font-black text-slate-900 dark:text-white uppercase tracking-wider">
                    <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-[#1E3A5F] dark:text-[#4A7BAF]" />
                    <span>{t.topStories}</span>
                  </div>
                </div>
                <div className={`grid gap-5 sm:gap-6 lg:gap-8 ${getTopStoriesGridClass(topStories.length)}`}>
                  {topStories.map((art) => (
                    <ArticleCard key={art.article_id || art.link} article={art} language={language} imageUrl={cardImageUrls.get(art)} />
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
              <section className="space-y-5 sm:space-y-6 mt-12 sm:mt-16">
                <hr className="border-slate-200 dark:border-[#2b2f36]" />
                <div className="flex items-center justify-between border-b-2 border-[#1E3A5F] pb-2">
                  <div className="flex items-center space-x-2 text-base sm:text-lg font-black text-slate-900 dark:text-white uppercase tracking-wider">
                    <Compass className="h-4 w-4 sm:h-5 sm:w-5 text-[#1E3A5F] dark:text-[#4A7BAF]" />
                    <span>{t.latestUpdates}</span>
                  </div>
                  <span className="text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400" suppressHydrationWarning>
                    {formatUpdatedAgo(lastFetchedAt)}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4 lg:gap-7">
                  {latestStories.slice(0, visibleLatestCount).map((art) => (
                    <ArticleCard
                      key={art.article_id || art.link}
                      article={art}
                      language={language}
                      imageUrl={cardImageUrls.get(art)}
                      className="min-h-[420px]"
                    />
                  ))}
                </div>
                {visibleLatestCount < latestStories.length && (
                  <div className="flex justify-center pt-2">
                    <button
                      onClick={() => setVisibleLatestCount((c) => c + 8)}
                      className={`rounded-xl px-6 py-2.5 text-xs sm:text-sm font-bold uppercase tracking-wider transition-colors ${
                        isDark
                          ? "bg-[#25282d] text-slate-200 border border-[#34383f] hover:bg-[#2a2d33] hover:border-red-600/50"
                          : "bg-white text-slate-700 border border-slate-200 hover:border-red-500/50 hover:shadow-md"
                      }`}
                    >
                      Load More Stories
                    </button>
                  </div>
                )}
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
