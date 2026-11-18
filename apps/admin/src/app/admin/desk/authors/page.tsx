"use client";

import AdminTopBar from "@/components/AdminTopBar";
import AuthorsManager from "@/components/desk/AuthorsManager";

// The Desk's authors (Panel 2): the names stories credit.
export default function AuthorsPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#1a1c1e] dark:text-slate-100">
      <AdminTopBar />
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-8 lg:px-10">
        <AuthorsManager />
      </main>
    </div>
  );
}
