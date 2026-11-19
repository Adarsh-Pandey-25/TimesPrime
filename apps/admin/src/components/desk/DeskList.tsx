"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Image as ImageIcon, Plus, RefreshCw, Users } from "lucide-react";
import { STORY_LANGUAGES, STORY_STATES, type StoryLanguage, type StoryState } from "@timesprime/shared/config/desk";
import { SECTION_IDS } from "@timesprime/shared/config/sections";
import AlertList from "./AlertList";
import { canAct, deskCall, STATE_LABELS, STATE_STYLES, useAdminMe, when } from "./deskClient";
import { badge, button, buttonPrimary, card, fieldInline, hint, label, link, pageTitle, rowHover, tone } from "../ui/styles";

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
const field = fieldInline;

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

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const mayCreate = canAct(me, "article.create");
  return (
    <section aria-labelledby="desk-heading" className="space-y-6">
      {/* 1. The page, its tools, and its main action. */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 id="desk-heading" className={pageTitle}>Desk</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">The stories of your desks, newest change first.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} className={button}>
            <RefreshCw size={14} aria-hidden="true" /> Refresh
          </button>
          <Link href="/admin/desk/authors" className={button}>
            <Users size={14} aria-hidden="true" /> Authors
          </Link>
          <Link href="/admin/desk/media" className={button}>
            <ImageIcon size={14} aria-hidden="true" /> Media
          </Link>
          {mayCreate && (
            <Link href="/admin/desk/new" className={buttonPrimary}>
              <Plus size={14} aria-hidden="true" /> New story
            </Link>
          )}
        </div>
      </header>

      {/* 2. What needs a look: stories taken down lately. */}
      {canAct(me, "article.unpublish") && <AlertList />}

      {/* 3. The stories, with their filters. */}
      <div className={card}>
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => e.preventDefault()} aria-label="Filter the stories">
          <label className={`${label} text-xs`}>
            Language
            <select className={`${field} mt-1 block`} value={language} onChange={(e) => { setLanguage(e.target.value); setPage(1); }}>
              <option value="">All</option>
              {STORY_LANGUAGES.map((l) => <option key={l} value={l}>{l === "en" ? "English" : "Hindi"}</option>)}
            </select>
          </label>
          <label className={`${label} text-xs`}>
            Section
            <select className={`${field} mt-1 block`} value={section} onChange={(e) => { setSection(e.target.value); setPage(1); }}>
              <option value="">All</option>
              {SECTION_IDS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className={`${label} text-xs`}>
            State
            <select className={`${field} mt-1 block`} value={state} onChange={(e) => { setState(e.target.value); setPage(1); }}>
              <option value="">All</option>
              {STORY_STATES.map((s) => <option key={s} value={s}>{STATE_LABELS[s]}</option>)}
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-[#3a3f47] dark:hover:bg-[#25282d]">
            <input type="checkbox" checked={mine} onChange={(e) => { setMine(e.target.checked); setPage(1); }} /> Mine
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-[#3a3f47] dark:hover:bg-[#25282d]">
            <input type="checkbox" checked={postHoc} onChange={(e) => { setPostHoc(e.target.checked); setPage(1); }} /> Needs post-hoc review
          </label>
          {rows !== null && !error && <span className={`${hint} ml-auto`}>{total} {total === 1 ? "story" : "stories"}</span>}
        </form>

        {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
        {rows === null ? (
          <p aria-live="polite" className="text-sm text-slate-500">Loading the stories…</p>
        ) : rows.length === 0 && !error ? (
          <p className="text-sm text-slate-500">No stories here yet.{mayCreate ? " Start one with New story." : ""}</p>
        ) : rows.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#2b2f36]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-[#2b2f36] dark:bg-[#25282d] dark:text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3">Headline</th>
                  <th scope="col" className="px-4 py-3">Desk</th>
                  <th scope="col" className="px-4 py-3">State</th>
                  <th scope="col" className="px-4 py-3">Last change</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`border-t border-slate-100 dark:border-[#2b2f36] ${rowHover}`}>
                    <td className="px-4 py-3">
                      <Link href={`/admin/desk/${r.id}`} lang={r.language} className={link}>
                        {r.current?.headline || "(no headline)"}
                      </Link>
                      {r.post_hoc_review_due && <span className={`${badge} ${tone.amber} ml-2`}>Needs review</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.language === "hi" ? "Hindi" : "English"} · {r.section}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATE_STYLES[r.workflow_state]}`}>{STATE_LABELS[r.workflow_state]}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{when(r.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {pages > 1 && (
          <nav aria-label="Pages" className="flex items-center justify-end gap-3 text-sm">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className={button}>Previous</button>
            <span className={hint}>Page {page} of {pages}</span>
            <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className={button}>Next</button>
          </nav>
        )}
      </div>
    </section>
  );
}
