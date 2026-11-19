"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DESK_FORMATS, STORY_LANGUAGES } from "@timesprime/shared/config/desk";
import { SECTION_IDS } from "@timesprime/shared/config/sections";
import { deskCall } from "./deskClient";
import { field } from "../ui/styles";

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
    <form onSubmit={submit} className="max-w-xl space-y-4" aria-labelledby="new-story-heading">
      <h1 id="new-story-heading" className="font-serif text-2xl font-extrabold">New story</h1>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-semibold">
          Language
          <select className={field} value={language} onChange={(e) => setLanguage(e.target.value)}>
            {STORY_LANGUAGES.map((l) => <option key={l} value={l}>{l === "en" ? "English" : "Hindi"}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Section
          <select className={field} value={section} onChange={(e) => setSection(e.target.value)}>
            {SECTION_IDS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Format
          <select className={field} value={format} onChange={(e) => setFormat(e.target.value)}>
            {DESK_FORMATS.map((f) => <option key={f} value={f}>{f.replace("_", " ")}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Start as
          <select className={field} value={state} onChange={(e) => setState(e.target.value === "pitch" ? "pitch" : "draft")}>
            <option value="draft">Draft</option>
            <option value="pitch">Pitch</option>
          </select>
        </label>
      </div>
      <label className="block text-sm font-semibold">
        Headline
        <input className={field} lang={language} required value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="A working headline" />
      </label>
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      <button type="submit" disabled={busy || !headline.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
        {busy ? "Creating…" : "Create and open"}
      </button>
    </form>
  );
}
