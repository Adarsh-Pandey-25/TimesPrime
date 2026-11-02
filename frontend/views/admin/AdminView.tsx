"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header, Footer, MarqueeTicker } from "@/frontend/features/news";
import { CheckCircle2, Database, ShieldCheck, RefreshCw, AlertTriangle, LogOut } from "lucide-react";
import { Language } from "@/shared/config/translations";
import { useTheme } from "@/frontend/context/ThemeContext";
import { ArticlesTable, CategoryStatsCard, BreakingNewsManager, SyncDashboard, ActivityLog } from "@/frontend/features/admin";
import type { AdminMe } from "@/shared/types";

// Panel 0: what this page shows depends on GET /api/admin/me, which says what the signed-in user
// holds. Hiding is UX only, never the check: every admin route decides again on the server
// (backend/auth/requirePermission.ts). Each widget is shown for the permission its routes need.

/** "1 January 2027": the day the shared password stops working, in IST. */
function retireDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" });
}

interface DbStats {
  configured: boolean;
  totalStoredArticles: number;
  retentionDays: number;
  databaseType: string;
  note?: string;
  supabaseUrl?: string;
}

export default function AdminDashboardPage() {
  const router = useRouter();
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
  const [purgeMsg, setPurgeMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Who is signed in, and what they hold (Panel 0).
  const [me, setMe] = useState<AdminMe | null>(null);
  const [meError, setMeError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/me", { credentials: "include" });
        if (cancelled) return;
        if (res.status === 401) {
          router.push("/admin/login");
          return;
        }
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) setMeError(data?.error || `Could not load your access (status ${res.status}).`);
        else setMe(data as AdminMe);
      } catch {
        if (!cancelled) setMeError("Network error while loading your access.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  /** Held now, in some scope: "act" for a change, any value for a read. */
  const can = (permission: string, mode: "act" | "read" = "read") =>
    Boolean(me && (mode === "read" ? me.permissions[permission] : me.permissions[permission] === "act"));
  const needsCode = me?.kind === "staff" && me.aal === "aal1" && me.mfa.required;
  const canStats = can("stats.view") && !needsCode;

  const fetchDbStats = async () => {
    try {
      const res = await fetch("/api/admin/db-stats", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setDbStats(data.stats);
      }
    } catch {
      // Ignore
    }
  };

  // Necessary setState-in-effect: DB stats can only come from an async
  // fetch, which can't run synchronously during render. Only once /me says
  // the user may read them (stats.view).
  useEffect(() => {
    if (!canStats) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDbStats();
  }, [canStats]);

  // F-014: success only on res.ok. An error status shows the server's
  // message (the admin routes send `message`, proxy.ts sends `error`), and a
  // thrown request shows why. Both used to read as success, or as nothing.
  const failureText = (action: string, res: Response, data: { message?: string; error?: string } | null) =>
    data?.message || data?.error || `${action} failed (status ${res.status}).`;

  const handleSeedSupabase = async () => {
    setSeeding(true);
    setPurgeMsg(null);
    try {
      const res = await fetch("/api/admin/seed-supabase", { method: "POST", credentials: "include" });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setPurgeMsg({ ok: true, text: data?.message || "All news categories synchronized to Supabase!" });
        fetchDbStats();
      } else {
        setPurgeMsg({ ok: false, text: failureText("Sync", res, data) });
      }
    } catch (err) {
      setPurgeMsg({ ok: false, text: `Sync failed: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setSeeding(false);
    }
  };

  const handleManualPurge = async () => {
    setPurging(true);
    setPurgeMsg(null);
    try {
      const res = await fetch("/api/admin/db-stats", { method: "POST", credentials: "include" });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setPurgeMsg({ ok: true, text: data?.message || "7-Day Purge completed!" });
        setDbStats(data?.stats ?? null);
      } else {
        setPurgeMsg({ ok: false, text: failureText("Purge", res, data) });
      }
    } catch (err) {
      setPurgeMsg({ ok: false, text: `Purge failed: ${err instanceof Error ? err.message : String(err)}` });
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
        credentials: "include",
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

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    } finally {
      router.push("/admin/login");
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
            {me && (
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 font-semibold">
                {me.kind === "staff"
                  ? `Signed in as ${me.displayName}${me.roles.length ? ` · ${me.roles.map((r) => [r.role.replace(/_/g, " "), r.language, r.section].filter(Boolean).join(" ")).join(", ")}` : ""}`
                  : "Signed in with the shared admin password"}
              </p>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-[#383d45] bg-white dark:bg-[#25282d] px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2f333a] transition-colors shrink-0"
          >
            <LogOut className="h-3.5 w-3.5" />
            Logout
          </button>
        </div>

        {me?.kind === "legacy" && (
          <div role="note" className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/40 p-3 text-xs font-semibold text-amber-800 dark:text-amber-200">
            You are using the shared admin password. It stops working on {retireDay(me.retiresAt)}. Ask a Super Admin for a staff account.
          </div>
        )}

        {meError && (
          <div role="alert" className="rounded-xl border border-red-300 bg-red-50 dark:border-red-900/50 dark:bg-red-950/40 p-3 text-xs font-semibold text-red-700 dark:text-red-300">
            {meError}
          </div>
        )}

        {needsCode && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/40 p-3 text-xs font-semibold text-amber-800 dark:text-amber-200">
            Your account needs a second factor. <a href="/admin/login" className="underline">Finish signing in</a> with your authenticator code.
          </div>
        )}

        {!me && !meError && <p className="text-xs text-slate-500 dark:text-slate-400">Checking your access…</p>}

        {me && !needsCode && (
        <>
        {can("sync.view") && <SyncDashboard />}

        {can("breaking_banner.manage", "act") && <BreakingNewsManager />}

        {canStats && <CategoryStatsCard />}

        {/* 7-DAY DATABASE CONTROL PANEL CARD */}
        {(canStats || can("sync.run", "act") || can("content.purge", "act")) && (
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
          {canStats && (
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
          )}

          {/* Manual Controls: sync needs sync.run; the purge needs content.purge, which no role
              holds outright until its approval flow exists (Panel 4), so it is normally hidden. */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            {can("sync.run", "act") && (
            <button
              onClick={handleSeedSupabase}
              disabled={seeding}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${seeding ? "animate-spin" : ""}`} />
              {seeding ? "Syncing All Categories..." : "Sync All Categories Now"}
            </button>
            )}
            {can("content.purge", "act") && (
            <button
              onClick={handleManualPurge}
              disabled={purging}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${purging ? "animate-spin" : ""}`} />
              {purging ? "Purging..." : "Run 7-Day Purge Now"}
            </button>
            )}
          </div>

          {purgeMsg?.ok && (
            <div className="rounded-xl bg-emerald-950/80 border border-emerald-800 p-3 text-xs font-bold text-emerald-300">
              {purgeMsg.text}
            </div>
          )}
          {purgeMsg && !purgeMsg.ok && (
            <div role="alert" className="rounded-xl bg-red-950/40 border border-red-900/50 p-3 text-xs font-bold text-red-300">
              {purgeMsg.text}
            </div>
          )}
        </div>
        )}

        {can("article.publish_direct", "act") && can("article.create", "act") && (
        <>
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
        </>
        )}

        {can("article.view_admin") && <ArticlesTable />}

        {can("audit.read") && <ActivityLog />}
        </>
        )}
      </main>

      <Footer language={language} />
    </div>
  );
}
