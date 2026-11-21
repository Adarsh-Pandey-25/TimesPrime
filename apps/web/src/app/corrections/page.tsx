import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Header from "@/components/news/Header";
import Footer from "@/components/news/Footer";
import { reportFallback } from "@timesprime/server/lib/reportFallback";
import { publicCorrections } from "@timesprime/server/repositories/corrections";
import { CORRECTION_KIND_LABELS, CORRECTIONS_PAGE, isCorrectionKind, type PublicCorrection } from "@timesprime/shared/config/corrections";
import { deskStoryPath } from "@timesprime/shared/lib/storyUrl";

// Panel 7, M2 (design §4): every public correction of the newsroom's stories, newest first, 30 to a
// page. A story's headline and link show while it is live; a withdrawn story's do not, as its headline
// may be what was wrong. Read on each request from corrections_log (no staff, no grievances).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Corrections",
  alternates: { canonical: "/corrections" },
  description: "Every correction, clarification and retraction TimesPrime has published, newest first.",
};

const WITHDRAWN = { en: "A story we have withdrawn", hi: "एक खबर जो हमने वापस ले ली" } as const;

function when(iso: string, language: "en" | "hi"): string {
  return new Date(iso).toLocaleDateString(language === "hi" ? "hi-IN" : "en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" });
}

/** ?before=<time>: the page after the one that ended there. Anything that is not a time is the first page. */
function beforeFrom(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const at = Date.parse(raw);
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
}

async function readLog(before: string | null): Promise<{ list: PublicCorrection[]; failed: boolean }> {
  try {
    return { list: (await publicCorrections({ before, limit: CORRECTIONS_PAGE })) ?? [], failed: false };
  } catch (err) {
    console.error("Corrections log read failed:", err);
    reportFallback("corrections_unavailable", { page: "log" });
    return { list: [], failed: true };
  }
}

export default async function CorrectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const before = beforeFrom((await searchParams).before);
  const { list, failed } = await readLog(before);
  const older = list.length === CORRECTIONS_PAGE ? list[list.length - 1].published_at : null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#1a1c1e] text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <Header />
      <main className="flex-1">
        <div className="bg-[#1E3A5F] dark:bg-[#0f1923]">
          <div className="mx-auto max-w-[1500px] px-4 py-12 sm:px-8 sm:py-16 lg:px-10">
            <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-bold text-red-300 hover:text-white transition-colors mb-5">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Home</span>
            </Link>
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-extrabold text-white">Corrections</h1>
            <div className="mt-4 h-1 w-14 rounded-full bg-red-600" />
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8 sm:py-14 space-y-6">
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            When we get something wrong, we correct it, under the story and here. To tell us about an error, use our{" "}
            <Link href="/grievance" className="font-semibold text-red-600 dark:text-red-400 hover:underline">
              grievance page
            </Link>
            .
          </p>

          {failed && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              The corrections could not be loaded just now. Please try again in a moment.
            </p>
          )}
          {!failed && list.length === 0 && <p className="text-sm text-slate-600 dark:text-slate-400">{before ? "No older corrections." : "No corrections yet."}</p>}

          {list.length > 0 && (
            <ol aria-label="Corrections, newest first" className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white dark:divide-[#2b2f36] dark:border-[#383d45] dark:bg-[#25282d]">
              {list.map((c) => {
                const kind = isCorrectionKind(c.kind) ? CORRECTION_KIND_LABELS[c.kind][c.language] : c.kind;
                const live = c.story_live && c.section && c.public_id !== null;
                return (
                  <li key={c.id} lang={c.language} className="space-y-1.5 p-5">
                    <p className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                      {kind} · <time dateTime={c.published_at}>{when(c.published_at, c.language)}</time>
                    </p>
                    {live ? (
                      <Link
                        href={deskStoryPath({ language: c.language, section: c.section as string, slug: c.slug, public_id: c.public_id as number })}
                        className="block font-serif text-lg font-bold hover:text-red-600 dark:hover:text-red-400"
                      >
                        {c.headline}
                      </Link>
                    ) : (
                      <p className="font-serif text-lg font-bold text-slate-500 dark:text-slate-400">{WITHDRAWN[c.language]}</p>
                    )}
                    <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{c.text}</p>
                  </li>
                );
              })}
            </ol>
          )}

          {older && (
            <Link href={`/corrections?before=${encodeURIComponent(older)}`} className="inline-block text-sm font-semibold text-red-600 dark:text-red-400 hover:underline">
              Older corrections →
            </Link>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
