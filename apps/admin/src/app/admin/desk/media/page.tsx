"use client";

import AdminTopBar from "@/components/AdminTopBar";
import MediaLibrary from "@/components/desk/MediaLibrary";

// The Desk's media library (Panel 2, M4): the images stories use.
export default function MediaPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#1a1c1e] dark:text-slate-100">
      <AdminTopBar />
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-8 lg:px-10">
        <MediaLibrary />
      </main>
    </div>
  );
}
