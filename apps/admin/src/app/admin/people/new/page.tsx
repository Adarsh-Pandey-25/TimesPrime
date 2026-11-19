"use client";

import AdminTopBar from "@/components/AdminTopBar";
import AddPerson from "@/components/people/AddPerson";

// Adding a person (Panel 1): their account, a first role, and a one-time link.
export default function NewPersonPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#1a1c1e] dark:text-slate-100">
      <AdminTopBar />
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-8 lg:px-10">
        <AddPerson />
      </main>
    </div>
  );
}
