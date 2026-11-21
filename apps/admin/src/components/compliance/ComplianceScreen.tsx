"use client";

import { useAdminMe } from "../desk/deskClient";
import { pageTitle } from "../ui/styles";
import CorrectionsLog from "./CorrectionsLog";
import GrievanceQueue from "./GrievanceQueue";
import MonthlyReport from "./MonthlyReport";

// The Compliance screen (Panel 7 design §4): the duties that apply from the first public day. M1
// brings the grievance queue, M2 the corrections log, M3 the monthly report; the legal-orders register
// and the content record join them in M4. Each part shows for the permission its routes need;
// hiding is UX, the server decides.

export default function ComplianceScreen() {
  const { me, error } = useAdminMe();
  const held = (permission: string) => Boolean(me && me.kind === "staff" && me.permissions[permission]);
  const canGrievances = held("grievance.handle");
  const canCorrections = held("correction.publish");
  const canReport = held("grievance.report");
  const needsCode = me?.kind === "staff" && me.aal === "aal1" && me.mfa.required;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className={pageTitle}>Compliance</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Readers&apos; grievances, each acknowledged within 24 hours and decided within 15 days (the IT Rules, Part III), and the public log of corrections.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}
      {!me && !error && <p role="status" className="text-sm text-slate-500 dark:text-slate-400">Checking your access…</p>}
      {needsCode && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          Your account needs a second factor. <a href="/admin/login" className="underline">Finish signing in</a> with your authenticator code.
        </p>
      )}
      {me && !needsCode && !canGrievances && !canCorrections && !canReport && (
        <p className="text-sm text-slate-600 dark:text-slate-300">Your roles do not include compliance. The Grievance Officer and Legal handle it.</p>
      )}

      {me && !needsCode && canGrievances && <GrievanceQueue />}
      {me && !needsCode && canReport && <MonthlyReport />}
      {me && !needsCode && canCorrections && <CorrectionsLog />}
    </div>
  );
}
