import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Header from "@/components/news/Header";
import Footer from "@/components/news/Footer";
import { reportFallback } from "@timesprime/server/lib/reportFallback";
import { publicReports, type PublicReport } from "@timesprime/server/repositories/grievanceReports";
import { monthLabel } from "@timesprime/shared/config/grievanceReports";

// Panel 7, M3 (design §5; Rule 18(3) of the IT Rules): the monthly reports of grievances received and
// the action taken, newest month first. Each month links to its own page. Read on each request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Monthly grievance reports",
  alternates: { canonical: "/grievance-report" },
  description: "Each month's grievances received by TimesPrime and the action taken, as the IT Rules ask.",
};

/** The latest version of each month, newest month first, with how many versions it has. */
function byMonth(reports: PublicReport[]): Array<{ latest: PublicReport; versions: number }> {
  const months = new Map<string, { latest: PublicReport; versions: number }>();
  for (const r of reports) {
    const seen = months.get(r.month);
    if (!seen) months.set(r.month, { latest: r, versions: 1 });
    else {
      seen.versions += 1;
      if (r.version > seen.latest.version) seen.latest = r;
    }
  }
  return [...months.values()].sort((a, b) => b.latest.month.localeCompare(a.latest.month));
}

const monthKey = (stored: string) => stored.slice(0, 7);

export default async function GrievanceReportsPage() {
  let reports: PublicReport[] = [];
  let failed = false;
  try {
    reports = await publicReports();
  } catch (err) {
    console.error("Grievance reports read failed:", err);
    reportFallback("grievance_reports_unavailable", { page: "list" });
    failed = true;
  }
  const months = byMonth(reports);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#1a1c1e] text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <Header />
      <main className="flex-1">
        <div className="bg-[#1E3A5F] dark:bg-[#0f1923]">
          <div className="mx-auto max-w-[1500px] px-4 py-12 sm:px-8 sm:py-16 lg:px-10">
            <Link href="/grievance" className="inline-flex items-center gap-1.5 text-xs font-bold text-red-300 hover:text-white transition-colors mb-5">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Grievance Redressal</span>
            </Link>
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-extrabold text-white">Monthly grievance reports</h1>
            <div className="mt-4 h-1 w-14 rounded-full bg-red-600" />
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8 sm:py-14 space-y-6">
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Each month we publish how many grievances we received and what we did about them, as Rule 18(3) of the Information Technology
            (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021 asks. A report never changes once published; a corrected one is
            published as a new version beside it.
          </p>

          {failed && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              The reports could not be loaded just now. Please try again in a moment.
            </p>
          )}
          {!failed && months.length === 0 && <p className="text-sm text-slate-600 dark:text-slate-400">No report has been published yet.</p>}

          {months.length > 0 && (
            <ol aria-label="Reports, newest month first" className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white dark:divide-[#2b2f36] dark:border-[#383d45] dark:bg-[#25282d]">
              {months.map(({ latest, versions }) => {
                const key = monthKey(latest.month);
                const f = latest.figures;
                return (
                  <li key={key} className="space-y-1 p-5">
                    <Link href={`/grievance-report/${key}`} className="font-serif text-lg font-bold hover:text-red-600 dark:hover:text-red-400">
                      {monthLabel(key)}
                    </Link>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      {f.received.total} received · {f.decided.total} decided ({f.decided.within_15_days} within 15 days) · {f.open.total} open
                    </p>
                    {versions > 1 && <p className="text-xs text-slate-500 dark:text-slate-400">Reissued: {versions} versions</p>}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
