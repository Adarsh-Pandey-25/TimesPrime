import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Header from "@/components/news/Header";
import Footer from "@/components/news/Footer";
import GrievanceFigures from "@timesprime/ui/GrievanceFigures";
import { publicReports } from "@timesprime/server/repositories/grievanceReports";
import { isMonth, monthLabel } from "@timesprime/shared/config/grievanceReports";

// Panel 7, M3 (design §5): one month's grievance report, its latest version first; an earlier version
// stays below it, as published. A month with no report, or an address that is not a month, is 404.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ month: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { month } = await params;
  if (!isMonth(month)) return {};
  return {
    title: `Grievance report: ${monthLabel(month)}`,
    alternates: { canonical: `/grievance-report/${month}` },
    description: `Grievances received by TimesPrime in ${monthLabel(month)}, and the action taken.`,
  };
}

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" });
}

export default async function GrievanceReportPage({ params }: Props) {
  const { month } = await params;
  if (!isMonth(month)) notFound();
  const versions = await publicReports(month);
  if (versions.length === 0) notFound();
  const [latest, ...earlier] = versions;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#1a1c1e] text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <Header />
      <main className="flex-1">
        <div className="bg-[#1E3A5F] dark:bg-[#0f1923]">
          <div className="mx-auto max-w-[1500px] px-4 py-12 sm:px-8 sm:py-16 lg:px-10">
            <Link href="/grievance-report" className="inline-flex items-center gap-1.5 text-xs font-bold text-red-300 hover:text-white transition-colors mb-5">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>All monthly reports</span>
            </Link>
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-extrabold text-white">Grievance report: {monthLabel(month)}</h1>
            <div className="mt-4 h-1 w-14 rounded-full bg-red-600" />
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8 sm:py-14 space-y-6">
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-[#383d45] dark:bg-[#25282d] sm:p-8">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {latest.version > 1 ? `Version ${latest.version}, published ${when(latest.published_at)}.` : `Published ${when(latest.published_at)}.`} Figures as of{" "}
              {when(latest.figures.as_of)}, for the grievances received in {monthLabel(month)}.
            </p>
            {latest.note && <p className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-[#1f2226]">{latest.note}</p>}
            <GrievanceFigures figures={latest.figures} />
          </div>

          {earlier.length > 0 && (
            <section aria-labelledby="earlier-title" className="space-y-3">
              <h2 id="earlier-title" className="font-serif text-lg font-bold">
                Earlier versions
              </h2>
              {earlier.map((r) => (
                <details key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-[#383d45] dark:bg-[#25282d]">
                  <summary className="cursor-pointer text-sm font-semibold">
                    Version {r.version}, published {when(r.published_at)}
                  </summary>
                  <div className="mt-4 space-y-3">
                    {r.note && <p className="text-sm">{r.note}</p>}
                    <GrievanceFigures figures={r.figures} />
                  </div>
                </details>
              ))}
            </section>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
