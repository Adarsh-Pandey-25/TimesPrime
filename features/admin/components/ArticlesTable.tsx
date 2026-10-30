"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Newspaper,
  Pencil,
  Eye,
  X,
  RefreshCw,
  ExternalLink,
  Clock,
} from "lucide-react";
import { useTheme } from "@/frontend/context/ThemeContext";

interface AdminArticle {
  id: string;
  article_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  link: string | null;
  source_name: string | null;
  category: string[] | null;
  language: string | null;
  created_at: string;
}

interface ArticlesResponse {
  articles: AdminArticle[];
  total: number;
  page: number;
  totalPages: number;
}

// Values match what's actually stored in Supabase's category column
// (verified against live data), not always the display label — NewsData.io
// writes "technology", not "tech". "india" is a special case, not a real
// category value at all: no stored row uses category="india"
// (India-origin articles are tagged via the country column instead), so
// selecting it filters by country=in instead of category=india — see
// fetchArticles below.
const CATEGORY_OPTIONS = [
  { value: "general", label: "All Categories" },
  { value: "india", label: "India" },
  { value: "world", label: "World" },
  { value: "technology", label: "Technology" },
  { value: "business", label: "Business" },
  { value: "sports", label: "Sports" },
  { value: "entertainment", label: "Entertainment" },
  { value: "health", label: "Health" },
  { value: "science", label: "Science" },
];

// Same set of real category values as above, but framed for tagging an
// article rather than filtering the list ("General" as an actual value,
// not a "show everything" placeholder).
const EDIT_CATEGORY_OPTIONS = [
  { value: "general", label: "General" },
  { value: "world", label: "World" },
  { value: "technology", label: "Technology" },
  { value: "business", label: "Business" },
  { value: "sports", label: "Sports" },
  { value: "entertainment", label: "Entertainment" },
  { value: "health", label: "Health" },
  { value: "science", label: "Science" },
];

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface EditFormState {
  title: string;
  description: string;
  image_url: string;
  source_name: string;
  category: string;
  language: string;
}

function fieldClasses(isDark: boolean): string {
  return `w-full rounded-xl border p-3 text-sm font-medium focus:outline-none transition-colors ${
    isDark
      ? "border-[#383d45] bg-[#1a1c1e] text-white focus:border-blue-500"
      : "border-slate-200 bg-slate-50 text-slate-900 focus:border-blue-600"
  }`;
}

function labelClasses(): string {
  return "block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2";
}

