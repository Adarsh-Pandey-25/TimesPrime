"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AUTHOR_KINDS, type AuthorKind } from "@timesprime/shared/config/desk";
import { canAct, deskCall, useAdminMe } from "./deskClient";
import ImagePicker from "./ImagePicker";
import { UserPlus } from "lucide-react";
import { backLink, badge, button, buttonDanger, buttonPrimary, card, cardTitle, field as baseField, hint, label, pageTitle, tone } from "../ui/styles";
import ActionMessage from "../ui/ActionMessage";

// The Desk's authors (Panel 2 design §7): the names stories credit. Everyone on the Desk sees the
// list; a holder of author.manage adds an author, edits one, retires one (it stays credited on what
// it wrote, and cannot be credited again) or brings one back; an author's photo, from the media
// library with its rights cleared, shows beside their byline. The server decides each request.

interface Author {
  id: string;
  display_name_en: string;
  display_name_hi: string | null;
  kind: AuthorKind | "agency";
  bio_en: string | null;
  bio_hi: string | null;
  beat: string | null;
  links: string[];
  photo_id: string | null;
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
  photo_id: string;
}

const EMPTY: Form = { display_name_en: "", display_name_hi: "", kind: "staff", beat: "", bio_en: "", bio_hi: "", links: "", photo_id: "" };
const KIND_LABELS: Record<AuthorKind | "agency", string> = { staff: "Staff", columnist: "Columnist", freelancer: "Freelancer", agency: "Agency" };
const field = `mt-1 ${baseField}`;

const toForm = (a: Author): Form => ({
  display_name_en: a.display_name_en,
  display_name_hi: a.display_name_hi ?? "",
  kind: a.kind === "agency" ? "staff" : a.kind,
  beat: a.beat ?? "",
  bio_en: a.bio_en ?? "",
  bio_hi: a.bio_hi ?? "",
  links: a.links.join("\n"),
  photo_id: a.photo_id ?? "",
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
  photo_id: f.photo_id || null,
});

/** An author's photo, small and round, through the back office (the original until renditions exist). */
function Photo({ id }: { id: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/admin/desk/media/${id}/original`} alt="" width={40} height={40} style={{ width: 40, height: 40, borderRadius: 9999, objectFit: "cover" }} />;
}

export default function AuthorsManager() {
  const { me, error: meError } = useAdminMe();
  const [authors, setAuthors] = useState<Author[] | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [choosingPhoto, setChoosingPhoto] = useState(false);
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

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [key]: e.target.value });

  return (
    <section aria-labelledby="authors-heading" className="max-w-4xl space-y-6">
      <Link href="/admin/desk" className={backLink}>← Desk</Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 id="authors-heading" className={pageTitle}>Authors</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">The names on bylines, in English and Hindi. A retired author stays on what they wrote.</p>
        </div>
        {manage && editing === null && (
          <button type="button" className={buttonPrimary} onClick={() => { setForm(EMPTY); setEditing("new"); }}>
            <UserPlus aria-hidden="true" className="h-4 w-4" /> New author
          </button>
        )}
      </header>
      <ActionMessage message={message} />

      {manage && editing !== null && (
        <form onSubmit={(e) => { e.preventDefault(); void save(); }} aria-label={editing === "new" ? "New author" : "Edit the author"} className={`${card} grid gap-3 space-y-0 sm:grid-cols-2`}>
          <h2 className={`${cardTitle} sm:col-span-2`}>{editing === "new" ? "New author" : "Edit the author"}</h2>
          <label className={label}>Name in English<input className={field} required value={form.display_name_en} onChange={set("display_name_en")} /></label>
          <label className={label}>Name in Hindi<input className={field} lang="hi" value={form.display_name_hi} onChange={set("display_name_hi")} /></label>
          <label className={label}>
            Kind
            <select className={field} value={form.kind} onChange={set("kind")}>
              {AUTHOR_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
            </select>
          </label>
          <label className={label}>Beat<input className={field} value={form.beat} onChange={set("beat")} placeholder="sports" /></label>
          <label className={label}>Bio in English<textarea className={field} rows={3} value={form.bio_en} onChange={set("bio_en")} /></label>
          <label className={label}>Bio in Hindi<textarea className={field} rows={3} lang="hi" value={form.bio_hi} onChange={set("bio_hi")} /></label>
          <label className={`${label} sm:col-span-2`}>Links, one https address a line<textarea className={field} rows={2} value={form.links} onChange={set("links")} /></label>
          <div className="space-y-2 text-sm sm:col-span-2">
            <p className="font-semibold">Photo</p>
            <div className="flex flex-wrap items-center gap-2">
              {form.photo_id ? <Photo id={form.photo_id} /> : <span className="text-slate-500">No photo.</span>}
              <button type="button" className={button} onClick={() => setChoosingPhoto(true)}>{form.photo_id ? "Change the photo" : "Choose a photo"}</button>
              {form.photo_id && <button type="button" className={button} onClick={() => setForm({ ...form, photo_id: "" })}>Remove the photo</button>}
            </div>
            {choosingPhoto && (
              <ImagePicker
                mode="photo"
                onClose={() => setChoosingPhoto(false)}
                onPick={(id) => {
                  setForm({ ...form, photo_id: id });
                  setChoosingPhoto(false);
                }}
              />
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 sm:col-span-2 dark:border-[#2b2f36]">
            <button type="button" className={button} onClick={() => setEditing(null)}>Cancel</button>
            <button type="submit" disabled={busy || !form.display_name_en.trim()} className={buttonPrimary}>
              {editing === "new" ? "Add the author" : "Save"}
            </button>
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
            <li key={a.id} className={`${card} flex flex-wrap items-center justify-between gap-3 space-y-0 p-3 text-sm transition-shadow hover:shadow-md ${a.active ? "" : "opacity-75"}`}>
              <div className="flex items-center gap-3">
                {a.photo_id ? (
                  <Photo id={a.photo_id} />
                ) : (
                  <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                    {a.display_name_en.trim().charAt(0).toUpperCase() || "?"}
                  </span>
                )}
                <div>
                <p className="font-semibold">
                  {a.display_name_en}
                  {a.display_name_hi && <span lang="hi" className="ml-2 font-normal text-slate-600 dark:text-slate-300">{a.display_name_hi}</span>}
                  {!a.active && <span className={`${badge} ${tone.slate} ml-2`}>Retired</span>}
                </p>
                <p className={hint}>{KIND_LABELS[a.kind]}{a.beat ? ` · ${a.beat}` : ""}</p>
                </div>
              </div>
              {manage && (
                <div className="flex gap-2">
                  <button type="button" className={button} onClick={() => { setForm(toForm(a)); setEditing(a.id); }}>Edit</button>
                  <button type="button" className={a.active ? buttonDanger : button} onClick={() => void setActive(a, !a.active)}>{a.active ? "Retire" : "Bring back"}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
