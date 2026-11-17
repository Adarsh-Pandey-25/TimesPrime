import Link from "next/link";
import Header from "@/components/news/Header";
import Footer from "@/components/news/Footer";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { CONTACT_EMAIL, GRIEVANCE_OFFICER, OFFICE_ADDRESS } from "@timesprime/shared/config/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  alternates: { canonical: "/privacy" },
  description: "How TimesPrime collects, uses, and protects your information.",
};

const SECTIONS = [
  {
    heading: "Information We Collect",
    body: [
      "If you email us, we receive your email address and what you write, and use them only to reply.",
      "We also collect limited technical information automatically — like your browser type, device, and general usage patterns — to help us understand how TimesPrime is used and to improve the product.",
      "Articles you save are stored only in your browser and are not sent to our servers.",
    ],
  },
  {
    heading: "How We Use Your Information",
    body: [
      "We use the information we collect to operate and improve TimesPrime and to reply to your emails.",
      "We do not sell your personal information to third parties.",
    ],
  },
  {
    heading: "Data Storage and Security",
    body: [
      "Application data is stored using Supabase, which provides encrypted storage and access controls. We take reasonable technical and organizational measures to protect your information against unauthorized access, alteration, or loss.",
      "No method of transmission or storage is 100% secure, and we cannot guarantee absolute security.",
    ],
  },
  {
    heading: "Third Party Services",
    body: [
      "TimesPrime shows the headlines and short summaries of outside stories using NewsData.io, a third-party news API. They come from the publishers indexed by that service, and each links to the publisher's own page.",
      "We use Supabase for our backend database and authentication infrastructure. These providers may process limited technical data as part of delivering their services to us.",
    ],
  },
  {
    heading: "Cookies and Local Storage",
    body: [
      "We use local storage in your browser to remember preferences such as your selected language, theme (light/dark), and saved articles. These are not third-party tracking cookies and are never sold or shared.",
      "You can clear this data at any time by clearing your browser's site storage for TimesPrime.",
    ],
  },
  {
    heading: "Your Rights",
    body: [
      "You may request access to, correction of, or deletion of any personal information we hold about you by contacting us using the details below.",
    ],
  },
  {
    heading: "Grievance Officer",
    body: [
      `Complaints about this policy, or about how we handle your information, can be sent to our Grievance Officer, ${GRIEVANCE_OFFICER.name}, at ${GRIEVANCE_OFFICER.email}, or by post to ${OFFICE_ADDRESS.join(", ")}. The Grievance Redressal page says how a complaint is handled.`,
    ],
  },
  {
    heading: "Contact Us",
    body: [
      `If you have questions about this Privacy Policy, please write to us at ${CONTACT_EMAIL}.`,
    ],
  },
] as const;

export default function PrivacyPolicyPage() {
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
              Privacy Policy
            </h1>
            <div className="mt-4 h-1 w-14 rounded-full bg-red-600" />
            <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-slate-300">
              Last updated: November 2026
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8 sm:py-14">
          <div className="rounded-2xl border border-slate-200 dark:border-[#383d45] bg-white dark:bg-[#25282d] p-6 sm:p-10 divide-y divide-slate-100 dark:divide-[#2b2f36]">
            {SECTIONS.map(({ heading, body }, idx) => (
              <section key={heading} className={idx === 0 ? "pb-6" : "py-6 last:pb-0"}>
                <h2 className="font-serif text-lg sm:text-xl font-bold border-l-4 border-red-600 pl-3 mb-3">
                  {heading}
                </h2>
                <div className="space-y-3 pl-3">
                  {body.map((paragraph, pIdx) => (
                    <p key={pIdx} className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
