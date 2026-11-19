"use client";

import { useCallback, useEffect, useState } from "react";
import { diffBlocks, diffWords, type BlockDiff, type DiffPart } from "@timesprime/editor/diff";
import { textBlocks } from "@timesprime/editor/text";
import { deskCall, when } from "./deskClient";
import { button, field as baseField } from "../ui/styles";

// A story's revisions (Panel 2 design §3): the list, the difference between any two (headline, dek,
// SEO fields and the text, word by word), and bringing an old revision back. Bringing one back only
// fills the editor: Save then adds it as a new revision, so nothing is overwritten (revisions are
// immutable in the database) and a save's usual rules (the lock, a save meanwhile) still apply.

export interface FullRevision {
  id: string;
  headline: string;
  dek: string | null;
  seo_title: string | null;
  seo_description: string | null;
  body: unknown;
  editor_id: string;
  is_substantive: boolean;
  created_at: string;
}

type RevisionSummary = Omit<FullRevision, "body">;

const FIELDS = [
  ["headline", "Headline"],
  ["dek", "Dek"],
  ["seo_title", "SEO title"],
  ["seo_description", "SEO description"],
] as const;

/** The text's diff, with each run of unchanged paragraphs folded into a count. */
type TextRow = { kind: "unchanged"; count: number } | { kind: "block"; block: Exclude<BlockDiff, { kind: "same" }> };

interface Comparison {
  from: number;
  to: number;
  fields: Array<{ label: string; parts: DiffPart[] }>;
  text: TextRow[];
}

function foldText(diff: BlockDiff[]): TextRow[] {
  const rows: TextRow[] = [];
  for (const block of diff) {
    const last = rows[rows.length - 1];
    if (block.kind !== "same") rows.push({ kind: "block", block });
    else if (last?.kind === "unchanged") last.count++;
    else rows.push({ kind: "unchanged", count: 1 });
  }
  return rows;
}

function compareRevisions(before: FullRevision, after: FullRevision, from: number, to: number): Comparison {
  const fields = FIELDS.filter(([key]) => (before[key] ?? "") !== (after[key] ?? "")).map(([key, label]) => ({
    label,
    parts: diffWords(before[key] ?? "", after[key] ?? ""),
  }));
  const blocks = diffBlocks(textBlocks(before.body), textBlocks(after.body));
  return { from, to, fields, text: blocks.some((b) => b.kind !== "same") ? foldText(blocks) : [] };
}

const field = `mt-0.5 ${baseField}`;
const addedStyle = "bg-green-100 no-underline dark:bg-green-900/50";
const removedStyle = "bg-red-100 dark:bg-red-900/50";

/** One run of words: unchanged, added or removed. Screen readers hear which, as colour alone says nothing. */
function Part({ part }: { part: DiffPart }) {
  if (part.kind === "same") return <>{part.text}</>;
  if (part.kind === "added") {
    return <ins className={addedStyle}><span className="sr-only">added: </span>{part.text}</ins>;
  }
  return <del className={removedStyle}><span className="sr-only">removed: </span>{part.text}</del>;
}

