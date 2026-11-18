"use client";

import { useEffect, useState } from "react";
import { GALLERY_MAX, GALLERY_MIN, type RenditionRatio, type RenditionsState } from "@timesprime/shared/config/media";
import { deskCall } from "./deskClient";

// Choosing library images (Panel 2 design §7): the images of the person's desks, each with what it
// still lacks, and, for a story, the crop readers get. Retired images are not offered.
// - "image": one image for a story's text;
// - "gallery": two to twelve images, shown together (design §5);
// - "photo": an author's photo, beside their byline (desk-8): its rights must be cleared.

interface Choice {
  id: string;
  url: string;
  language: "en" | "hi";
  section: string;
  credit: string | null;
  rights_cleared_at: string | null;
  alt_en: string | null;
  alt_hi: string | null;
  caption_en: string | null;
  caption_hi: string | null;
  renditions_state: RenditionsState;
}

const RATIOS: Array<[RenditionRatio, string]> = [["16x9", "16:9 (wide)"], ["4x3", "4:3"], ["1x1", "Square"]];
const button = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40 dark:border-[#3a3f47] dark:hover:bg-[#2b2f36]";

/** What a story in `language` still needs of the image before it is published; for a photo, its rights. */
function missing(m: Choice, language: "en" | "hi" | null): string[] {
  const out: string[] = [];
  if (!m.rights_cleared_at) out.push("rights not cleared");
  if (!language) return out;
  if (!(language === "hi" ? m.alt_hi : m.alt_en)) out.push(language === "hi" ? "no Hindi alt text" : "no English alt text");
  if (!(language === "hi" ? m.caption_hi : m.caption_en)) out.push(language === "hi" ? "no Hindi caption" : "no English caption");
  return out;
}

export default function ImagePicker({
  mode = "image",
  language = null,
  onPick,
  onPickMany,
  onClose,
}: {
  mode?: "image" | "gallery" | "photo";
  language?: "en" | "hi" | null;
  onPick?: (id: string, ratio: RenditionRatio) => void;
  onPickMany?: (ids: string[], ratio: RenditionRatio) => void;
  onClose: () => void;
}) {
  const [images, setImages] = useState<Choice[] | null>(null);
  const [error, setError] = useState("");
  const [ratio, setRatio] = useState<RenditionRatio>(mode === "photo" ? "1x1" : "16x9");
  const [chosen, setChosen] = useState<string[]>([]);

  useEffect(() => {
    void deskCall<{ media: Choice[] }>("/api/admin/desk/media").then((res) => {
      setImages(res.ok && res.data ? res.data.media : []);
      setError(res.ok ? "" : (res.error ?? "Could not load the library."));
    });
  }, []);

  const toggle = (id: string) =>
    setChosen((now) => (now.includes(id) ? now.filter((c) => c !== id) : now.length < GALLERY_MAX ? [...now, id] : now));
  const label = mode === "photo" ? "Choose the author's photo" : mode === "gallery" ? "Add a gallery" : "Add an image";

  return (
    <section aria-label={label} className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-[#2b2f36]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {mode === "photo" ? (
          <p className="text-sm font-semibold">{label}: shown round, beside the byline. Its rights must be cleared.</p>
        ) : (
          <label className="text-sm font-semibold">
            Crop{" "}
            <select className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-[#3a3f47] dark:bg-[#25282d]" value={ratio} onChange={(e) => setRatio(e.target.value as RenditionRatio)}>
              {RATIOS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          </label>
        )}
        <div className="flex gap-2">
          {mode === "gallery" && (
            <button type="button" className={button} disabled={chosen.length < GALLERY_MIN} onClick={() => onPickMany?.(chosen, ratio)}>
              Add the gallery ({chosen.length} of {GALLERY_MIN} to {GALLERY_MAX})
            </button>
          )}
          <button type="button" className={button} onClick={onClose}>Close</button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      {images === null ? (
        <p aria-live="polite" className="text-sm text-slate-500">Loading the library…</p>
      ) : images.length === 0 && !error ? (
        <p className="text-sm text-slate-500">No images yet. Upload one in the media library first.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((m) => {
            const lacks = missing(m, mode === "photo" ? null : language);
            const picked = chosen.includes(m.id);
            return (
              <li key={m.id} className="space-y-2 rounded-lg border border-slate-200 p-2 text-sm dark:border-[#2b2f36]">
                {/* The library's own files: a rendition, or the original through the back office. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt={(language === "hi" ? m.alt_hi : m.alt_en) ?? ""} loading="lazy" className="h-40 w-full rounded object-cover" />
                <p className="text-xs text-slate-500">{m.credit ?? "No credit yet"} · {m.section}</p>
                {lacks.length > 0 && <p className="text-xs font-bold text-amber-700 dark:text-amber-300">Before publishing: {lacks.join(", ")}</p>}
                {mode === "gallery" ? (
                  <button type="button" className={button} aria-pressed={picked} onClick={() => toggle(m.id)}>
                    {picked ? `In the gallery (${chosen.indexOf(m.id) + 1})` : "Add to the gallery"}
                  </button>
                ) : (
                  <button type="button" className={button} disabled={mode === "photo" && !m.rights_cleared_at} onClick={() => onPick?.(m.id, ratio)}>
                    {mode === "photo" ? "Use as the photo" : "Add to the story"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
