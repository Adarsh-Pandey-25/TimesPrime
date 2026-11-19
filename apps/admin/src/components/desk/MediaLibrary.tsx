"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { STORY_LANGUAGES } from "@timesprime/shared/config/desk";
import { MEDIA_MAX_BYTES, MEDIA_SOURCES, MEDIA_TEXT_MAX, MEDIA_TYPES, RENDITIONS_TICK_MINUTES, type MediaSource, type RenditionsState } from "@timesprime/shared/config/media";
import { SECTION_IDS } from "@timesprime/shared/config/sections";
import { canAct, deskCall, useAdminMe, when } from "./deskClient";
import { button, field as baseField } from "../ui/styles";
import ActionMessage from "../ui/ActionMessage";

// The Desk's media library (Panel 2 design §7): the images of the person's desks, an upload for
// whoever may edit stories (article.edit, in the desk the image is for), and for a holder of
// media.manage the record's credit, licence, alt text and captions, clearing its rights, and
// retiring it. Publishing will ask every image a story uses for a credit, a source, a licence,
// cleared rights, and alt text and a caption in the story's language. Readers get the renditions the
// worker makes; the original, with the camera's metadata, opens only here, for staff.

interface Media {
  id: string;
  url: string;
  original_url: string;
  renditions_state: RenditionsState;
  language: "en" | "hi";
  section: string;
  credit: string | null;
  source: MediaSource | null;
  licence: string | null;
  licence_expires_at: string | null;
  rights_cleared_by: string | null;
  rights_cleared_at: string | null;
  alt_en: string | null;
  alt_hi: string | null;
  caption_en: string | null;
  caption_hi: string | null;
  renditions_at: string | null;
  active: boolean;
  created_at: string;
}

interface Form {
  credit: string;
  source: string;
  licence: string;
  licence_expires_at: string;
  alt_en: string;
  alt_hi: string;
  caption_en: string;
  caption_hi: string;
}

const EMPTY: Form = { credit: "", source: "", licence: "", licence_expires_at: "", alt_en: "", alt_hi: "", caption_en: "", caption_hi: "" };
const SOURCE_LABELS: Record<MediaSource, string> = { staff: "Staff", agency: "Agency", stock: "Stock", handout: "Handout", social: "Social media" };
const RENDITIONS_LABELS: Record<RenditionsState, string> = {
  waiting: `Sizes for readers: on the way (within ${RENDITIONS_TICK_MINUTES} minutes)`,
  ready: "Sizes for readers: made",
  failed: "Sizes for readers: could not be made from this file. Upload it again.",
};
const field = `mt-0.5 ${baseField}`;

const toForm = (m: Media): Form => ({
  credit: m.credit ?? "",
  source: m.source ?? "",
  licence: m.licence ?? "",
  licence_expires_at: m.licence_expires_at ? m.licence_expires_at.slice(0, 10) : "",
  alt_en: m.alt_en ?? "",
  alt_hi: m.alt_hi ?? "",
  caption_en: m.caption_en ?? "",
  caption_hi: m.caption_hi ?? "",
});

