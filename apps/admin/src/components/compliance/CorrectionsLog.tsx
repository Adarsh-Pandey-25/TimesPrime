"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FilePenLine } from "lucide-react";
import { CORRECTION_KIND_LABELS, isCorrectionKind } from "@timesprime/shared/config/corrections";
import { deskCall, when } from "../desk/deskClient";
import { badge, button, card, cardTitle, hint, item, link, tone } from "../ui/styles";

// The corrections log in the back office (Panel 7 design §4, M2): every correction, newest first, as
// readers see it on /corrections, with who published it, who asked for it and the grievance that
// caused it. Read-only: corrections are published on the Desk's story screen.

interface Correction {
  id: string;
  story_id: string;
  language: "en" | "hi";
  kind: string;
  text: string;
  headline: string | null;
  published_at: string;
  published_by_name: string;
  requested_by_name: string | null;
  ticket: string | null;
}

interface Page {
  corrections: Correction[];
  applied: boolean;
  more: boolean;
}

export default function CorrectionsLog() {
  const [rows, setRows] = useState<Correction[] | null>(null);
  const [applied, setApplied] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (before: string | null) => {
    setBusy(true);
    const res = await deskCall<Page>(`/api/admin/compliance/corrections${before ? `?before=${encodeURIComponent(before)}` : ""}`);
    setBusy(false);
    if (!res.ok || !res.data) return setError(res.error ?? "Could not load the corrections.");
    const page = res.data;
    setError("");
    setApplied(page.applied);
    setMore(page.more);
    setRows((now) => (before && now ? [...now, ...page.corrections] : page.corrections));
  }, []);

  // Necessary setState-in-effect: the log comes from an async fetch, which cannot run during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(null);
  }, [load]);

  return (
    <section aria-labelledby="corrections-title" className={`${card} space-y-4`}>
      <div className="space-y-1">
        <h2 id="corrections-title" className={`${cardTitle} flex items-center gap-2`}>
          <FilePenLine aria-hidden="true" className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          Corrections
        </h2>
        <p className={hint}>
          Every public correction, newest first, as readers see them on{" "}
          <a href="/corrections" target="_blank" rel="noopener noreferrer" className={link}>
            /corrections
          </a>
          . They are published on the Desk&apos;s story screen.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">
          {error}{" "}
          <button type="button" onClick={() => load(null)} className={link}>
            Try again
          </button>
        </p>
      )}
      {!rows && !error && <p role="status" className={hint}>Loading the corrections…</p>}
      {rows && !applied && <p className={hint}>The corrections log is not set up yet: compliance-2 is waiting to be applied.</p>}
      {rows && applied && rows.length === 0 && <p className={hint}>No corrections yet.</p>}
      {rows && rows.length > 0 && (
        <ol aria-label="Corrections, newest first" className="space-y-3">
          {rows.map((c) => (
            <li key={c.id} className={`${item} space-y-1`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`${badge} ${tone.amber}`}>{isCorrectionKind(c.kind) ? CORRECTION_KIND_LABELS[c.kind].en : c.kind}</span>
                <span className={hint}>{when(c.published_at)}</span>
                {c.ticket && <span className={`${badge} ${tone.blue}`}>Grievance {c.ticket}</span>}
              </div>
              <Link href={`/admin/desk/${c.story_id}`} className={`${link} block font-semibold`} lang={c.language}>
                {c.headline ?? "The Desk story"}
              </Link>
              <p className="text-sm" lang={c.language}>
                {c.text}
              </p>
              <p className={hint}>
                Published by {c.published_by_name}
                {c.requested_by_name ? `, asked for by ${c.requested_by_name}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
      {more && rows && (
        <button type="button" disabled={busy} onClick={() => load(rows[rows.length - 1].published_at)} className={button}>
          {busy ? "Loading…" : "Older corrections"}
        </button>
      )}
    </section>
  );
}
