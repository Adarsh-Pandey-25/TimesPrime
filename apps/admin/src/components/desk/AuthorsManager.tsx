"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AUTHOR_KINDS, type AuthorKind } from "@timesprime/shared/config/desk";
import { canAct, deskCall, useAdminMe } from "./deskClient";

// The Desk's authors (Panel 2 design §7): the names stories credit. Everyone on the Desk sees the
// list; a holder of author.manage adds an author, edits one, retires one (it stays credited on what
// it wrote, and cannot be credited again) or brings one back. The server decides each request.

interface Author {
  id: string;
  display_name_en: string;
  display_name_hi: string | null;
  kind: AuthorKind | "agency";
  bio_en: string | null;
  bio_hi: string | null;
  beat: string | null;
  links: string[];
  active: boolean;
}

interface Form {
  display_name_en: string;
  display_name_hi: string;
  kind: AuthorKind;
  beat: string;
  bio_en: string;
  bio_hi: string;
  links: string;
}

const EMPTY: Form = { display_name_en: "", display_name_hi: "", kind: "staff", beat: "", bio_en: "", bio_hi: "", links: "" };
const KIND_LABELS: Record<AuthorKind | "agency", string> = { staff: "Staff", columnist: "Columnist", freelancer: "Freelancer", agency: "Agency" };
const field = "mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-[#3a3f47] dark:bg-[#25282d]";
const button = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40 dark:border-[#3a3f47] dark:hover:bg-[#2b2f36]";

const toForm = (a: Author): Form => ({
  display_name_en: a.display_name_en,
  display_name_hi: a.display_name_hi ?? "",
  kind: a.kind === "agency" ? "staff" : a.kind,
  beat: a.beat ?? "",
  bio_en: a.bio_en ?? "",
  bio_hi: a.bio_hi ?? "",
  links: a.links.join("\n"),
});

/** What the form sends: empty fields as null, one link per line. */
const toBody = (f: Form) => ({
  display_name_en: f.display_name_en,
  display_name_hi: f.display_name_hi || null,
  kind: f.kind,
  beat: f.beat || null,
  bio_en: f.bio_en || null,
  bio_hi: f.bio_hi || null,
  links: f.links.split("\n").map((l) => l.trim()).filter(Boolean),
});

export default function AuthorsManager() {
  const { me, error: meError } = useAdminMe();
  const [authors, setAuthors] = useState<Author[] | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const manage = canAct(me, "author.manage");

  const load = useCallback(async () => {
    const res = await deskCall<{ authors: Author[] }>("/api/admin/desk/authors?all=1");
    if (res.ok && res.data) {
      setAuthors(res.data.authors);
      setError("");
    } else {
      setAuthors([]);
      setError(res.error ?? "Could not load the authors.");
    }
  }, []);

  // Necessary setState-in-effect: the list comes from an async fetch, which cannot run during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    const creating = editing === "new";
    const res = await deskCall(creating ? "/api/admin/desk/authors" : `/api/admin/desk/authors/${editing}`, {
      method: creating ? "POST" : "PATCH",
      body: JSON.stringify(toBody(form)),
    });
    setBusy(false);
    if (!res.ok) return setMessage({ ok: false, text: res.error ?? "Not saved." });
    setMessage({ ok: true, text: creating ? "Author added." : "Author saved." });
    setEditing(null);
    await load();
  }

  async function setActive(author: Author, active: boolean) {
    const res = await deskCall(`/api/admin/desk/authors/${author.id}`, { method: "PATCH", body: JSON.stringify({ active }) });
    setMessage(res.ok ? { ok: true, text: active ? "Author brought back." : "Author retired." } : { ok: false, text: res.error ?? "Not changed." });
    if (res.ok) await load();
  }

  if (meError) return <p role="alert" className="text-sm text-red-700 dark:text-red-300">{meError}</p>;
  if (me && me.kind !== "staff") {
    return <p role="alert" className="text-sm text-red-700 dark:text-red-300">Sign in with your own staff account to use the Desk. The shared admin password cannot.</p>;
  }

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [key]: e.target.value });

  return (
    <section aria-labelledby="authors-heading" className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Link href="/admin/desk" className="text-sm text-blue-700 hover:underline dark:text-blue-300">← Desk</Link>
          <h1 id="authors-heading" className="font-serif text-2xl font-extrabold">Authors</h1>
        </div>
        {manage && editing === null && (
          <button type="button" className={button} onClick={() => { setForm(EMPTY); setEditing("new"); }}>New author</button>
        )}
      </div>
      {message && <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>{message.text}</p>}

      {manage && editing !== null && (
        <form onSubmit={(e) => { e.preventDefault(); void save(); }} aria-label={editing === "new" ? "New author" : "Edit the author"} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2 dark:border-[#2b2f36]">
          <label className="text-sm font-semibold">Name in English<input className={field} required value={form.display_name_en} onChange={set("display_name_en")} /></label>
          <label className="text-sm font-semibold">Name in Hindi<input className={field} lang="hi" value={form.display_name_hi} onChange={set("display_name_hi")} /></label>
          <label className="text-sm font-semibold">
            Kind
            <select className={field} value={form.kind} onChange={set("kind")}>
              {AUTHOR_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">Beat<input className={field} value={form.beat} onChange={set("beat")} placeholder="sports" /></label>
          <label className="text-sm font-semibold">Bio in English<textarea className={field} rows={3} value={form.bio_en} onChange={set("bio_en")} /></label>
          <label className="text-sm font-semibold">Bio in Hindi<textarea className={field} rows={3} lang="hi" value={form.bio_hi} onChange={set("bio_hi")} /></label>
          <label className="text-sm font-semibold sm:col-span-2">Links, one https address a line<textarea className={field} rows={2} value={form.links} onChange={set("links")} /></label>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" disabled={busy || !form.display_name_en.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              {editing === "new" ? "Add the author" : "Save"}
            </button>
            <button type="button" className={button} onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}

      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      {authors === null ? (
        <p aria-live="polite" className="text-sm text-slate-500">Loading the authors…</p>
      ) : authors.length === 0 && !error ? (
        <p className="text-sm text-slate-500">No authors yet.{manage ? " Add one with New author." : ""}</p>
      ) : (
        <ul className="space-y-2">
          {authors.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-[#2b2f36]">
              <div>
                <p className="font-semibold">
                  {a.display_name_en}
                  {a.display_name_hi && <span lang="hi" className="ml-2 font-normal text-slate-600 dark:text-slate-300">{a.display_name_hi}</span>}
                  {!a.active && <span className="ml-2 text-xs font-bold text-slate-500">Retired</span>}
                </p>
                <p className="text-xs text-slate-500">{KIND_LABELS[a.kind]}{a.beat ? ` · ${a.beat}` : ""}</p>
              </div>
              {manage && (
                <div className="flex gap-2">
                  <button type="button" className={button} onClick={() => { setForm(toForm(a)); setEditing(a.id); }}>Edit</button>
                  <button type="button" className={button} onClick={() => void setActive(a, !a.active)}>{a.active ? "Retire" : "Bring back"}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
