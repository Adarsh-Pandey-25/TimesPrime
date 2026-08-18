"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Article } from "@/types";
import { ChevronRight, Sparkles } from "lucide-react";
import { Language, TRANSLATIONS, translateHeadline } from "@/lib/translations";
import { useTheme } from "@/context/ThemeContext";

import { useLanguage } from "@/context/LanguageContext";

import { assignDedupedTopicImages } from "@/lib/topicImages";

interface CategoryMegaMenuProps {
  category: string;
  articles: Article[];
  language?: Language;
  onClose: () => void;
  onSelectCategory?: (category: string) => void;
}

const SUB_TOPICS: Record<string, string[]> = {
  general: ["Top Stories", "Global Headlines", "Editor's Picks", "Special Reports"],
  india: ["National News", "Politics & Govt", "States & UTs", "Indian Economy"],
  world: ["Global Affairs", "US & Americas", "Europe", "Asia-Pacific"],
  tech: ["AI & Innovation", "Gadgets", "Cybersecurity", "Startups"],
  business: ["Stock Markets", "Economy", "Crypto & Forex", "Real Estate"],
  sports: ["Cricket", "Football", "Tennis", "Olympics"],
  entertainment: ["Movies & Cinema", "Celebrity News", "Streaming & OTT", "Music"],
  health: ["Wellness & Fitness", "Medical Research", "Nutrition", "Mental Health"],
  science: ["Space & NASA", "Climate & Environment", "Physics", "Biotech"],
};

export default function CategoryMegaMenu({
  category,
  articles,
  language: propsLang,
  onClose,
  onSelectCategory,
}: CategoryMegaMenuProps) {
  const { theme } = useTheme();
  const { language: globalLang } = useLanguage();
  const isDark = theme === "dark";
  const language = propsLang || globalLang || "en";
  const t = TRANSLATIONS[language];

  const subTopics = SUB_TOPICS[category] || ["Latest News", "Top Updates", "Featured"];

  // Filter initial articles by category if available
  const initialCategoryArticles = articles.filter((art) => {
    if (category === "general") return true;
    const catLower = category.toLowerCase();
    return (
      art.category?.some((c) => c.toLowerCase().includes(catLower)) ||
      art.title.toLowerCase().includes(catLower) ||
      (art.description && art.description.toLowerCase().includes(catLower))
    );
  }).slice(0, 5);

  const [categoryArticles, setCategoryArticles] = useState<Article[]>(
    initialCategoryArticles.length > 0 ? initialCategoryArticles : articles.slice(0, 5)
  );
  const [loading, setLoading] = useState(false);

  // Fetch category-specific articles dynamically when hovering
  useEffect(() => {
    let isMounted = true;
    const fetchCategoryNews = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/news/top-headlines?category=${category}&language=${language}&pageSize=5`, {
          headers: { "ngrok-skip-browser-warning": "true" },
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.results && data.results.length > 0) {
            setCategoryArticles(data.results.slice(0, 5));
          }
        }
      } catch {
        // Fall back to filtered articles
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchCategoryNews();
    return () => {
      isMounted = false;
    };
  }, [category, language]);

  const categoryLabel =
    category === "general"
      ? t.topWorldStories
      : t.categories[category as keyof typeof t.categories] || category;

  const handleCategoryClick = (cat: string, searchTopic?: string) => {
    if (onSelectCategory) {
      onSelectCategory(cat);
    }
    onClose();
  };

  const dedupedImages = assignDedupedTopicImages(categoryArticles);

  return (
    <div
      onMouseLeave={onClose}
      className={`absolute left-0 right-0 top-full z-50 w-full border-b shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200 transition-colors ${
        isDark
          ? "border-[#34383f] bg-[#1f2226]/98 text-slate-100"
          : "border-slate-200 bg-white/98 text-slate-900"
      }`}
    >
      <div className="mx-auto flex max-w-[1500px] flex-col lg:flex-row px-4 py-6 sm:px-8 lg:px-10 gap-8">
        {/* Left Column: Sub-Topics Menu */}
        <div
          className={`w-full lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r pb-4 lg:pb-0 pr-6 space-y-4 ${
            isDark ? "border-[#34383f]" : "border-slate-200"
          }`}
        >
          <Link
            href={`/?category=${category}`}
            onClick={() => handleCategoryClick(category)}
            className="flex items-center space-x-2 group cursor-pointer"
          >
            <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse" />
            <h3 className={`font-serif text-lg font-black uppercase tracking-wider group-hover:text-red-600 transition-colors ${isDark ? "text-white" : "text-slate-900"}`}>
              {categoryLabel}
            </h3>
          </Link>

          <ul className="space-y-1.5">
            {subTopics.map((sub, idx) => (
              <li key={idx}>
                <Link
                  href={`/?category=${category}&search=${encodeURIComponent(sub)}`}
                  onClick={() => handleCategoryClick(category, sub)}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-bold transition-all group ${
                    isDark
                      ? "text-slate-300 hover:bg-[#2c3036] hover:text-white"
                      : "text-slate-700 hover:bg-red-50 hover:text-red-700"
                  }`}
                >
                  <span>{sub}</span>
                  <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-red-600" />
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Right Area: Category Specific Stories Grid */}
        <div className="flex-1 space-y-3">
          <div className={`flex items-center justify-between border-b pb-2 ${isDark ? "border-[#34383f]" : "border-slate-200"}`}>
            <span className="text-xs font-black uppercase tracking-wider text-red-600 dark:text-red-400 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 animate-pulse" />
              Latest in {categoryLabel}
            </span>
            <Link
              href={`/?category=${category}`}
              onClick={() => handleCategoryClick(category)}
              className={`text-xs font-bold transition-colors ${isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900"}`}
            >
              View All {categoryLabel} Stories →
            </Link>
          </div>

          {/* 5 Card Grid with dynamic category news */}
          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 pt-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-44 rounded-xl bg-slate-200 dark:bg-[#272a2f] animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 pt-2">
              {categoryArticles.map((art, idx) => {
                const slug = encodeURIComponent(art.article_id || art.title.slice(0, 30));
                const titleText = translateHeadline(art.title, language);
                const imgSrc = dedupedImages.get(art)!;

                return (
                  <Link
                    key={art.article_id || idx}
                    href={`/article/${slug}?url=${encodeURIComponent(art.link)}`}
                    onClick={onClose}
                    className={`group flex flex-col justify-between overflow-hidden rounded-xl border p-2.5 transition-all shadow-xs ${
                      isDark
                        ? "border-[#34383f] bg-[#272a2f] text-slate-100 hover:border-red-500 hover:bg-[#31353c]"
                        : "border-slate-200 bg-slate-50 text-slate-900 hover:border-red-600 hover:bg-white hover:shadow-md"
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg">
                        <Image
                          src={imgSrc}
                          alt={titleText}
                          fill
                          sizes="200px"
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      </div>
                      <h4 className="line-clamp-3 text-xs font-bold leading-snug group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                        "{titleText}"
                      </h4>
                    </div>
                    <span className="mt-2 block text-[10px] font-semibold opacity-70">
                      {art.source_name || "Times Media"}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
