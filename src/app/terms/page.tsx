import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The terms and conditions governing your use of TimesPrime.",
};

const SECTIONS = [
  {
    heading: "Acceptance of Terms",
    body: [
      "By accessing or using TimesPrime, you agree to be bound by these Terms of Use. If you do not agree with any part of these terms, please do not use the service.",
    ],
  },
  {
    heading: "Use of Service",
    body: [
      "TimesPrime is provided for personal, non-commercial use to browse aggregated news headlines and summaries in English and Hindi.",
      "You agree not to misuse the service, including attempting to disrupt its operation, scrape it at scale, or use it in any way that violates applicable laws.",
    ],
  },
  {
    heading: "Content and Intellectual Property",
    body: [
      "Headlines, article excerpts, and images displayed on TimesPrime are sourced from third-party publishers via NewsData.io and remain the property of their respective owners. TimesPrime does not claim ownership of this third-party content.",
      "The TimesPrime name, logo, and site design are the property of Spaxads Digital Media Pvt Ltd and may not be used without permission.",
    ],
  },
  {
    heading: "Disclaimer of Warranties",
    body: [
      "TimesPrime is provided on an \"as is\" and \"as available\" basis. We do not guarantee the accuracy, completeness, or timeliness of any aggregated news content, and we are not responsible for errors or omissions originating from third-party publishers.",
    ],
  },
  {
    heading: "Limitation of Liability",
    body: [
      "To the fullest extent permitted by law, TimesPrime and its operators shall not be liable for any indirect, incidental, or consequential damages arising from your use of the service.",
    ],
  },
  {
    heading: "Changes to Terms",
    body: [
      "We may update these Terms of Use from time to time. Continued use of TimesPrime after changes are posted constitutes acceptance of the revised terms.",
    ],
  },
  {
    heading: "Contact",
    body: [
      "Questions about these Terms of Use can be sent to contact@timesprime.in.",
    ],
  },
] as const;

export default function TermsOfUsePage() {
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
              Terms of Use
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
