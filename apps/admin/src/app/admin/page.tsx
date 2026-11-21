"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AdminTopBar from "@/components/AdminTopBar";
import Link from "next/link";
import { ArrowRight, Database, Megaphone, ShieldCheck, RefreshCw, Send } from "lucide-react";
import ArticlesTable from "@/components/ArticlesTable";
import CategoryStatsCard from "@/components/CategoryStatsCard";
import SyncDashboard from "@/components/SyncDashboard";
import ActivityLog from "@/components/ActivityLog";
import GrievancesCard from "@/components/compliance/GrievancesCard";
import ActionMessage from "@/components/ui/ActionMessage";
import { badge, button, buttonDanger, buttonPrimary, card, cardTitle, field, hint, label, pageTitle, tone } from "@/components/ui/styles";
import type { AdminMe } from "@timesprime/shared/types";

// Panel 0: what this page shows depends on GET /api/admin/me, which says what the signed-in user
// holds. Hiding is UX only, never the check: every admin route decides again on the server
// (packages/server/src/auth/requirePermission.ts). Each widget is shown for the permission its routes need.
//
// In the order a visit needs it (the owner, 19 Nov 2026): the numbers (the live statistics beside
// the 7-day retention); the articles list, the day's work; publishing (a new article beside the
// way to the breaking-news banner, which is on the Front page screen since Panel 3's M2, decision 5);
// the news sync; then the activity log.

interface DbStats {
  configured: boolean;
  totalStoredArticles: number;
  retentionDays: number;
  databaseType: string;
  note?: string;
  supabaseUrl?: string;
}

