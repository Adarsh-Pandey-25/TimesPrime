"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ArticleCard from "@/components/ArticleCard";
import { Article } from "@/types";
import { Bookmark, Trash2, ArrowLeft, Layers } from "lucide-react";
import { getBookmarks, clearAllBookmarks } from "@/lib/bookmarks";
import { useTheme } from "@/context/ThemeContext";

export default function SavedArticlesPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [savedArticles, setSavedArticles] = useState<Article[]>([]);

  const loadSaved = () => {
    setSavedArticles(getBookmarks());
  };

  useEffect(() => {
    loadSaved();
    window.addEventListener("timesprime_bookmarks_updated", loadSaved);
    return () => {
      window.removeEventListener("timesprime_bookmarks_updated", loadSaved);
    };
  }, []);

  const handleClearAll = () => {
    if (confirm("Are you sure you want to remove all saved articles?")) {
      clearAllBookmarks();
      setSavedArticles([]);
    }
  };

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-200 ${
        isDark ? "bg-[#1a1c1e] text-slate-100" : "bg-slate-50 text-slate-900"
      }`}
    >
      <Header />

      <main className="flex-1 mx-auto w-full max-w-[1500px] px-4 py-8 sm:px-8 lg:px-10 space-y-8">
        {/* Header Title Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 dark:border-[#2b2f36] pb-4 gap-4">
          <div className="space-y-1">
            <Link
              href="/"
              className="inline-flex items-center space-x-1.5 text-xs font-bold text-red-600 dark:text-red-400 hover:text-red-700 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Global Headlines</span>
            </Link>
            <div className="flex items-center space-x-3 pt-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 text-white shadow-sm">
                <Bookmark className="h-5 w-5 fill-current" />
              </div>
              <div>
                <h1 className="font-serif text-3xl font-extrabold sm:text-4xl">
                  Saved Reading List
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {savedArticles.length === 1
                    ? "1 story saved for offline reading"
                    : `${savedArticles.length} stories saved for offline reading`}
                </p>
              </div>
            </div>
          </div>

          {savedArticles.length > 0 && (
            <button
              onClick={handleClearAll}
              className="inline-flex items-center space-x-1.5 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-4 py-2 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/80 transition-colors self-start sm:self-auto"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear All Saved</span>
            </button>
          )}
        </div>

        {/* Saved Articles Grid */}
        {savedArticles.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {savedArticles.map((article) => (
              <ArticleCard
                key={article.article_id || article.link}
                article={article}
              />
            ))}
          </div>
        ) : (
          /* Empty State Fallback */
          <div className="rounded-2xl border border-slate-200 dark:border-[#383d45] bg-white dark:bg-[#25282d] p-16 text-center space-y-5 my-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400">
              <Bookmark className="h-8 w-8" />
            </div>
            <div className="space-y-2 max-w-md mx-auto">
              <h3 className="font-serif text-xl font-bold">
                No Saved Articles Yet
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                Click the bookmark icon (<Bookmark className="h-3 w-3 inline text-red-600" />) on any news card across the home feed or category pages to save stories and read them here anytime!
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center space-x-2 rounded-xl bg-red-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-red-700 transition-colors shadow-xs"
            >
              <Layers className="h-4 w-4" />
              <span>Browse Global News Feed</span>
            </Link>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
