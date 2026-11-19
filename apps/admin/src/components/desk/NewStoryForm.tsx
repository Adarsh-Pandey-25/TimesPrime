"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DESK_FORMATS, STORY_LANGUAGES } from "@timesprime/shared/config/desk";
import { SECTION_IDS } from "@timesprime/shared/config/sections";
import { deskCall } from "./deskClient";
import { backLink, buttonPrimary, card, field, hint, label, pageTitle } from "../ui/styles";

// A new story (Panel 2 design §4): its desk (language and section), its format and a working headline.
// The server checks the caller may create in that desk; the story then opens in the editor.

export default function NewStoryForm() {
  const router = useRouter();
  const [language, setLanguage] = useState<string>("en");
  const [section, setSection] = useState<string>(SECTION_IDS[0]);
  const [format, setFormat] = useState<string>("news");
  const [state, setState] = useState<"draft" | "pitch">("draft");
  const [headline, setHeadline] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await deskCall<{ story: { id: string } }>("/api/admin/desk/stories", {
      method: "POST",
      body: JSON.stringify({ language, section, format, state, headline }),
    });
    setBusy(false);
    if (res.ok && res.data) router.push(`/admin/desk/${res.data.story.id}`);
    else setError(res.error ?? "The story could not be created.");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/admin/desk" className={backLink}>← Desk</Link>
      <form onSubmit={submit} className={`${card} space-y-4`} aria-labelledby="new-story-heading">
        <div className="space-y-1">
          <h1 id="new-story-heading" className={pageTitle}>New story</h1>
          <p className={hint}>Its desk, its format and a working headline. It opens in the editor.</p>
        </div>
        <label className={label}>
          Headline
          <input className={`${field} mt-1 font-serif text-base`} lang={language} required value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="A working headline" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Language
            <select className={`${field} mt-1`} value={language} onChange={(e) => setLanguage(e.target.value)}>
              {STORY_LANGUAGES.map((l) => <option key={l} value={l}>{l === "en" ? "English" : "Hindi"}</option>)}
            </select>
          </label>
          <label className={label}>
            Section
            <select className={`${field} mt-1`} value={section} onChange={(e) => setSection(e.target.value)}>
              {SECTION_IDS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className={label}>
            Format
            <select className={`${field} mt-1`} value={format} onChange={(e) => setFormat(e.target.value)}>
              {DESK_FORMATS.map((f) => <option key={f} value={f}>{f.replace("_", " ")}</option>)}
            </select>
          </label>
          <label className={label}>
            Start as
            <select className={`${field} mt-1`} value={state} onChange={(e) => setState(e.target.value === "pitch" ? "pitch" : "draft")}>
              <option value="draft">Draft</option>
              <option value="pitch">Pitch</option>
            </select>
          </label>
        </div>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">{error}</p>}
        <div className="flex justify-end border-t border-slate-100 pt-4 dark:border-[#2b2f36]">
          <button type="submit" disabled={busy || !headline.trim()} className={buttonPrimary}>
            {busy ? "Creating…" : "Create and open"}
          </button>
        </div>
      </form>
    </div>
  );
}
