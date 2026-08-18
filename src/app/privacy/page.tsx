import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How TimesPrime collects, uses, and protects your information.",
};

const SECTIONS = [
  {
    heading: "Information We Collect",
    body: [
      "We collect information you provide directly, such as your email address when you subscribe to our newsletter or submit the contact form.",
      "We also collect limited technical information automatically — like your browser type, device, and general usage patterns — to help us understand how TimesPrime is used and to improve the product.",
      "Articles you bookmark are stored locally in your browser and are not transmitted to our servers unless you are signed in to a synced account.",
    ],
  },
  {
    heading: "How We Use Your Information",
    body: [
      "We use the information we collect to operate and improve TimesPrime, personalize your news feed, respond to inquiries, and send occasional updates if you've opted in to our newsletter.",
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
      "TimesPrime aggregates headlines and articles using NewsData.io, a third-party news API. Article content, images, and metadata displayed on this site originate from the publishers indexed by that service.",
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
      "You can unsubscribe from newsletter emails at any time using the link provided in those emails.",
    ],
  },
  {
    heading: "Contact Us",
    body: [
      "If you have questions about this Privacy Policy, please reach out to us at contact@timesprime.in.",
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
              Last updated: August 2026
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
