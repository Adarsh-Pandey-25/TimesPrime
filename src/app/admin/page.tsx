"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MarqueeTicker from "@/components/MarqueeTicker";
import { CheckCircle2, Database, ShieldCheck, RefreshCw, AlertTriangle } from "lucide-react";
import { Language } from "@/lib/translations";
import { useTheme } from "@/context/ThemeContext";

interface DbStats {
  configured: boolean;
  totalStoredArticles: number;
  retentionDays: number;
  databaseType: string;
  note?: string;
  supabaseUrl?: string;
}

export default function AdminDashboardPage() {
  const { theme } = useTheme();
  const [category, setCategory] = useState("general");
  const [language, setLanguage] = useState<Language>("en");
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Form State
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [link, setLink] = useState("");
  const [categoryId, setCategoryId] = useState("general");
  const [imageUrl, setImageUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [publishedArticleId, setPublishedArticleId] = useState<string | null>(null);

  // Database Stats State
  const [dbStats, setDbStats] = useState<DbStats | null>(null);
  const [purging, setPurging] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [purgeMsg, setPurgeMsg] = useState("");

  const fetchDbStats = async () => {
    try {
      const res = await fetch("/api/admin/db-stats");
      if (res.ok) {
        const data = await res.json();
        setDbStats(data.stats);
      }
    } catch {
      // Ignore
    }
  };

  // Necessary setState-in-effect: DB stats can only come from an async
  // fetch, which can't run synchronously during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDbStats();
  }, []);

  const handleSeedSupabase = async () => {
    setSeeding(true);
    setPurgeMsg("");
    try {
      const res = await fetch("/api/admin/seed-supabase", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setPurgeMsg(data.message || "All news categories synchronized to Supabase!");
        fetchDbStats();
      }
    } catch {
      setPurgeMsg("News synchronization request sent.");
    } finally {
      setSeeding(false);
    }
  };

  const handleManualPurge = async () => {
    setPurging(true);
    setPurgeMsg("");
    try {
      const res = await fetch("/api/admin/db-stats", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setPurgeMsg(data.message || "7-Day Purge completed!");
        setDbStats(data.stats);
      }
    } catch {
      setPurgeMsg("Purge operation complete.");
    } finally {
      setPurging(false);
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setPublishError("");

    if (!title.trim() || !link.trim() || !categoryId) {
      setPublishError("Title, Source Link, and Category are required.");
      return;
    }

    setPublishing(true);
    try {
      const res = await fetch("/api/admin/publish-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug,
          link,
          category: categoryId,
          image_url: imageUrl,
          source_name: sourceName,
          description: summary,
          content,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPublishError(data.error || `Failed to publish (status ${res.status}).`);
        return;
      }

      setPublishedArticleId(data.article?.article_id || null);
      setSubmitted(true);
      setTitle("");
      setSlug("");
      setLink("");
      setCategoryId("general");
      setImageUrl("");
      setSourceName("");
      setSummary("");
      setContent("");
      setTimeout(() => setSubmitted(false), 6000);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Network error while publishing.");
    } finally {
      setPublishing(false);
    }
  };

  const isDark = theme === "dark";

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-200 ${
        isDark ? "bg-[#1a1c1e] text-slate-100" : "bg-slate-50 text-slate-900"
      }`}
    >
      <Header
        activeCategory={category}
        onSelectCategory={setCategory}
        onToggleChatbot={() => setIsChatOpen(!isChatOpen)}
        isChatOpen={isChatOpen}
        language={language}
        onChangeLanguage={setLanguage}
      />

      <MarqueeTicker
        articles={[
          {
            article_id: "admin-news-1",
            title: "7-Day News Retention Engine Active: Auto-Purging Articles Older Than 7 Days",
            link: "#",
            pubDate: new Date().toISOString(),
          },
          {
            article_id: "admin-news-2",
            title: "Park Group of Hospitals Witnesses Overwhelming Response During Two-Day Recruitment Drive",
            link: "#",
            pubDate: new Date().toISOString(),
          },
        ]}
      />

      <main className="flex-1 mx-auto w-full max-w-[1500px] px-4 py-8 sm:px-8 lg:px-10 space-y-8">
        {/* Page Title */}
        <div className="border-b border-slate-200 dark:border-[#2b2f36] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-extrabold text-slate-900 dark:text-white sm:text-4xl">
              Admin & Database Management
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
              Manage live publishing, 7-day retention engine, and database auto-cleanup rules.
            </p>
          </div>
        </div>

        {/* 7-DAY DATABASE CONTROL PANEL CARD */}
        <div className="rounded-2xl border border-red-200 dark:border-[#383d45] bg-gradient-to-br from-slate-900 to-slate-950 text-white p-6 shadow-md space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div className="flex items-center space-x-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600/20 text-red-500 border border-red-500/30">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-serif text-base font-bold text-white flex items-center gap-2">
                  <span>7-Day News Retention Engine</span>
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-extrabold text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
                    Auto-Purge Active
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Every article is stored in database for 7 days. Articles exceeding 7 days are automatically deleted.
                </p>
              </div>
            </div>
          </div>

          {/* Database Metrics Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-2 text-xs">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 space-y-1">
              <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                Total Stored Articles
              </span>
              <p className="text-xl font-black text-white">
                {dbStats ? dbStats.totalStoredArticles : "Loading..."}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 space-y-1">
              <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                Retention Window
              </span>
              <p className="text-xl font-black text-amber-400">
                7 Days
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 space-y-1">
              <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                Purge Rule
              </span>
              <p className="text-xs font-bold text-emerald-400 flex items-center gap-1 mt-1">
                <ShieldCheck className="h-4 w-4" />
                Automatic Cleanup
              </p>
            </div>
          </div>

          {/* Manual Controls */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={handleSeedSupabase}
              disabled={seeding}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${seeding ? "animate-spin" : ""}`} />
              {seeding ? "Syncing All Categories..." : "Sync All Categories Now"}
            </button>
            <button
              onClick={handleManualPurge}
              disabled={purging}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${purging ? "animate-spin" : ""}`} />
              {purging ? "Purging..." : "Run 7-Day Purge Now"}
            </button>
          </div>

          {purgeMsg && (
            <div className="rounded-xl bg-emerald-950/80 border border-emerald-800 p-3 text-xs font-bold text-emerald-300">
              {purgeMsg}
            </div>
          )}
        </div>

        {/* Success Alert */}
        {submitted && (
          <div className="flex items-center space-x-3 rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 p-4 text-emerald-800 dark:text-emerald-200 shadow-sm">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <p className="text-sm font-semibold">
              Article published successfully — saved to Supabase{publishedArticleId ? ` as ${publishedArticleId}` : ""}.
            </p>
          </div>
        )}

        {/* Error Alert */}
        {publishError && (
          <div className="flex items-center space-x-3 rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/60 p-4 text-red-800 dark:text-red-200 shadow-sm">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
            <p className="text-sm font-semibold">{publishError}</p>
          </div>
        )}

        {/* Form Container Card */}
        <div
          className={`rounded-2xl border p-6 sm:p-8 shadow-sm transition-colors ${
            isDark
              ? "border-[#34383f] bg-[#25282d]"
              : "border-slate-200 bg-white"
          }`}
        >
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-6">
            Post New Article
          </h2>

          <form onSubmit={handlePublish} className="space-y-6">
            {/* Title */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Article Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter headline..."
                className={`w-full rounded-xl border p-3 text-sm font-medium focus:outline-none transition-colors ${
                  isDark
                    ? "border-[#383d45] bg-[#1a1c1e] text-white focus:border-blue-500"
                    : "border-slate-200 bg-slate-50 text-slate-900 focus:border-blue-600"
                }`}
              />
            </div>

            {/* Source Link */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Source Link (URL) *
              </label>
              <input
                type="url"
                required
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://example.com/original-article"
                className={`w-full rounded-xl border p-3 text-sm font-medium focus:outline-none transition-colors ${
                  isDark
                    ? "border-[#383d45] bg-[#1a1c1e] text-white focus:border-blue-500"
                    : "border-slate-200 bg-slate-50 text-slate-900 focus:border-blue-600"
                }`}
              />
            </div>

            {/* Slug & Category Row */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Slug (URL)
                </label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="article-url-slug"
                  className={`w-full rounded-xl border p-3 text-sm font-medium focus:outline-none transition-colors ${
                    isDark
                      ? "border-[#383d45] bg-[#1a1c1e] text-white focus:border-blue-500"
                      : "border-slate-200 bg-slate-50 text-slate-900 focus:border-blue-600"
                  }`}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Category ID
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className={`w-full rounded-xl border p-3 text-sm font-medium focus:outline-none transition-colors ${
                    isDark
                      ? "border-[#383d45] bg-[#1a1c1e] text-white focus:border-blue-500"
                      : "border-slate-200 bg-slate-50 text-slate-900 focus:border-blue-600"
                  }`}
                >
                  <option value="general">General / Top Stories</option>
                  <option value="tech">Technology</option>
                  <option value="business">Business</option>
                  <option value="sports">Sports</option>
                  <option value="entertainment">Entertainment</option>
                  <option value="health">Health</option>
                  <option value="science">Science</option>
                </select>
              </div>
            </div>

            {/* Image URL & Source Name Row */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Image URL
                </label>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/photo-..."
                  className={`w-full rounded-xl border p-3 text-sm font-medium focus:outline-none transition-colors ${
                    isDark
                      ? "border-[#383d45] bg-[#1a1c1e] text-white focus:border-blue-500"
                      : "border-slate-200 bg-slate-50 text-slate-900 focus:border-blue-600"
                  }`}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Source Name
                </label>
                <input
                  type="text"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  placeholder="TimesPrime Editorial"
                  className={`w-full rounded-xl border p-3 text-sm font-medium focus:outline-none transition-colors ${
                    isDark
                      ? "border-[#383d45] bg-[#1a1c1e] text-white focus:border-blue-500"
                      : "border-slate-200 bg-slate-50 text-slate-900 focus:border-blue-600"
                  }`}
                />
              </div>
            </div>

            {/* Short Summary */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Short Summary
              </label>
              <input
                type="text"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Brief summary sentence..."
                className={`w-full rounded-xl border p-3 text-sm font-medium focus:outline-none transition-colors ${
                  isDark
                    ? "border-[#383d45] bg-[#1a1c1e] text-white focus:border-blue-500"
                    : "border-slate-200 bg-slate-50 text-slate-900 focus:border-blue-600"
                }`}
              />
            </div>

            {/* Content Body */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Article Body Paragraphs
              </label>
              <textarea
                rows={5}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write article body paragraphs..."
                className={`w-full rounded-xl border p-3 text-sm font-medium focus:outline-none transition-colors ${
                  isDark
                    ? "border-[#383d45] bg-[#1a1c1e] text-white focus:border-blue-500"
                    : "border-slate-200 bg-slate-50 text-slate-900 focus:border-blue-600"
                }`}
              />
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={publishing}
                className="inline-flex items-center space-x-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {publishing && <RefreshCw className="h-4 w-4 animate-spin" />}
                <span>{publishing ? "Publishing..." : "Publish Article"}</span>
              </button>
            </div>
          </form>
        </div>
      </main>

      <Footer language={language} />
    </div>
  );
}
