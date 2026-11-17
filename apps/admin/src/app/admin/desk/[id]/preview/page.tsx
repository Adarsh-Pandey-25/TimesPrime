"use client";

import { useParams } from "next/navigation";
import AdminTopBar from "@/components/AdminTopBar";
import StoryPreview from "@/components/desk/StoryPreview";

// A story's preview on the Desk (Panel 2, owner decision 7): its last saved version as readers will
// see it.
export default function StoryPreviewPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#1a1c1e] dark:text-slate-100">
      <AdminTopBar />
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-8 lg:px-10">
        <StoryPreview id={id} />
      </main>
    </div>
  );
}
