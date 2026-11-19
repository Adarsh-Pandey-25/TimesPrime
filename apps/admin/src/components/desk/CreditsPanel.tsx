"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CREDIT_ROLES, CREDITS_MAX, type CreditRole } from "@timesprime/shared/config/desk";
import { deskCall } from "./deskClient";
import { button, field } from "../ui/styles";

// A story's credits on its screen (Panel 2 design §7): who wrote it, who added reporting, who
// translated it, in the order readers see them. Whoever may edit the story changes them before it is
// published; Save sends the whole list, and an approved story goes back to desk review (the server
// and the database decide). Afterwards they are shown, not changed.

export interface Credit {
  author_id: string;
  role: CreditRole;
  author: { display_name_en: string; display_name_hi: string | null; photo_id?: string | null; active: boolean } | null;
}

interface AuthorOption {
  id: string;
  display_name_en: string;
  display_name_hi: string | null;
}

export const CREDIT_LABELS: Record<CreditRole, string> = {
  byline: "Byline",
  additional_reporting: "Additional reporting",
  translated_by: "Translated by",
};

/** The name readers see: the Hindi one on a Hindi story when there is one. */
const nameIn = (language: "en" | "hi", a: { display_name_en: string; display_name_hi: string | null } | null) =>
  a ? (language === "hi" && a.display_name_hi) || a.display_name_en : "(unknown author)";

export default function CreditsPanel({
  storyId,
  language,
  credits,
  editable,
  onSaved,
}: {
  storyId: string;
  language: "en" | "hi";
  credits: Credit[];
  editable: boolean;
  onSaved: (message: { ok: boolean; text: string }) => void;
}) {
  const [draft, setDraft] = useState<Credit[]>(credits);
  const [authors, setAuthors] = useState<AuthorOption[] | null>(null);
  const [adding, setAdding] = useState("");
  const [role, setRole] = useState<CreditRole>("byline");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Necessary setState-in-effect: the saved credits arrive with each load of the story.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(credits);
  }, [credits]);

  // The authors to choose from, only for someone who may change the credits.
  useEffect(() => {
    if (!editable) return;
    let live = true;
    void deskCall<{ authors: AuthorOption[] }>("/api/admin/desk/authors").then((res) => {
      if (!live) return;
      if (res.ok && res.data) setAuthors(res.data.authors);
      else setError(res.error ?? "Could not load the authors.");
    });
    return () => {
      live = false;
    };
  }, [editable]);

  const changed = JSON.stringify(draft.map((c) => [c.author_id, c.role])) !== JSON.stringify(credits.map((c) => [c.author_id, c.role]));
  const taken = (id: string, r: CreditRole) => draft.some((c) => c.author_id === id && c.role === r);

  function add() {
    const author = authors?.find((a) => a.id === adding);
    if (!author || taken(author.id, role)) return;
    setDraft([...draft, { author_id: author.id, role, author: { ...author, active: true } }]);
    setAdding("");
  }

  async function save() {
    setBusy(true);
    const res = await deskCall(`/api/admin/desk/stories/${storyId}/credits`, {
      method: "POST",
      body: JSON.stringify({ credits: draft.map((c) => ({ author_id: c.author_id, role: c.role })) }),
    });
    setBusy(false);
    onSaved(res.ok ? { ok: true, text: "Credits saved." } : { ok: false, text: res.error ?? "Credits not saved." });
  }

  return (
    <section aria-labelledby="credits-heading" className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-[#2b2f36]">
      <h2 id="credits-heading" className="text-sm font-bold">Credits</h2>
      {draft.length === 0 ? (
        <p className="text-sm text-slate-500">No credits yet.</p>
      ) : (
        <ol className="space-y-1 text-sm">
          {draft.map((c, i) => (
            <li key={`${c.author_id}-${c.role}`} className="flex items-center justify-between gap-2">
              <span>
                <span lang={language}>{nameIn(language, c.author)}</span>
                <span className="text-slate-500"> · {CREDIT_LABELS[c.role]}</span>
                {c.author && !c.author.active && <span className="ml-1 text-xs font-bold text-amber-700 dark:text-amber-300">Retired</span>}
              </span>
              {editable && (
                <button type="button" className={button} aria-label={`Remove ${nameIn(language, c.author)}, ${CREDIT_LABELS[c.role]}`} onClick={() => setDraft(draft.filter((_, j) => j !== i))}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      {editable && (
        <>
          {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
          {authors !== null && authors.length === 0 ? (
            <p className="text-sm text-slate-500">
              No authors yet. <Link href="/admin/desk/authors" className="text-blue-700 hover:underline dark:text-blue-300">Add one on the Authors page.</Link>
            </p>
          ) : (
            <div className="space-y-1">
              <label className="block text-xs font-semibold">
                Author
                <select className={field} value={adding} onChange={(e) => setAdding(e.target.value)}>
                  <option value="">Choose…</option>
                  {(authors ?? []).map((a) => <option key={a.id} value={a.id}>{nameIn(language, a)}</option>)}
                </select>
              </label>
              <label className="block text-xs font-semibold">
                As
                <select className={field} value={role} onChange={(e) => setRole(e.target.value as CreditRole)}>
                  {CREDIT_ROLES.map((r) => <option key={r} value={r}>{CREDIT_LABELS[r]}</option>)}
                </select>
              </label>
              <button type="button" className={button} disabled={!adding || taken(adding, role) || draft.length >= CREDITS_MAX} onClick={add}>Add</button>
            </div>
          )}
          <button type="button" className={button} disabled={busy || !changed} onClick={() => void save()}>
            {busy ? "Saving…" : "Save credits"}
          </button>
        </>
      )}
    </section>
  );
}
