"use client";

import { useParams } from "next/navigation";
import AdminTopBar from "@/components/AdminTopBar";
import StoryEditor from "@/components/desk/StoryEditor";

// One story on the Desk (Panel 2): the editor and the story's workflow.
export default function StoryPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#1a1c1e] dark:text-slate-100">
      <AdminTopBar />
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-8 lg:px-10">
        <StoryEditor id={id} />
      </main>
    </div>
  );
}
