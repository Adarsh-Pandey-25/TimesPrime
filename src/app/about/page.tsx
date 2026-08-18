import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { ArrowLeft, Radio, Languages, Sparkles } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "TimesPrime is India's premier AI-powered bilingual news aggregator, delivering instant, accurate, and categorized headlines from verified publishers.",
};

const FEATURES = [
  {
    icon: Radio,
    title: "Real-Time News",
    description: "Live updates from 20+ trusted sources, refreshed around the clock so you're never behind the story.",
  },
  {
    icon: Languages,
    title: "Bilingual Coverage",
    description: "A full English and Hindi news experience — switch languages instantly without losing your place.",
  },
  {
    icon: Sparkles,
    title: "AI-Powered",
    description: "Smart categorization and content synthesis that surfaces what matters and cuts through the noise.",
  },
] as const;

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#1a1c1e] text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <div className="bg-[#1E3A5F] dark:bg-[#0f1923]">
          <div className="mx-auto max-w-[1500px] px-4 py-12 sm:px-8 sm:py-16 lg:px-10">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-red-300 hover:text-white transition-colors mb-5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Home</span>
            </Link>
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-extrabold text-white">
              About TimesPrime
            </h1>
            <div className="mt-4 h-1 w-14 rounded-full bg-red-600" />
          </div>
        </div>

        {/* Body */}
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-8 sm:py-14 space-y-12">
          {/* Mission */}
          <section>
            <p className="text-base sm:text-lg leading-relaxed text-slate-700 dark:text-slate-300 font-medium">
              TimesPrime is India&apos;s premier AI-powered bilingual news aggregator, delivering
              instant, accurate, and categorized headlines from verified publishers across India
              and the world.
            </p>
          </section>

          {/* Feature Cards */}
          <section>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-slate-200 dark:border-[#383d45] bg-white dark:bg-[#25282d] p-6 space-y-3 shadow-xs"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-serif text-lg font-bold">{title}</h3>
                  <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    {description}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Team */}
          <section className="rounded-2xl border border-slate-200 dark:border-[#383d45] bg-white dark:bg-[#25282d] p-8 text-center space-y-2">
            <h2 className="font-serif text-xl font-bold">Built With Passion</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              Built with passion by Spaxads Digital Media Pvt Ltd
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
