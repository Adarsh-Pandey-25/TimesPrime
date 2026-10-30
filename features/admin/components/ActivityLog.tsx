"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, History, Trash2, Inbox, ChevronLeft, ChevronRight } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import type { AdminAction, AdminLog } from "@/shared/types";
import { ACTION_LABELS, ACTION_ICONS } from "./actionLabels";

interface LogsResponse {
  logs: AdminLog[];
  total: number;
  page: number;
  totalPages: number;
}

const PAGE_SIZE = 10;
const AUTO_REFRESH_MS = 30 * 1000;

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

// Delete-family and "removed" actions -> red, edit -> yellow, publish/set
// (positive creation) actions -> green, sync/seed (automated bulk-refresh)
// actions -> blue, purge -> orange. breaking_news_removed isn't one of the
// task's 5 named buckets — bucketed under red as the closest match (a
// removal, same family as delete).
const ACTION_COLOR_CLASSES: Record<AdminAction, string> = {
  article_deleted: "border-l-red-500 bg-red-50 dark:bg-red-950/20",
  articles_bulk_deleted: "border-l-red-500 bg-red-50 dark:bg-red-950/20",
  breaking_news_removed: "border-l-red-500 bg-red-50 dark:bg-red-950/20",
  article_edited: "border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950/20",
  article_published: "border-l-green-500 bg-green-50 dark:bg-green-950/20",
  breaking_news_set: "border-l-green-500 bg-green-50 dark:bg-green-950/20",
  news_synced: "border-l-blue-500 bg-blue-50 dark:bg-blue-950/20",
  categories_seeded: "border-l-blue-500 bg-blue-50 dark:bg-blue-950/20",
  database_purged: "border-l-orange-500 bg-orange-50 dark:bg-orange-950/20",
};

/**
 * Timeline view of every logged admin action (backend/repositories/auditLog.ts),
 * paginated 10-per-page with a 30s auto-refresh and a destructive
 * "Clear All Logs" action. Self-contained — owns its own fetch/pagination
 * state and renders its own card + heading.
 */
export default function ActivityLog() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [clearing, setClearing] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/logs?page=${page}&limit=${PAGE_SIZE}`, {
        credentials: "include",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load activity log.");
        setLogs([]);
        setTotal(0);
        setTotalPages(1);
        return;
      }

      const payload = data as LogsResponse;
      setLogs(payload.logs);
      setTotal(payload.total);
      setTotalPages(payload.totalPages);
    } catch {
      setError("Network error while loading activity log.");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  // Necessary setState-in-effect: logs can only come from an async fetch,
  // which can't run synchronously during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs();
    const interval = setInterval(fetchLogs, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  const handleClearAll = async () => {
    if (!window.confirm("Clear the entire activity log? This cannot be undone.")) return;

    setClearing(true);
    setError("");
    try {
      const res = await fetch("/api/admin/logs", { method: "DELETE", credentials: "include" });
      if (res.ok) {
        setPage(1);
        fetchLogs();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to clear activity log.");
      }
    } catch {
      setError("Network error while clearing activity log.");
    } finally {
      setClearing(false);
    }
  };

  return (
    <div
      className={`rounded-2xl border p-6 sm:p-8 shadow-sm transition-colors space-y-5 ${
        isDark ? "border-[#34383f] bg-[#25282d]" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
          <History className="h-4 w-4 text-red-600" />
          Activity Log{total > 0 ? ` (${total})` : ""}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchLogs}
            disabled={loading}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
              isDark ? "border-[#383d45] text-slate-200 hover:bg-[#2f333a]" : "border-slate-200 text-slate-700 hover:bg-slate-100"
            }`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={handleClearAll}
            disabled={clearing || total === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {clearing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {clearing ? "Clearing..." : "Clear All Logs"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 dark:border-red-900/50 dark:bg-red-950/40 p-3 text-xs font-semibold text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className={`h-14 rounded-xl animate-pulse ${isDark ? "bg-slate-900" : "bg-slate-100"}`} />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="py-10 text-center">
          <Inbox className="h-6 w-6 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-slate-500 dark:text-slate-400 font-semibold text-sm">No activity recorded yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div
              key={log.id}
              className={`flex items-start gap-3 rounded-xl border-l-4 p-3.5 ${
                ACTION_COLOR_CLASSES[log.action] || "border-l-slate-400 bg-slate-50 dark:bg-slate-900/30"
              }`}
            >
              <span className="text-base leading-none shrink-0" aria-hidden="true">
                {ACTION_ICONS[log.action] || "•"}
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    {ACTION_LABELS[log.action] || log.action}
                  </span>
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {timeAgo(log.created_at)}
                  </span>
                </div>
                {log.details && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-1">{log.details}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && total > 0 && (
        <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-[#2b2f36]">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                isDark ? "border-[#383d45] text-slate-200 hover:bg-[#2f333a]" : "border-slate-200 text-slate-700 hover:bg-slate-100"
              }`}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                isDark ? "border-[#383d45] text-slate-200 hover:bg-[#2f333a]" : "border-slate-200 text-slate-700 hover:bg-slate-100"
              }`}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
