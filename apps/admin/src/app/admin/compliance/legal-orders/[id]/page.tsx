"use client";

import { useParams } from "next/navigation";
import AdminTopBar from "@/components/AdminTopBar";
import LegalOrderDetail from "@/components/compliance/LegalOrderDetail";

// One legal order (Panel 7, M4): confidential; what it is, its stories, its state and what was done.
export default function LegalOrderPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#1a1c1e] dark:text-slate-100">
      <AdminTopBar />
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-8 lg:px-10">
        <LegalOrderDetail id={id} />
      </main>
    </div>
  );
}
