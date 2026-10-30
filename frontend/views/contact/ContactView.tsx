"use client";

import Link from "next/link";
import { Header, Footer } from "@/frontend/features/news";
import { ArrowLeft, Mail, Megaphone, MapPin } from "lucide-react";

const CONTACT_INFO = [
  {
    icon: Mail,
    label: "Email",
    value: "contact@timesprime.in",
    href: "mailto:contact@timesprime.in",
  },
  {
    icon: Megaphone,
    label: "For Advertising",
    value: "ads@timesprime.in",
    href: "mailto:ads@timesprime.in",
  },
  {
    icon: MapPin,
    label: "Location",
    value: "India",
    href: undefined,
  },
] as const;

export default function ContactPage() {
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
              Contact Us
            </h1>
            <div className="mt-4 h-1 w-14 rounded-full bg-red-600" />
          </div>
        </div>

        {/* Body */}
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-8 sm:py-14 space-y-10">
          {/* Info Cards */}
          <section className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {CONTACT_INFO.map(({ icon: Icon, label, value, href }) => {
              const cardContent = (
                <>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                    {label}
                  </span>
                  <span className="text-sm font-semibold break-all">{value}</span>
                </>
              );
              const className =
                "rounded-2xl border border-slate-200 dark:border-[#383d45] bg-white dark:bg-[#25282d] p-6 space-y-2 shadow-xs";
              return href ? (
                <a key={label} href={href} className={`${className} hover:border-red-300 dark:hover:border-red-900/60 transition-colors`}>
                  {cardContent}
                </a>
              ) : (
                <div key={label} className={className}>
                  {cardContent}
                </div>
              );
            })}
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
