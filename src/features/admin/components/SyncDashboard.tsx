"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Clock3, CalendarClock, Database, TimerReset } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

interface StatsResponse {
  totalArticles: number;
  todayArticles: number;
  lastSyncAt: string | null;
}

const SYNC_INTERVAL_MINUTES = 30;

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

/** "Next sync" is a display estimate (last sync + 30 min), not a real
 * schedule read from Vercel — there's no API for that here. */
function nextSyncLabel(lastSyncAt: string | null): string {
  if (!lastSyncAt) return "—";
  const dueAt = new Date(lastSyncAt).getTime() + SYNC_INTERVAL_MINUTES * 60 * 1000;
  const diff = dueAt - Date.now();
  if (diff <= 0) return "Due now";
  const mins = Math.ceil(diff / 60000);
  return `in ${mins} min${mins === 1 ? "" : "s"}`;
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

/**
 * Sync status overview for the admin panel: last/next sync time, article
 * counts, and a manual "Sync Now" button (POSTs to the existing
 * seed-supabase endpoint). Self-contained — owns its own fetch/sync state
 * and renders its own card + heading.
 */
export default function SyncDashboard() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/stats", { credentials: "include" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load sync status.");
        return;
      }

      setStats(data as StatsResponse);
    } catch {
      setError("Network error while loading sync status.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Necessary setState-in-effect: stats can only come from an async
  // fetch, which can't run synchronously during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStats();
  }, [fetchStats]);

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncMessage("");
    setError("");
    try {
      const res = await fetch("/api/admin/seed-supabase", { method: "POST", credentials: "include" });
      const data = await res.json();

      if (res.ok) {
        setSyncMessage(data.message || "Sync complete.");
        fetchStats();
      } else {
        setError(data.message || "Sync failed.");
      }
    } catch {
      setError("Network error while syncing.");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(""), 5000);
    }
  };

  return (
    <div
      className={`rounded-2xl border p-6 sm:p-8 shadow-sm transition-colors space-y-5 ${
        isDark ? "border-[#34383f] bg-[#25282d]" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
          <RefreshCw className="h-4 w-4 text-red-600" />
          Sync Dashboard
        </h2>
        <button
          onClick={handleSyncNow}
          disabled={syncing}
          className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync Now"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 dark:border-red-900/50 dark:bg-red-950/40 p-3 text-xs font-semibold text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {syncMessage && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/40 p-3 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          {syncMessage}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className={`h-16 rounded-xl animate-pulse ${isDark ? "bg-slate-900" : "bg-slate-100"}`} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            icon={<Clock3 className="h-3 w-3" />}
            label="Last Sync"
            value={stats?.lastSyncAt ? timeAgo(stats.lastSyncAt) : "—"}
            isDark={isDark}
          />
          <StatTile
            icon={<TimerReset className="h-3 w-3" />}
            label="Next Sync"
            value={stats?.lastSyncAt ? nextSyncLabel(stats.lastSyncAt) : "—"}
            isDark={isDark}
          />
          <StatTile
            icon={<Database className="h-3 w-3" />}
            label="Articles in DB"
            value={stats ? stats.totalArticles.toLocaleString() : "—"}
            isDark={isDark}
          />
          <StatTile
            icon={<CalendarClock className="h-3 w-3" />}
            label="Today's Articles"
            value={stats ? stats.todayArticles.toLocaleString() : "—"}
            isDark={isDark}
          />
        </div>
      )}

      <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>
        <span>Auto-sync: Every {SYNC_INTERVAL_MINUTES} minutes</span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Vercel Cron: Active
        </span>
      </div>
    </div>
  );
}
