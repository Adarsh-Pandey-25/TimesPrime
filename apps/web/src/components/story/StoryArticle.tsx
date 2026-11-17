import Link from "next/link";
import { renderStory } from "@timesprime/editor/render";
import { TRANSLATIONS } from "@timesprime/shared/config/translations";
import { isSection } from "@timesprime/shared/config/sections";
import type { PublishedStory } from "@timesprime/shared/types";

// A Desk story as readers see it (Panel 2 design §6): the published revision's headline, dek and
// text, the bylines, the times and the correction note, in the story's own language. A server
// component: the body is drawn on the server from the story schema, so no editor code is sent.

const LABELS = {
  en: { by: "By", and: "and", additional_reporting: "Additional reporting by", translated_by: "Translated by", published: "Published", updated: "Updated", correction: "Correction" },
  hi: { by: "", and: "और", additional_reporting: "अतिरिक्त रिपोर्टिंग:", translated_by: "अनुवाद:", published: "प्रकाशित", updated: "अपडेट", correction: "सुधार" },
} as const;

/** "A", "A and B", "A, B and C", in the story's language. */
function names(list: string[], and: string): string {
  return list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} ${and} ${list[list.length - 1]}`;
}

function when(iso: string, language: "en" | "hi"): string {
  const time = new Date(iso).toLocaleString(language === "hi" ? "hi-IN" : "en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${time} IST`;
}

/** Later than the first publication by more than a minute: the story was updated since. */
function updatedSince(first: string | null, latest: string | null): boolean {
  return Boolean(first && latest && Date.parse(latest) - Date.parse(first) > 60_000);
}

export default function StoryArticle({ story }: { story: PublishedStory }) {
  const { revision, language } = story;
  const labels = LABELS[language];
  const credits = (role: PublishedStory["bylines"][number]["role"]) => story.bylines.filter((b) => b.role === role).map((b) => b.name);
  const byline = credits("byline");
  const sectionLabel = isSection(story.section) ? TRANSLATIONS[language].categories[story.section] : story.section;

  return (
    <article lang={language} className="mx-auto max-w-3xl px-4 py-8">
      <Link href={`/${story.section}`} className="text-xs font-bold uppercase tracking-wide text-brand hover:underline">
        {sectionLabel}
      </Link>
      <h1 className="mt-2 font-serif text-3xl font-extrabold leading-tight md:text-4xl">{revision.headline}</h1>
      {revision.dek && <p className="mt-3 text-lg leading-relaxed text-slate-600 dark:text-slate-300">{revision.dek}</p>}

      <div className="mt-4 space-y-1 border-b border-slate-200 pb-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
        {byline.length > 0 && (
          <p className="font-semibold text-slate-900 dark:text-slate-100">{[labels.by, names(byline, labels.and)].filter(Boolean).join(" ")}</p>
        )}
        {story.first_published_at && (
          <p>
            {labels.published} <time dateTime={story.first_published_at}>{when(story.first_published_at, language)}</time>
            {updatedSince(story.first_published_at, story.published_at) && story.published_at && (
              <>
                {" · "}
                {labels.updated} <time dateTime={story.published_at}>{when(story.published_at, language)}</time>
              </>
            )}
          </p>
        )}
      </div>

      <div className="story-body mt-6 text-lg leading-relaxed">{renderStory(revision.body)}</div>

      {(credits("additional_reporting").length > 0 || credits("translated_by").length > 0) && (
        <div className="mt-8 space-y-1 text-sm text-slate-600 dark:text-slate-400">
          {credits("additional_reporting").length > 0 && <p>{labels.additional_reporting} {names(credits("additional_reporting"), labels.and)}</p>}
          {credits("translated_by").length > 0 && <p>{labels.translated_by} {names(credits("translated_by"), labels.and)}</p>}
        </div>
      )}

      {story.correction_note && (
        <aside aria-labelledby="correction-heading" className="mt-8 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-4 dark:bg-amber-950/30">
          <h2 id="correction-heading" className="text-sm font-bold uppercase tracking-wide">{labels.correction}</h2>
          <p className="mt-1 text-sm">{story.correction_note}</p>
        </aside>
      )}
    </article>
  );
}
