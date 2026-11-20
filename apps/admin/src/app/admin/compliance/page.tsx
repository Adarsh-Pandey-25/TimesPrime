"use client";

import AdminTopBar from "@/components/AdminTopBar";
import ComplianceScreen from "@/components/compliance/ComplianceScreen";

// Compliance (Panel 7, M1): the grievance queue. The proxy requires a session; every request the
// screen makes is decided by the server.
export default function CompliancePage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#1a1c1e] dark:text-slate-100">
      <AdminTopBar />
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-8 lg:px-10">
        <ComplianceScreen />
      </main>
    </div>
  );
}
