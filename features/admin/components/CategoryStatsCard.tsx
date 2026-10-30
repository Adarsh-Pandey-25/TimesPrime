"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, FileText, CalendarClock, Clock3, Languages, Layers } from "lucide-react";
import { useTheme } from "@/frontend/context/ThemeContext";

interface CategoryBreakdownEntry {
  category: string;
  count: number;
}

interface LanguageBreakdownEntry {
  language: string;
  count: number;
}

interface CountryBreakdownEntry {
  country: string;
  count: number;
}

interface StatsResponse {
  totalArticles: number;
  todayArticles: number;
  lastSyncAt: string | null;
  categoryBreakdown: CategoryBreakdownEntry[];
  languageBreakdown: LanguageBreakdownEntry[];
  countryBreakdown: CountryBreakdownEntry[];
}

// Keyed by the exact stored value (verified against live data — the
// country column holds full lowercase country names like "india" and
// "united states of america", not ISO codes) so the top-5-by-volume list
// from the API can be looked up directly. Covers the requested 5 plus the
// rest of the real observed top 10; anything else falls back to a
// title-cased raw value with a generic globe flag rather than rendering
// blank.
const COUNTRY_INFO: Record<string, { name: string; flag: string }> = {
  india: { name: "India", flag: "🇮🇳" },
  "united states of america": { name: "United States", flag: "🇺🇸" },
  "united kingdom": { name: "United Kingdom", flag: "🇬🇧" },
  australia: { name: "Australia", flag: "🇦🇺" },
  canada: { name: "Canada", flag: "🇨🇦" },
  china: { name: "China", flag: "🇨🇳" },
  singapore: { name: "Singapore", flag: "🇸🇬" },
  japan: { name: "Japan", flag: "🇯🇵" },
  israel: { name: "Israel", flag: "🇮🇱" },
  iran: { name: "Iran", flag: "🇮🇷" },
};

function countryDisplay(country: string): { name: string; flag: string } {
  return (
    COUNTRY_INFO[country] || {
      name: country.replace(/\b\w/g, (c) => c.toUpperCase()),
      flag: "🌐",
    }
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  top: "bg-blue-500",
  technology: "bg-purple-500",
  business: "bg-green-500",
  sports: "bg-orange-500",
  entertainment: "bg-pink-500",
  health: "bg-red-500",
  science: "bg-cyan-500",
  politics: "bg-yellow-500",
  world: "bg-indigo-500",
  general: "bg-slate-500",
};
const DEFAULT_CATEGORY_COLOR = "bg-slate-400";

const AUTO_REFRESH_MS = 5 * 60 * 1000;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

// The stored language column has real spelling drift ("en" vs "english",
// "hi" vs "hindi" — both variants exist in live data), so the two-bucket
// English/Hindi summary this card shows has to fold every variant into one
// of two buckets rather than trust the raw value to already be normalized.
function languageBucket(language: string): "English" | "Hindi" | "Other" {
  const lower = language.toLowerCase();
  if (lower.startsWith("en")) return "English";
  if (lower.startsWith("hi")) return "Hindi";
  return "Other";
}

function shortLanguageLabel(bucket: "English" | "Hindi" | "Other"): string {
  if (bucket === "English") return "EN";
  if (bucket === "Hindi") return "HI";
  return "?";
}

interface StatTileProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  isDark: boolean;
}

