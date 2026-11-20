"use client";

import { useParams } from "next/navigation";
import AdminTopBar from "@/components/AdminTopBar";
import GrievanceDetail from "@/components/compliance/GrievanceDetail";

// One grievance (Panel 7, M1): what was sent, its clocks, its notes and the decision.
export default function GrievancePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#1a1c1e] dark:text-slate-100">
      <AdminTopBar />
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-8 lg:px-10">
        <GrievanceDetail id={id} />
      </main>
    </div>
  );
}
