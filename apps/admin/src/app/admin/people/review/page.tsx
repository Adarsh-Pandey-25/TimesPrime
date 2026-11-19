"use client";

import AdminTopBar from "@/components/AdminTopBar";
import AccessReview from "@/components/people/AccessReview";

// The access review (Panel 1): every 90 days, every role kept, revoked or renewed.
export default function ReviewPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#1a1c1e] dark:text-slate-100">
      <AdminTopBar />
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-8 lg:px-10">
        <AccessReview />
      </main>
    </div>
  );
}