function StatTile({ icon, label, value, isDark }: StatTileProps) {
  return (
    <div className={`rounded-xl border p-3.5 space-y-1 ${isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50"}`}>
      <span className="flex items-center gap-1.5 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
        {icon}
        {label}
      </span>
      <p className={`text-xl font-black ${isDark ? "text-white" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

interface BreakdownBarProps {
  label: string;
  count: number;
  total: number;
  colorClass: string;
  isDark: boolean;
}

function BreakdownBar({ label, count, total, colorClass, isDark }: BreakdownBarProps) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className={`font-semibold capitalize ${isDark ? "text-slate-300" : "text-slate-700"}`}>{label}</span>
        <span className="text-slate-500 dark:text-slate-400 font-medium">
          {count} &middot; {pct.toFixed(1)}%
        </span>
      </div>
      <div className={`h-2 w-full overflow-hidden rounded-full ${isDark ? "bg-slate-800" : "bg-slate-200"}`}>
        <div className={`h-full rounded-full ${colorClass} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * Live admin dashboard stats: total/today article counts, last-sync time,
 * category breakdown with progress bars, and an English/Hindi language
 * ratio. Self-contained — fetches on mount, auto-refreshes every 5
 * minutes, and exposes a manual refresh button.
 */
export default function CategoryStatsCard() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchStats = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      const res = await fetch("/api/admin/stats", { credentials: "include" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load statistics.");
        return;
      }

      setStats(data as StatsResponse);
    } catch {
      setError("Network error while loading statistics.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Necessary setState-in-effect: stats can only come from an async fetch,
  // which can't run synchronously during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStats();
    const interval = setInterval(fetchStats, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const languageTotals = { English: 0, Hindi: 0, Other: 0 };
  if (stats) {
    for (const entry of stats.languageBreakdown) {
      languageTotals[languageBucket(entry.language)] += entry.count;
    }
  }
  const languageGrandTotal = languageTotals.English + languageTotals.Hindi + languageTotals.Other;

  const activeLanguages = stats
    ? (["English", "Hindi", "Other"] as const)
        .filter((bucket) => languageTotals[bucket] > 0)
        .map(shortLanguageLabel)
        .join(" + ") || "—"
    : "—";

  return (
    <div
      className={`rounded-2xl border p-6 shadow-sm transition-colors space-y-5 ${
        isDark ? "border-[#34383f] bg-[#25282d]" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Live Statistics</h2>
        <button
          onClick={fetchStats}
          disabled={refreshing}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
            isDark ? "border-[#383d45] text-slate-200 hover:bg-[#2f333a]" : "border-slate-200 text-slate-700 hover:bg-slate-100"
          }`}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 dark:border-red-900/50 dark:bg-red-950/40 p-3 text-xs font-semibold text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className={`h-16 rounded-xl animate-pulse ${isDark ? "bg-slate-900" : "bg-slate-100"}`} />
            ))}
          </div>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className={`h-6 rounded-lg animate-pulse ${isDark ? "bg-slate-900" : "bg-slate-100"}`} />
            ))}
          </div>
        </div>
      ) : !stats || stats.totalArticles === 0 ? (
        <div className="py-10 text-center">
          <Layers className="h-6 w-6 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-slate-500 dark:text-slate-400 font-semibold text-sm">No article data yet.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              icon={<FileText className="h-3 w-3" />}
              label="Total Articles"
              value={stats.totalArticles.toLocaleString()}
              isDark={isDark}
            />
            <StatTile
              icon={<CalendarClock className="h-3 w-3" />}
              label="Today's Articles"
              value={stats.todayArticles.toLocaleString()}
              isDark={isDark}
            />
            <StatTile
              icon={<Clock3 className="h-3 w-3" />}
              label="Last Sync"
              value={stats.lastSyncAt ? timeAgo(stats.lastSyncAt) : "—"}
              isDark={isDark}
            />
            <StatTile
              icon={<Languages className="h-3 w-3" />}
              label="Active Languages"
              value={activeLanguages}
              isDark={isDark}
            />
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Category Breakdown
            </h3>
            {stats.categoryBreakdown.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No categorized articles yet.</p>
            ) : (
              <div className="space-y-2.5">
                {stats.categoryBreakdown.map((entry) => (
                  <BreakdownBar
                    key={entry.category}
                    label={entry.category}
                    count={entry.count}
                    total={stats.totalArticles}
                    colorClass={CATEGORY_COLORS[entry.category] || DEFAULT_CATEGORY_COLOR}
                    isDark={isDark}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Language Ratio
            </h3>
            <div className="space-y-2.5">
              <BreakdownBar
                label="English 🇬🇧"
                count={languageTotals.English}
                total={languageGrandTotal}
                colorClass="bg-blue-500"
                isDark={isDark}
              />
              <BreakdownBar
                label="Hindi 🇮🇳"
                count={languageTotals.Hindi}
                total={languageGrandTotal}
                colorClass="bg-orange-500"
                isDark={isDark}
              />
              {languageTotals.Other > 0 && (
                <BreakdownBar
                  label="Other"
                  count={languageTotals.Other}
                  total={languageGrandTotal}
                  colorClass="bg-slate-400"
                  isDark={isDark}
                />
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Top Countries
            </h3>
            {stats.countryBreakdown.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No country data yet.</p>
            ) : (
              <div className="space-y-2.5">
                {stats.countryBreakdown.map((entry) => {
                  const { name, flag } = countryDisplay(entry.country);
                  return (
                    <BreakdownBar
                      key={entry.country}
                      label={`${flag} ${name}`}
                      count={entry.count}
                      total={stats.totalArticles}
                      colorClass={entry.country === "india" ? "bg-blue-500" : "bg-slate-400"}
                      isDark={isDark}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
