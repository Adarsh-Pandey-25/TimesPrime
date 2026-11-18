"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw } from "lucide-react";
import { STORY_LANGUAGES, STORY_STATES, type StoryLanguage, type StoryState } from "@timesprime/shared/config/desk";
import { SECTION_IDS } from "@timesprime/shared/config/sections";
import AlertList from "./AlertList";
import { canAct, deskCall, STATE_LABELS, STATE_STYLES, useAdminMe, when } from "./deskClient";

// The Desk's story list (Panel 2 design §4): the stories of the caller's desks, newest change first,
// with filters for language, section, state, the caller's own and those waiting for a post-hoc review.
// Above it, for whoever may take stories down, the alert list of recent takedowns (design §8).

interface ListRow {
  id: string;
  language: StoryLanguage;
  section: string;
  workflow_state: StoryState;
  updated_at: string;
  post_hoc_review_due: boolean;
  current: { headline: string } | null;
}

const PAGE_SIZE = 50;
const field = "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-[#3a3f47] dark:bg-[#25282d]";

export default function DeskList() {
  const { me, error: meError } = useAdminMe();
  const [language, setLanguage] = useState("");
  const [section, setSection] = useState("");
  const [state, setState] = useState("");
  const [mine, setMine] = useState(false);
  const [postHoc, setPostHoc] = useState(false);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ListRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const query = new URLSearchParams();
    if (language) query.set("language", language);
    if (section) query.set("section", section);
    if (state) query.set("state", state);
    if (mine) query.set("mine", "1");
    if (postHoc) query.set("post_hoc", "1");
    query.set("page", String(page));
    const res = await deskCall<{ stories: ListRow[]; total: number }>(`/api/admin/desk/stories?${query}`);
    if (res.ok && res.data) {
      setRows(res.data.stories);
      setTotal(res.data.total);
      setError("");
    } else {
      setRows([]);
      setError(res.error ?? "Could not load the stories.");
    }
  }, [language, section, state, mine, postHoc, page]);

  // Necessary setState-in-effect: the list comes from an async fetch, which cannot run during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (meError) return <p role="alert" className="text-sm text-red-700 dark:text-red-300">{meError}</p>;
  if (me && me.kind !== "staff") {
    return <p role="alert" className="text-sm text-red-700 dark:text-red-300">Sign in with your own staff account to use the Desk. The shared admin password cannot.</p>;
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <section aria-labelledby="desk-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="desk-heading" className="font-serif text-2xl font-extrabold">Desk</h1>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-[#3a3f47]">
            <RefreshCw size={14} aria-hidden="true" /> Refresh
          </button>
          <Link href="/admin/desk/authors" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-[#3a3f47]">
            Authors
          </Link>
          {canAct(me, "article.create") && (
            <Link href="/admin/desk/new" className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-blue-700">
              <Plus size={14} aria-hidden="true" /> New story
            </Link>
          )}
        </div>
      </div>

      {canAct(me, "article.unpublish") && <AlertList />}

      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => e.preventDefault()} aria-label="Filter the stories">
        <label className="flex flex-col text-xs font-semibold">
          Language
          <select className={field} value={language} onChange={(e) => { setLanguage(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {STORY_LANGUAGES.map((l) => <option key={l} value={l}>{l === "en" ? "English" : "Hindi"}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-xs font-semibold">
          Section
          <select className={field} value={section} onChange={(e) => { setSection(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {SECTION_IDS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-xs font-semibold">
          State
          <select className={field} value={state} onChange={(e) => { setState(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {STORY_STATES.map((s) => <option key={s} value={s}>{STATE_LABELS[s]}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={mine} onChange={(e) => { setMine(e.target.checked); setPage(1); }} /> Mine
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={postHoc} onChange={(e) => { setPostHoc(e.target.checked); setPage(1); }} /> Needs post-hoc review
        </label>
      </form>

      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      {rows === null ? (
        <p aria-live="polite" className="text-sm text-slate-500">Loading the stories…</p>
      ) : rows.length === 0 && !error ? (
        <p className="text-sm text-slate-500">No stories here yet.{canAct(me, "article.create") ? " Start one with New story." : ""}</p>
      ) : rows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#2b2f36]">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-[#202327]">
              <tr>
                <th scope="col" className="px-3 py-2">Headline</th>
                <th scope="col" className="px-3 py-2">Desk</th>
                <th scope="col" className="px-3 py-2">State</th>
                <th scope="col" className="px-3 py-2">Last change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 dark:border-[#2b2f36]">
                  <td className="px-3 py-2">
                    <Link href={`/admin/desk/${r.id}`} lang={r.language} className="font-semibold text-blue-700 hover:underline dark:text-blue-300">
                      {r.current?.headline || "(no headline)"}
                    </Link>
                    {r.post_hoc_review_due && <span className="ml-2 text-xs font-bold text-amber-700 dark:text-amber-300">Needs review</span>}
                  </td>
                  <td className="px-3 py-2">{r.language === "hi" ? "Hindi" : "English"} · {r.section}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATE_STYLES[r.workflow_state]}`}>{STATE_LABELS[r.workflow_state]}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{when(r.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-3 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border px-2 py-1 disabled:opacity-40">Previous</button>
          <span>Page {page} of {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded border px-2 py-1 disabled:opacity-40">Next</button>
        </nav>
      )}
    </section>
  );
}