interface EditArticleModalProps {
  article: AdminArticle;
  isDark: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function EditArticleModal({ article, isDark, onClose, onSaved }: EditArticleModalProps) {
  const [form, setForm] = useState<EditFormState>({
    title: article.title,
    description: article.description || "",
    image_url: article.image_url || "",
    source_name: article.source_name || "",
    category: article.category?.[0] || "general",
    language: article.language === "hi" ? "hi" : "en",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/articles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          article_id: article.article_id,
          title: form.title,
          description: form.description,
          image_url: form.image_url,
          source_name: form.source_name,
          category: [form.category],
          language: form.language,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Failed to save changes.");
        return;
      }

      onSaved();
    } catch {
      setError("Network error while saving changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className={`relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-6 shadow-xl ${
          isDark ? "bg-[#25282d] text-slate-100" : "bg-white text-slate-900"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold">Edit Article</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#2f333a] transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 dark:border-red-900/50 dark:bg-red-950/40 p-3 text-xs font-semibold text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClasses()}>Title</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className={fieldClasses(isDark)}
            />
          </div>

          <div>
            <label className={labelClasses()}>Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className={fieldClasses(isDark)}
            />
          </div>

          <div>
            <label className={labelClasses()}>Image URL</label>
            <input
              type="text"
              value={form.image_url}
              onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
              className={fieldClasses(isDark)}
            />
          </div>

          <div>
            <label className={labelClasses()}>Source Name</label>
            <input
              type="text"
              value={form.source_name}
              onChange={(e) => setForm((f) => ({ ...f, source_name: e.target.value }))}
              className={fieldClasses(isDark)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClasses()}>Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className={fieldClasses(isDark)}
              >
                {EDIT_CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClasses()}>Language</label>
              <select
                value={form.language}
                onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
                className={fieldClasses(isDark)}
              >
                <option value="en">English</option>
                <option value="hi">Hindi</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className={`rounded-xl border px-4 py-2.5 text-sm font-bold transition-colors ${
                isDark ? "border-[#383d45] text-slate-200 hover:bg-[#2f333a]" : "border-slate-200 text-slate-700 hover:bg-slate-100"
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving && <RefreshCw className="h-4 w-4 animate-spin" />}
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface PreviewArticleModalProps {
  article: AdminArticle;
  isDark: boolean;
  onClose: () => void;
}

function PreviewArticleModal({ article, isDark, onClose }: PreviewArticleModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className={`relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl shadow-xl ${
          isDark ? "bg-[#25282d] text-slate-100" : "bg-white text-slate-900"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-lg bg-black/40 p-1.5 text-white hover:bg-black/60 transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {article.image_url && (
          // Admin-entered URLs may not be in the next/image remotePatterns
          // allowlist (imageDomains.ts); a plain <img> avoids that for this
          // internal-only preview.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.image_url}
            alt={article.title}
            className="h-56 w-full rounded-t-2xl object-cover"
          />
        )}

        <div className="p-6 space-y-4">
          <h3 className="text-lg font-bold leading-snug">{article.title}</h3>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>{article.source_name || "—"}</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDate(article.created_at)}
            </span>
          </div>

          {article.category && article.category.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {article.category.map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-blue-100 dark:bg-blue-950/50 px-2.5 py-1 text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wide"
                >
                  {c}
                </span>
              ))}
            </div>
          )}

          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            {article.description || "No description available."}
          </p>

          {article.link && (
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-red-700 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View Original Article
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Admin content-management table: paginated, filterable, searchable list
 * of stored articles with per-row edit/preview/delete plus bulk select +
 * delete. Self-contained — owns its own fetch/pagination/filter/selection
 * state and renders its own card + heading.
 */
export default function ArticlesTable() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [articles, setArticles] = useState<AdminArticle[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("general");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [editingArticle, setEditingArticle] = useState<AdminArticle | null>(null);
  const [previewArticle, setPreviewArticle] = useState<AdminArticle | null>(null);

  const flashSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(""), 4000);
  };

  // Debounce the search box so every keystroke doesn't fire a request.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    setError("");
    setSelectedIds(new Set());
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (category === "india") {
        params.set("country", "in");
      } else if (category && category !== "general") {
        params.set("category", category);
      }
      if (search) params.set("search", search);

      const res = await fetch(`/api/admin/articles?${params.toString()}`, {
        credentials: "include",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load articles.");
        setArticles([]);
        setTotal(0);
        setTotalPages(1);
        return;
      }

      const payload = data as ArticlesResponse;
      setArticles(payload.articles);
      setTotal(payload.total);
      setTotalPages(payload.totalPages);
    } catch {
      setError("Network error while loading articles.");
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, [page, category, search]);

  // Necessary setState-in-effect: the article list can only come from an
  // async fetch, which can't run synchronously during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchArticles();
  }, [fetchArticles]);

  const handleCategoryChange = (value: string) => {
    setCategory(value);
    setPage(1);
  };

  const handleDelete = async (articleId: string, title: string) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;

    setDeletingId(articleId);
    try {
      const res = await fetch("/api/admin/articles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ article_id: articleId }),
      });

