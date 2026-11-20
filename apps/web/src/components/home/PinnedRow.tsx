"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Pin } from "lucide-react";
import { PINNED_ROW_LABEL, type PinnedStory } from "@timesprime/shared/config/frontPage";
import { useLanguage } from "@/context/LanguageContext";

// The pinned row (Panel 3 design §5): the stories editors pinned above the automatic order of the
// home page or a section page. The server renders the English pins into the page; for a reader
// whose language is Hindi, this loads the Hindi pins from /api/news/pins instead, as HomeClient
// refetches the feed. Nothing shows while no pin is live, nor while the Hindi pins load.

const SIZES = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw";

function byline(names: string[], language: "en" | "hi"): string {
  if (names.length === 0) return "";
  const and = language === "hi" ? "और" : "and";
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} ${and} ${names[names.length - 1]}`;
  return language === "hi" ? list : `By ${list}`;
}

export default function PinnedRow({ initial, section }: { initial: PinnedStory[]; section: string | null }) {
  const { language } = useLanguage();
  const [hindi, setHindi] = useState<PinnedStory[] | null>(null);

  useEffect(() => {
    if (language !== "hi") return;
    const controller = new AbortController();
    (async () => {
      try {
        const query = new URLSearchParams({ language: "hi", ...(section ? { section } : {}) });
        const res = await fetch(`/api/news/pins?${query.toString()}`, { signal: controller.signal });
        const data = res.ok ? ((await res.json()) as { pins?: unknown }) : null;
        if (!controller.signal.aborted) setHindi(Array.isArray(data?.pins) ? (data.pins as PinnedStory[]) : []);
      } catch {
        // A failed read shows no row; the rest of the page is unaffected.
        if (!controller.signal.aborted) setHindi([]);
      }
    })();
    return () => controller.abort();
  }, [language, section]);

  const pins = language === "hi" ? (hindi ?? []) : initial;
  if (pins.length === 0) return null;
  const rowLanguage = pins[0].language;

  return (
    <section aria-labelledby="pinned-row-title" lang={rowLanguage} className="space-y-5">
      <div className="border-b-2 border-[#1E3A5F] pb-2">
        <h2 id="pinned-row-title" className="flex items-center gap-2 text-lg font-black uppercase tracking-wider text-slate-900 dark:text-white">
          <Pin aria-hidden="true" className="h-4 w-4 text-red-600 dark:text-red-400" />
          {PINNED_ROW_LABEL[rowLanguage]}
        </h2>
        <div className="mt-1 h-0.5 w-8 rounded-full bg-red-600" aria-hidden="true" />
      </div>
      <ul className={`grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 ${pins.length >= 3 ? "lg:grid-cols-3" : ""}`}>
        {pins.map((pin) => (
          <li key={pin.path}>
            <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0 dark:border-[#2b2f36] dark:bg-[#1e2124]">
              {pin.image ? (
                <picture>
                  <source type="image/avif" srcSet={pin.image.avif} sizes={SIZES} />
                  <source type="image/webp" srcSet={pin.image.webp} sizes={SIZES} />
                  <img src={pin.image.src} alt={pin.image.alt} width={pin.image.width} height={pin.image.height} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                </picture>
              ) : (
                // The section's drawing (B-03): decorative, the headline says what the story is.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pin.drawing} alt="" width={400} height={300} loading="lazy" className="aspect-[4/3] w-full object-cover" />
              )}
              <div className="flex flex-1 flex-col gap-2 p-4 sm:p-5">
                <h3 className="font-serif text-lg font-bold leading-snug text-slate-900 sm:text-xl dark:text-white">
                  {/* The whole card opens the story: the link's box covers it. */}
                  <Link href={pin.path} className="after:absolute after:inset-0 group-hover:text-red-700 dark:group-hover:text-red-400">
                    {pin.headline}
                  </Link>
                </h3>
                {pin.dek && <p className="line-clamp-3 text-sm text-slate-600 dark:text-slate-300">{pin.dek}</p>}
                {(pin.bylines.length > 0 || pin.time) && (
                  <p className="mt-auto pt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {[byline(pin.bylines, pin.language), pin.time].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
