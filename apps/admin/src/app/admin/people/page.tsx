"use client";

import AdminTopBar from "@/components/AdminTopBar";
import PeopleDirectory from "@/components/people/PeopleDirectory";

// The staff directory (Panel 1): people, their roles and access, and a Super Admin's requests.
export default function PeoplePage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#1a1c1e] dark:text-slate-100">
      <AdminTopBar />
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-8 lg:px-10">
        <PeopleDirectory />
      </main>
    </div>
  );
}