      if (res.ok) {
        flashSuccess("Article deleted.");
        fetchArticles();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to delete article.");
      }
    } catch {
      setError("Network error while deleting article.");
    } finally {
      setDeletingId(null);
    }
  };

  const allOnPageSelected = articles.length > 0 && articles.every((a) => selectedIds.has(a.article_id));

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(articles.map((a) => a.article_id)));
    }
  };

  const toggleSelectOne = (articleId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(articleId)) {
        next.delete(articleId);
      } else {
        next.add(articleId);
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} selected article${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) {
      return;
    }

    setBulkDeleting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/articles/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ article_ids: ids }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        flashSuccess(`Deleted ${data.deleted ?? ids.length} article${(data.deleted ?? ids.length) === 1 ? "" : "s"}.`);
        setSelectedIds(new Set());
        fetchArticles();
      } else {
        setError(data.error || "Failed to delete selected articles.");
      }
    } catch {
      setError("Network error while deleting selected articles.");
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div
      className={`rounded-2xl border p-6 sm:p-8 shadow-sm transition-colors ${
        isDark ? "border-[#34383f] bg-[#25282d]" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          Manage Articles{total > 0 ? ` (${total})` : ""}
        </h2>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by title..."
              className={`w-full sm:w-64 rounded-xl border py-2 pl-9 pr-3 text-xs font-medium focus:outline-none transition-colors ${
                isDark
                  ? "border-[#383d45] bg-[#1a1c1e] text-white focus:border-blue-500"
                  : "border-slate-200 bg-slate-50 text-slate-900 focus:border-blue-600"
              }`}
            />
          </div>

          <select
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className={`rounded-xl border py-2 px-3 text-xs font-medium focus:outline-none transition-colors ${
              isDark
                ? "border-[#383d45] bg-[#1a1c1e] text-white focus:border-blue-500"
                : "border-slate-200 bg-slate-50 text-slate-900 focus:border-blue-600"
            }`}
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 dark:border-red-900/50 dark:bg-red-950/40 p-3 text-xs font-semibold text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/40 p-3 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          {successMessage}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-3">
          <span className="text-xs font-bold text-red-700 dark:text-red-300">
            {selectedIds.size} article{selectedIds.size === 1 ? "" : "s"} selected
          </span>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {bulkDeleting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {bulkDeleting ? "Deleting..." : "Delete Selected"}
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className={`border-b ${isDark ? "border-[#383d45]" : "border-slate-200"}`}>
              <th className="pb-3 pr-3 w-8">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleSelectAll}
                  disabled={articles.length === 0}
                  aria-label="Select all articles on this page"
                  className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 accent-red-600"
                />
              </th>
              <th className="pb-3 pr-4 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Title</th>
              <th className="pb-3 pr-4 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Category</th>
              <th className="pb-3 pr-4 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Source</th>
              <th className="pb-3 pr-4 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Language</th>
              <th className="pb-3 pr-4 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
              <th className="pb-3 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, rowIdx) => (
                <tr key={rowIdx} className={`border-b ${isDark ? "border-[#2b2f36]" : "border-slate-100"}`}>
                  {Array.from({ length: 7 }).map((__, colIdx) => (
                    <td key={colIdx} className="py-3 pr-4">
                      <div
                        className={`h-3.5 rounded-full animate-pulse ${isDark ? "bg-[#33373f]" : "bg-slate-200"}`}
                        style={{ width: colIdx === 0 ? "20%" : colIdx === 1 ? "80%" : "60%" }}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : articles.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center">
                  <Newspaper className="h-6 w-6 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-slate-500 dark:text-slate-400 font-semibold">No articles found.</p>
                </td>
              </tr>
            ) : (
              articles.map((art) => (
                <tr key={art.article_id} className={`border-b ${isDark ? "border-[#2b2f36]" : "border-slate-100"}`}>
                  <td className="py-3 pr-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(art.article_id)}
                      onChange={() => toggleSelectOne(art.article_id)}
                      aria-label={`Select ${art.title}`}
                      className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 accent-red-600"
                    />
                  </td>
                  <td className="py-3 pr-4 max-w-xs">
                    <span className="line-clamp-2 font-medium text-slate-800 dark:text-slate-200">{art.title}</span>
                  </td>
                  <td className="py-3 pr-4 text-slate-600 dark:text-slate-400">{art.category?.join(", ") || "—"}</td>
                  <td className="py-3 pr-4 text-slate-600 dark:text-slate-400">{art.source_name || "—"}</td>
                  <td className="py-3 pr-4 text-slate-600 dark:text-slate-400 uppercase">{art.language || "—"}</td>
                  <td className="py-3 pr-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">{formatDate(art.created_at)}</td>
                  <td className="py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        onClick={() => setPreviewArticle(art)}
                        className="inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-[#383d45] p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#2f333a] transition-colors"
                        aria-label={`Preview ${art.title}`}
                      >
                        <Eye className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => setEditingArticle(art)}
                        className="inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-[#383d45] p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#2f333a] transition-colors"
                        aria-label={`Edit ${art.title}`}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => handleDelete(art.article_id, art.title)}
                        disabled={deletingId === art.article_id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900/50 px-2.5 py-1.5 text-[11px] font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="h-3 w-3" />
                        {deletingId === art.article_id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && total > 0 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-200 dark:border-[#2b2f36]">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Page {page} of {totalPages} &middot; {total} total
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

      {editingArticle && (
        <EditArticleModal
          article={editingArticle}
          isDark={isDark}
          onClose={() => setEditingArticle(null)}
          onSaved={() => {
            setEditingArticle(null);
            flashSuccess("Article updated successfully.");
            fetchArticles();
          }}
        />
      )}

      {previewArticle && (
        <PreviewArticleModal article={previewArticle} isDark={isDark} onClose={() => setPreviewArticle(null)} />
      )}
    </div>
  );
}
