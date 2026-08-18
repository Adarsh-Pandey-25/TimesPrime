"use client";

import { useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { ArrowLeft, Mail, Megaphone, MapPin, Send, CheckCircle2 } from "lucide-react";

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
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);
  };

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

          {/* Contact Form */}
          <section className="rounded-2xl border border-slate-200 dark:border-[#383d45] bg-white dark:bg-[#25282d] p-6 sm:p-8">
            {submitted ? (
              <div className="text-center py-8 space-y-3">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <h3 className="font-serif text-xl font-bold">Message Sent!</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                  Thanks for reaching out — we&apos;ll get back to you soon.
                </p>
                <button
                  onClick={() => setSubmitted(false)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-400 hover:text-red-700 transition-colors pt-2"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Name
                    </label>
                    <input
                      id="name"
                      type="text"
                      required
                      className="w-full rounded-xl border border-slate-200 dark:border-[#383d45] bg-slate-50 dark:bg-[#1f2226] text-slate-900 dark:text-white placeholder-slate-400 px-4 py-2.5 text-sm focus:outline-none focus:border-red-500 transition-colors"
                      placeholder="Your full name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      className="w-full rounded-xl border border-slate-200 dark:border-[#383d45] bg-slate-50 dark:bg-[#1f2226] text-slate-900 dark:text-white placeholder-slate-400 px-4 py-2.5 text-sm focus:outline-none focus:border-red-500 transition-colors"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="message" className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Message
                  </label>
                  <textarea
                    id="message"
                    required
                    rows={5}
                    className="w-full rounded-xl border border-slate-200 dark:border-[#383d45] bg-slate-50 dark:bg-[#1f2226] text-slate-900 dark:text-white placeholder-slate-400 px-4 py-2.5 text-sm focus:outline-none focus:border-red-500 transition-colors resize-none"
                    placeholder="How can we help?"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-red-700 transition-colors shadow-xs"
                >
                  <Send className="h-4 w-4" />
                  <span>Send Message</span>
                </button>
              </form>
            )}
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
