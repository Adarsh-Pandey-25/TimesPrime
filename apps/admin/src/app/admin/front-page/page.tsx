"use client";

import AdminTopBar from "@/components/AdminTopBar";
import FrontPageScreen from "@/components/front/FrontPageScreen";

// The Front page (Panel 3, M2): pinned stories and the breaking banner. The proxy requires a
// session; every request the screen makes is decided by the server.
export default function FrontPagePage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#1a1c1e] dark:text-slate-100">
      <AdminTopBar />
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-8 lg:px-10">
        <FrontPageScreen />
      </main>
    </div>
  );
}
