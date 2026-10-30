"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Radio, Trash2, Megaphone } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

interface BreakingNewsItem {
  id: string;
  text: string;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

interface BreakingNewsListResponse {
  items: BreakingNewsItem[];
}

const EXPIRY_OPTIONS: { label: string; hours: number | null }[] = [
  { label: "1 Hour", hours: 1 },
  { label: "6 Hours", hours: 6 },
  { label: "12 Hours", hours: 12 },
  { label: "24 Hours", hours: 24 },
  { label: "Never", hours: null },
];

const MAX_TEXT_LENGTH = 500;

// timeAgo (from CategoryStatsCard.tsx) is for a PAST timestamp
// (created_at). expires_at is a FUTURE timestamp, so this is its mirror —
// same bucketing, "in X" phrasing instead of "X ago", plus an explicit
// "Expired" case for an item that hasn't been refetched since it lapsed.
function expiresIn(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Expires in <1 min";
  if (mins < 60) return `Expires in ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Expires in ${hrs} hour${hrs > 1 ? "s" : ""}`;
  const days = Math.floor(hrs / 24);
  return `Expires in ${days} day${days > 1 ? "s" : ""}`;
}

/**
 * Admin panel for the homepage breaking-news banner: lists active items
 * (soft-delete via "Remove") and a form to add a new one with an optional
 * expiry. Self-contained — owns its own fetch/form state and renders its
 * own card + heading.
 */
export default function BreakingNewsManager() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [items, setItems] = useState<BreakingNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [expiryHours, setExpiryHours] = useState<number | null>(24);
  const [submitting, setSubmitting] = useState(false);

  const flashSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(""), 4000);
  };

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/breaking-news", { credentials: "include" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load breaking news.");
        setItems([]);
        return;
      }

      setItems((data as BreakingNewsListResponse).items);
    } catch {
      setError("Network error while loading breaking news.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Necessary setState-in-effect: the list can only come from an async
  // fetch, which can't run synchronously during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchItems();
  }, [fetchItems]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/breaking-news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text: trimmed, expires_in_hours: expiryHours }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Failed to set breaking news.");
        return;
      }

      setText("");
      setExpiryHours(24);
      flashSuccess("Breaking news set.");
      fetchItems();
    } catch {
      setError("Network error while setting breaking news.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    setError("");
    try {
      const res = await fetch("/api/admin/breaking-news", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id }),
      });

      if (res.ok) {
        flashSuccess("Breaking news removed.");
        fetchItems();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to remove breaking news.");
      }
    } catch {
      setError("Network error while removing breaking news.");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div
      className={`rounded-2xl border p-6 sm:p-8 shadow-sm transition-colors space-y-6 ${
        isDark ? "border-[#34383f] bg-[#25282d]" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
          <Radio className="h-4 w-4 text-red-600" />
          Breaking News Manager
        </h2>
        <button
          onClick={fetchItems}
          disabled={loading}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
            isDark ? "border-[#383d45] text-slate-200 hover:bg-[#2f333a]" : "border-slate-200 text-slate-700 hover:bg-slate-100"
          }`}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 dark:border-red-900/50 dark:bg-red-950/40 p-3 text-xs font-semibold text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/40 p-3 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          {successMessage}
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Active Breaking News
        </h3>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, idx) => (
              <div key={idx} className={`h-14 rounded-xl animate-pulse ${isDark ? "bg-slate-900" : "bg-slate-100"}`} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center">
            <Megaphone className="h-6 w-6 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
            <p className="text-slate-500 dark:text-slate-400 font-semibold text-sm">No active breaking news</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 ${
                  isDark ? "border-[#383d45] bg-[#1f2226]" : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 line-clamp-2">{item.text}</p>
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {item.expires_at ? expiresIn(item.expires_at) : "Never expires"}
                  </span>
                </div>
                <button
                  onClick={() => handleRemove(item.id)}
                  disabled={removingId === item.id}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900/50 px-2.5 py-1.5 text-[11px] font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="h-3 w-3" />
                  {removingId === item.id ? "Removing..." : "Remove"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`space-y-3 pt-4 border-t ${isDark ? "border-[#2b2f36]" : "border-slate-200"}`}>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Add New Breaking News
        </h3>
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="space-y-1">
            <textarea
              rows={2}
              maxLength={MAX_TEXT_LENGTH}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter breaking news text..."
              className={`w-full rounded-xl border p-3 text-sm font-medium focus:outline-none transition-colors ${
                isDark
                  ? "border-[#383d45] bg-[#1a1c1e] text-white focus:border-blue-500"
                  : "border-slate-200 bg-slate-50 text-slate-900 focus:border-blue-600"
              }`}
            />
            <div className="text-right text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {text.length}/{MAX_TEXT_LENGTH}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={expiryHours === null ? "never" : String(expiryHours)}
              onChange={(e) => setExpiryHours(e.target.value === "never" ? null : Number(e.target.value))}
              className={`rounded-xl border px-3 py-2.5 text-sm font-medium focus:outline-none transition-colors ${
                isDark
                  ? "border-[#383d45] bg-[#1a1c1e] text-white focus:border-blue-500"
                  : "border-slate-200 bg-slate-50 text-slate-900 focus:border-blue-600"
              }`}
            >
              {EXPIRY_OPTIONS.map((opt) => (
                <option key={opt.label} value={opt.hours === null ? "never" : opt.hours}>
                  {opt.label}
                </option>
              ))}
            </select>

            <button
              type="submit"
              disabled={submitting || !text.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
              {submitting ? "Setting..." : "Set Breaking News"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