function ComparisonView({ comparison, language }: { comparison: Comparison; language: string }) {
  const heading = `Changes from revision ${comparison.from} to revision ${comparison.to}`;
  if (comparison.fields.length === 0 && comparison.text.length === 0) {
    return <p className="text-sm text-slate-500">Revisions {comparison.from} and {comparison.to} have the same text.</p>;
  }
  return (
    <div className="space-y-3 border-t border-slate-200 pt-3 dark:border-[#2b2f36]">
      <h3 className="text-sm font-bold">{heading}</h3>
      <p className="text-xs text-slate-500">
        <span className={`${addedStyle} px-1`}>Added</span> and <span className={`${removedStyle} px-1 line-through`}>removed</span> words are marked.
      </p>
      <div lang={language} className="space-y-3 text-sm leading-relaxed">
        {comparison.fields.map((f) => (
          <div key={f.label}>
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">{f.label}</h4>
            <p>{f.parts.map((part, j) => <Part key={j} part={part} />)}</p>
          </div>
        ))}
        {comparison.text.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Text</h4>
            {comparison.text.map((row, i) =>
              row.kind === "unchanged" ? (
                <p key={i} className="text-xs italic text-slate-500">{row.count === 1 ? "1 paragraph unchanged" : `${row.count} paragraphs unchanged`}</p>
              ) : (
                <p key={i}>
                  {row.block.kind === "changed"
                    ? row.block.parts.map((part, j) => <Part key={j} part={part} />)
                    : <Part part={{ kind: row.block.kind, text: row.block.text }} />}
                </p>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function RevisionsPanel({
  storyId,
  currentRevisionId,
  publishedRevisionId,
  language,
  canBringBack,
  onBringBack,
}: {
  storyId: string;
  currentRevisionId: string | null;
  publishedRevisionId: string | null;
  language: string;
  /** Whether the editor is the caller's to change now (permission, state and lock). */
  canBringBack: boolean;
  /** Fills the editor with the revision; false when the person kept their unsaved changes instead. */
  onBringBack: (revision: FullRevision, number: number) => boolean | Promise<boolean>;
}) {
  const [revisions, setRevisions] = useState<RevisionSummary[] | null>(null);
  const [error, setError] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Reloaded whenever the current revision changes, so a Save shows up here.
  const load = useCallback(async () => {
    const res = await deskCall<{ revisions: RevisionSummary[] }>(`/api/admin/desk/stories/${storyId}/revisions`);
    if (!res.ok || !res.data) return setError(res.error ?? "Could not load the revisions.");
    const list = res.data.revisions;
    // Newest first. The default pair: the current revision and the one saved before it.
    const toIndex = Math.max(0, list.findIndex((r) => r.id === currentRevisionId));
    setRevisions(list);
    setTo(list[toIndex]?.id ?? "");
    setFrom((list[toIndex + 1] ?? list.find((_, i) => i !== toIndex))?.id ?? "");
    setComparison(null);
    setNote("");
    setError("");
  }, [storyId, currentRevisionId]);

  // Necessary setState-in-effect: the revisions come from an async fetch, which cannot run during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  /** Revisions are numbered from 1, the first draft, in the order they were saved. */
  const numberOf = (id: string) => (revisions ? revisions.length - revisions.findIndex((r) => r.id === id) : 0);
  const fetchRevision = (id: string) => deskCall<{ revision: FullRevision }>(`/api/admin/desk/stories/${storyId}/revisions/${id}`);

  async function compare() {
    setBusy(true);
    setNote("");
    const [a, b] = await Promise.all([fetchRevision(from), fetchRevision(to)]);
    setBusy(false);
    if (!a.ok || !a.data) return setError(a.error ?? "Could not load the revisions.");
    if (!b.ok || !b.data) return setError(b.error ?? "Could not load the revisions.");
    setError("");
    setComparison(compareRevisions(a.data.revision, b.data.revision, numberOf(from), numberOf(to)));
  }

  async function bringBack(id: string) {
    setBusy(true);
    const res = await fetchRevision(id);
    setBusy(false);
    if (!res.ok || !res.data) return setError(res.error ?? "Could not load the revision.");
    setError("");
    const n = numberOf(id);
    if (await onBringBack(res.data.revision, n)) {
      setNote(`Revision ${n} is in the editor. Save to make it the current version; until then nothing has changed.`);
    }
  }

  const label = (r: RevisionSummary, i: number, list: RevisionSummary[]) =>
    [
      `Revision ${list.length - i}`,
      when(r.created_at),
      r.id === currentRevisionId && "current",
      r.id === publishedRevisionId && "live",
      r.is_substantive && "substantive",
    ]
      .filter(Boolean)
      .join(" · ");
  const options = revisions?.map((r, i, list) => <option key={r.id} value={r.id}>{label(r, i, list)}</option>);
  // Either selected revision can come back, unless it is already the current one.
  const restorable = [from, to].filter((rid, i, both) => rid && rid !== currentRevisionId && both.indexOf(rid) === i);

  return (
    <section aria-labelledby="revisions-heading" className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-[#2b2f36]">
      <h2 id="revisions-heading" className="text-sm font-bold">Revisions{revisions ? ` (${revisions.length})` : ""}</h2>
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      {revisions === null ? (
        !error && <p aria-live="polite" className="text-sm text-slate-500">Loading the revisions…</p>
      ) : revisions.length < 2 ? (
        <p className="text-sm text-slate-500">Only one revision so far. Each Save adds one, and any two can then be compared.</p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="block text-sm">
              From
              <select className={field} value={from} onChange={(e) => { setFrom(e.target.value); setComparison(null); }}>{options}</select>
            </label>
            <label className="block text-sm">
              To
              <select className={field} value={to} onChange={(e) => { setTo(e.target.value); setComparison(null); }}>{options}</select>
            </label>
            <button type="button" className={button} disabled={busy || !from || !to || from === to} onClick={() => void compare()}>
              Compare
            </button>
          </div>
          {canBringBack && restorable.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {restorable.map((rid) => (
                <button key={rid} type="button" className={button} disabled={busy} onClick={() => void bringBack(rid)}>
                  Bring back revision {numberOf(rid)}
                </button>
              ))}
            </div>
          )}
          {note && <p role="status" className="text-sm text-green-700 dark:text-green-300">{note}</p>}
          {comparison && <ComparisonView comparison={comparison} language={language} />}
        </>
      )}
    </section>
  );
}