/** The record's fields, shared by the upload and the edit form. */
function RecordFields({ form, onChange }: { form: Form; onChange: (form: Form) => void }) {
  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange({ ...form, [key]: e.target.value });
  return (
    <>
      <label className="text-sm font-semibold">Credit<input className={field} maxLength={MEDIA_TEXT_MAX.credit} value={form.credit} onChange={set("credit")} placeholder="Photo: Asha Rao / TimesPrime" /></label>
      <label className="text-sm font-semibold">
        Source
        <select className={field} value={form.source} onChange={set("source")}>
          <option value="">Not known yet</option>
          {MEDIA_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
        </select>
      </label>
      <label className="text-sm font-semibold">Licence<input className={field} maxLength={MEDIA_TEXT_MAX.licence} value={form.licence} onChange={set("licence")} placeholder="Own work; Agency contract; CC BY 4.0" /></label>
      <label className="text-sm font-semibold">Licence ends<input type="date" className={field} value={form.licence_expires_at} onChange={set("licence_expires_at")} /></label>
      <label className="text-sm font-semibold">Alt text, English<input className={field} maxLength={MEDIA_TEXT_MAX.alt} value={form.alt_en} onChange={set("alt_en")} /></label>
      <label className="text-sm font-semibold">Alt text, Hindi<input className={field} lang="hi" maxLength={MEDIA_TEXT_MAX.alt} value={form.alt_hi} onChange={set("alt_hi")} /></label>
      <label className="text-sm font-semibold">Caption, English<textarea className={field} rows={2} maxLength={MEDIA_TEXT_MAX.caption} value={form.caption_en} onChange={set("caption_en")} /></label>
      <label className="text-sm font-semibold">Caption, Hindi<textarea className={field} rows={2} lang="hi" maxLength={MEDIA_TEXT_MAX.caption} value={form.caption_hi} onChange={set("caption_hi")} /></label>
    </>
  );
}

export default function MediaLibrary() {
  const { me, error: meError } = useAdminMe();
  const [media, setMedia] = useState<Media[] | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [section, setSection] = useState<string>(SECTION_IDS[0]);
  const [form, setForm] = useState<Form>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mayUpload = canAct(me, "article.edit");
  const manage = canAct(me, "media.manage");

  const load = useCallback(async () => {
    const res = await deskCall<{ media: Media[] }>("/api/admin/desk/media?retired=1");
    if (res.ok && res.data) {
      setMedia(res.data.media);
      setError("");
    } else {
      setMedia([]);
      setError(res.error ?? "Could not load the library.");
    }
  }, []);

  // Necessary setState-in-effect: the library comes from an async fetch, which cannot run during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function upload() {
    if (!file) return;
    if (file.size > MEDIA_MAX_BYTES) return setMessage({ ok: false, text: "The image is larger than 15 MB." });
    const body = new FormData();
    body.set("file", file);
    body.set("language", language);
    body.set("section", section);
    for (const [key, value] of Object.entries(form)) body.set(key, value);
    setBusy(true);
    const res = await deskCall("/api/admin/desk/media", { method: "POST", body });
    setBusy(false);
    if (!res.ok) return setMessage({ ok: false, text: res.error ?? "Not uploaded." });
    setMessage({ ok: true, text: "Image uploaded. A Desk Editor clears its rights before a story using it is published." });
    setUploading(false);
    setFile(null);
    setForm(EMPTY);
    await load();
  }

  async function change(item: Media, body: Record<string, unknown>, done: string) {
    setBusy(true);
    const res = await deskCall(`/api/admin/desk/media/${item.id}`, { method: "PATCH", body: JSON.stringify(body) });
    setBusy(false);
    setMessage(res.ok ? { ok: true, text: done } : { ok: false, text: res.error ?? "Not changed." });
    if (res.ok) {
      setEditing(null);
      await load();
    }
  }

  if (meError) return <p role="alert" className="text-sm text-red-700 dark:text-red-300">{meError}</p>;

  return (
    <section aria-labelledby="media-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Link href="/admin/desk" className="text-sm text-blue-700 hover:underline dark:text-blue-300">← Desk</Link>
          <h1 id="media-heading" className="font-serif text-2xl font-extrabold">Media library</h1>
        </div>
        {mayUpload && !uploading && (
          <button type="button" className={button} onClick={() => { setForm(EMPTY); setUploading(true); }}>Upload an image</button>
        )}
      </div>
      <ActionMessage message={message} />

      {mayUpload && uploading && (
        <form onSubmit={(e) => { e.preventDefault(); void upload(); }} aria-label="Upload an image" className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2 dark:border-[#2b2f36]">
          <label className="text-sm font-semibold sm:col-span-2">
            Image (JPEG, PNG, WebP or AVIF, at most 15 MB)
            <input type="file" className={field} accept={Object.keys(MEDIA_TYPES).join(",")} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <label className="text-sm font-semibold">
            Language
            <select className={field} value={language} onChange={(e) => setLanguage(e.target.value === "hi" ? "hi" : "en")}>
              {STORY_LANGUAGES.map((l) => <option key={l} value={l}>{l === "en" ? "English" : "Hindi"}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Section
            <select className={field} value={section} onChange={(e) => setSection(e.target.value)}>
              {SECTION_IDS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <RecordFields form={form} onChange={setForm} />
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" disabled={busy || !file} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              {busy ? "Uploading…" : "Upload"}
            </button>
            <button type="button" className={button} onClick={() => setUploading(false)}>Cancel</button>
          </div>
        </form>
      )}

      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      {media === null ? (
        <p aria-live="polite" className="text-sm text-slate-500">Loading the library…</p>
      ) : media.length === 0 && !error ? (
        <p className="text-sm text-slate-500">No images yet.{mayUpload ? " Add one with Upload an image." : ""}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {media.map((m) => (
            <li key={m.id} className="space-y-2 rounded-lg border border-slate-200 p-2 text-sm dark:border-[#2b2f36]">
              {/* The library's own files, served from the site's /media (CloudFront on the server). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.alt_en ?? m.alt_hi ?? ""} loading="lazy" className="h-40 w-full rounded object-cover" />
              <p className="text-xs text-slate-500">
                {m.language === "hi" ? "Hindi" : "English"} · {m.section} · {when(m.created_at)}
                {!m.active && <span className="ml-2 font-bold">Retired</span>}
              </p>
              <p>{m.credit ?? <span className="text-slate-500">No credit yet</span>}{m.source ? ` · ${SOURCE_LABELS[m.source]}` : ""}</p>
              <p className={`text-xs font-bold ${m.rights_cleared_at ? "text-green-700 dark:text-green-300" : "text-amber-700 dark:text-amber-300"}`}>
                {m.rights_cleared_at ? `Rights cleared ${when(m.rights_cleared_at)}` : "Rights not cleared"}
              </p>
              <p className={`text-xs ${m.renditions_state === "failed" ? "font-bold text-red-700 dark:text-red-300" : "text-slate-500"}`}>
                {RENDITIONS_LABELS[m.renditions_state]}{" "}
                <a href={m.original_url} target="_blank" rel="noopener" className="text-blue-700 hover:underline dark:text-blue-300">Original</a>
              </p>
              {manage && editing === m.id ? (
                <form onSubmit={(e) => { e.preventDefault(); void change(m, { ...form }, "Image saved."); }} aria-label="Edit the image" className="grid gap-2">
                  <RecordFields form={form} onChange={setForm} />
                  <div className="flex gap-2">
                    <button type="submit" disabled={busy} className={button}>Save</button>
                    <button type="button" className={button} onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </form>
              ) : manage ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={button} onClick={() => { setForm(toForm(m)); setEditing(m.id); }}>Edit</button>
                  <button type="button" className={button} disabled={busy} onClick={() => void change(m, { rights_cleared: !m.rights_cleared_at }, m.rights_cleared_at ? "Clearance withdrawn." : "Rights cleared.")}>
                    {m.rights_cleared_at ? "Withdraw clearance" : "Clear rights"}
                  </button>
                  <button type="button" className={button} disabled={busy} onClick={() => void change(m, { active: !m.active }, m.active ? "Image retired." : "Image brought back.")}>
                    {m.active ? "Retire" : "Bring back"}
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
