import Link from "next/link";
import Header from "@/components/news/Header";
import Footer from "@/components/news/Footer";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import GrievanceStatusLookup from "@/components/grievance/GrievanceStatusLookup";

// Panel 7, M1: a grievance's status, for whoever has its ticket and the email it was sent with. Not
// for search engines: it holds nothing until a reader asks.
export const metadata: Metadata = {
  title: "Grievance status",
  alternates: { canonical: "/grievance/status" },
  description: "Check the status of a grievance sent to TimesPrime, with its ticket and your email.",
  robots: { index: false, follow: true },
};

export default function GrievanceStatusPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#1a1c1e] text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <Header />

      <main className="flex-1">
        <div className="bg-[#1E3A5F] dark:bg-[#0f1923]">
          <div className="mx-auto max-w-[1500px] px-4 py-12 sm:px-8 sm:py-16 lg:px-10">
            <Link href="/grievance" className="inline-flex items-center gap-1.5 text-xs font-bold text-red-300 hover:text-white transition-colors mb-5">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Grievance Redressal</span>
            </Link>
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-extrabold text-white">Grievance status</h1>
            <div className="mt-4 h-1 w-14 rounded-full bg-red-600" />
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8 sm:py-14">
          <div className="rounded-2xl border border-slate-200 dark:border-[#383d45] bg-white dark:bg-[#25282d] p-6 sm:p-10">
            <GrievanceStatusLookup />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