/** A small figure in a card: its label above, its value below. */
function Tile({ label: name, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-[#2b2f36] dark:bg-[#25282d]">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{name}</span>
      {children}
    </div>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();

  // Form State
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [link, setLink] = useState("");
  const [categoryId, setCategoryId] = useState("general");
  const [imageUrl, setImageUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState<{ ok: boolean; text: string } | null>(null);

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

  /** Held now, in some scope: "act" for a change; any of act, read or ask for a read (the matrix's A
   * counts as read: Panel 1 approval, 19 Nov 2026). The server decides either way. */
  const can = (permission: string, mode: "act" | "read" = "read") => {
    const held = me?.permissions[permission];
    return mode === "read" ? held === "act" || held === "read" || held === "ask" : held === "act";
  };
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
  // message (the admin routes send `message`, apps/admin/src/proxy.ts sends `error`), and a
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
    setPublishMsg(null);

    if (!title.trim() || !link.trim() || !categoryId) {
      setPublishMsg({ ok: false, text: "Title, Source Link, and Category are required." });
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
        setPublishMsg({ ok: false, text: data.error || `Failed to publish (status ${res.status}).` });
        return;
      }

      const id = data.article?.article_id || null;
      setPublishMsg({ ok: true, text: `Article published successfully — saved to Supabase${id ? ` as ${id}` : ""}.` });
      setTitle("");
      setSlug("");
      setLink("");
      setCategoryId("general");
      setImageUrl("");
      setSourceName("");
      setSummary("");
      setContent("");
    } catch (err) {
      setPublishMsg({ ok: false, text: err instanceof Error ? err.message : "Network error while publishing." });
    } finally {
      setPublishing(false);
    }
  };

  const showRetention = canStats || can("sync.run", "act") || can("content.purge", "act");
  const canPublish = can("article.publish_direct", "act") && can("article.create", "act");
  const canBanner = can("breaking_banner.manage", "act");

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-[#1a1c1e] dark:text-slate-100">
      <AdminTopBar />

      <main className="mx-auto w-full max-w-[1500px] flex-1 space-y-6 px-4 py-6 sm:px-8 lg:px-10">
        <header className="space-y-1">
          <h1 className={pageTitle}>Dashboard</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            The news the site carries, the articles list, publishing and the activity log: each part shows for the roles that may use it.
          </p>
        </header>

        {meError && (
          <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {meError}
          </div>
        )}

        {needsCode && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
            Your account needs a second factor. <a href="/admin/login" className="underline">Finish signing in</a> with your authenticator code.
          </div>
        )}

        {!me && !meError && <p role="status" className="text-sm text-slate-500 dark:text-slate-400">Checking your access…</p>}

        {me && !needsCode && (
          <>
            {/* 1. The numbers: the live statistics beside the 7-day retention. */}
            {(canStats || showRetention) && (
              <div className={`grid items-start gap-6 ${canStats && showRetention ? "xl:grid-cols-3" : ""}`}>
                {canStats && (
                  <div className={showRetention ? "xl:col-span-2" : ""}>
                    <CategoryStatsCard />
                  </div>
                )}

                {showRetention && (
                  <section aria-label="7-day news retention" className={`${card} space-y-4`}>
                    <div className="flex items-start gap-3">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.red}`}>
                        <Database aria-hidden="true" className="h-5 w-5" />
                      </span>
                      <div className="space-y-1">
                        <h2 className={`${cardTitle} flex flex-wrap items-center gap-2`}>
                          <span>7-Day News Retention Engine</span>
                          <span className={`${badge} ${tone.green} font-sans uppercase tracking-wider`}>Auto-Purge Active</span>
                        </h2>
                        <p className={hint}>Every article is stored in database for 7 days. Articles exceeding 7 days are automatically deleted.</p>
                      </div>
                    </div>

                    {canStats && (
                      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                        <Tile label="Total Stored Articles">
                          <p className="text-xl font-black">{dbStats ? dbStats.totalStoredArticles : "Loading..."}</p>
                        </Tile>
                        <Tile label="Retention Window">
                          <p className="text-xl font-black text-amber-600 dark:text-amber-400">7 Days</p>
                        </Tile>
                        <Tile label="Purge Rule">
                          <p className="mt-1 flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
                            Automatic Cleanup
                          </p>
                        </Tile>
                      </div>
                    )}

                    {/* Manual controls: sync needs sync.run; the purge needs content.purge, which no role
                        holds outright until its approval flow exists (Panel 4), so it is normally hidden. */}
                    {(can("sync.run", "act") || can("content.purge", "act")) && (
                      <div className="flex flex-wrap gap-2">
                        {can("sync.run", "act") && (
                          <button onClick={handleSeedSupabase} disabled={seeding} className={buttonPrimary}>
                            <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${seeding ? "animate-spin" : ""}`} />
                            {seeding ? "Syncing All Categories..." : "Sync All Categories Now"}
                          </button>
                        )}
                        {can("content.purge", "act") && (
                          <button onClick={handleManualPurge} disabled={purging} className={buttonDanger}>
                            <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${purging ? "animate-spin" : ""}`} />
                            {purging ? "Purging..." : "Run 7-Day Purge Now"}
                          </button>
                        )}
                      </div>
                    )}
                    <ActionMessage message={purgeMsg} />
                  </section>
                )}
              </div>
            )}

            {/* 2. The articles list: the day's work. */}
            {can("article.view_admin") && <ArticlesTable />}

            {/* 3. Publishing: a new article beside the breaking-news banner. */}
            {(canPublish || canBanner) && (
              <div className={`grid items-start gap-6 ${canPublish && canBanner ? "xl:grid-cols-2" : ""}`}>
                {canPublish && (
                  <section aria-label="Post a new article" className={`${card} space-y-5`}>
                    <div className="flex items-center gap-3">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.blue}`}>
                        <Send aria-hidden="true" className="h-5 w-5" />
                      </span>
                      <h2 className={cardTitle}>Post New Article</h2>
                    </div>

                    <form onSubmit={handlePublish} className="space-y-4">
                      <label className={label}>
                        Article Title *
                        <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter headline..." className={`${field} mt-1`} />
                      </label>
                      <label className={label}>
                        Source Link (URL) *
                        <input type="url" required value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://example.com/original-article" className={`${field} mt-1`} />
                      </label>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className={label}>
                          Slug (URL)
                          <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="article-url-slug" className={`${field} mt-1`} />
                        </label>
                        <div>
                          <label htmlFor="publish-category" className={label}>
                            Category ID
                          </label>
                          <select id="publish-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={`${field} mt-1`}>
                            <option value="general">General / Top Stories</option>
                            <option value="tech">Technology</option>
                            <option value="business">Business</option>
                            <option value="sports">Sports</option>
                            <option value="entertainment">Entertainment</option>
                            <option value="health">Health</option>
                            <option value="science">Science</option>
                          </select>
                        </div>
                        <label className={label}>
                          Image URL
                          <input type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://images.unsplash.com/photo-..." className={`${field} mt-1`} />
                        </label>
                        <label className={label}>
                          Source Name
                          <input type="text" value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="TimesPrime Editorial" className={`${field} mt-1`} />
                        </label>
                      </div>
                      <label className={label}>
                        Short Summary
                        <input type="text" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Brief summary sentence..." className={`${field} mt-1`} />
                      </label>
                      <label className={label}>
                        Article Body Paragraphs
                        <textarea rows={5} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Write article body paragraphs..." className={`${field} mt-1`} />
                      </label>

                      <ActionMessage message={publishMsg} />
                      <div className="flex justify-end border-t border-slate-100 pt-4 dark:border-[#2b2f36]">
                        <button type="submit" disabled={publishing} className={buttonPrimary}>
                          {publishing && <RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin" />}
                          <span>{publishing ? "Publishing..." : "Publish Article"}</span>
                        </button>
                      </div>
                    </form>
                  </section>
                )}

                {/* Panel 3, M2 (decision 5): the banner is managed on the Front page screen. */}
                {canBanner && (
                  <section aria-label="Breaking news banner" className={`${card} space-y-3`}>
                    <div className="flex items-center gap-3">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.red}`}>
                        <Megaphone aria-hidden="true" className="h-5 w-5" />
                      </span>
                      <h2 className={cardTitle}>Breaking News Banner</h2>
                    </div>
                    <p className={hint}>The banner is set and removed on the Front page screen, beside the pinned stories.</p>
                    <Link href="/admin/front-page" className={button}>
                      Open the Front page
                      <ArrowRight aria-hidden="true" className="h-4 w-4" />
                    </Link>
                  </section>
                )}
              </div>
            )}

            {/* Panel 7, M1: the open grievances and the late ones, for whoever holds grievance.handle. */}
            {can("grievance.handle") && <GrievancesCard />}

            {/* 4. The news sync. */}
            {can("sync.view") && <SyncDashboard />}

            {/* 5. What was done, and by whom. */}
            {can("audit.read") && <ActivityLog />}
          </>
        )}
      </main>
    </div>
  );
}
