import Link from "next/link";
import Header from "@/components/news/Header";
import Footer from "@/components/news/Footer";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { GRIEVANCE_OFFICER, OFFICE_ADDRESS } from "@timesprime/shared/config/site";
import GrievanceForm from "@/components/grievance/GrievanceForm";

// R3: the Grievance Officer, published as the IT Rules, 2021 require of a news publisher, with the
// 24-hour acknowledgement and the 15-day decision the plan sets (docs/NEWSROOM_PLAN.md). Panel 7, M1:
// the form, which gives a ticket at once (components/grievance/GrievanceForm.tsx), and the status
// page; email stays the other way in. The wording is for the owner's legal review (BL-008).
export const metadata: Metadata = {
  title: "Grievance Redressal",
  alternates: { canonical: "/grievance" },
  description: "How to raise a complaint about content on TimesPrime, and who handles it.",
};

const STEPS = [
  "Your name and an email address we can reply to.",
  "The link to the page or story your complaint is about.",
  "What the complaint is, and why.",
  "Any document that supports it, attached to the email.",
] as const;

export default function GrievancePage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#1a1c1e] text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <Header />

      <main className="flex-1">
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
              Grievance Redressal
            </h1>
            <div className="mt-4 h-1 w-14 rounded-full bg-red-600" />
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8 sm:py-14">
          <div className="rounded-2xl border border-slate-200 dark:border-[#383d45] bg-white dark:bg-[#25282d] p-6 sm:p-10 divide-y divide-slate-100 dark:divide-[#2b2f36]">
            <section className="pb-6">
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                If you have a complaint about anything published on TimesPrime, write to our Grievance Officer, appointed
                under the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021.
              </p>
            </section>

            <section className="py-6">
              <h2 className="font-serif text-lg sm:text-xl font-bold border-l-4 border-red-600 pl-3 mb-3">
                Grievance Officer
              </h2>
              <address className="not-italic space-y-1 pl-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                <p className="font-semibold text-slate-900 dark:text-slate-100">{GRIEVANCE_OFFICER.name}</p>
                <p>
                  Email:{" "}
                  <a href={`mailto:${GRIEVANCE_OFFICER.email}`} className="font-semibold text-red-600 dark:text-red-400 hover:underline">
                    {GRIEVANCE_OFFICER.email}
                  </a>
                </p>
                {OFFICE_ADDRESS.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </address>
            </section>

            <section className="py-6" aria-labelledby="grievance-form-title">
              <h2 id="grievance-form-title" className="font-serif text-lg sm:text-xl font-bold border-l-4 border-red-600 pl-3 mb-3">
                Send a grievance
              </h2>
              <div className="pl-3">
                <GrievanceForm />
              </div>
            </section>

            <section className="py-6">
              <h2 className="font-serif text-lg sm:text-xl font-bold border-l-4 border-red-600 pl-3 mb-3">
                Or by email
              </h2>
              <p className="pl-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">Email the Grievance Officer with:</p>
              <ul className="mt-2 list-disc space-y-1 pl-8 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {STEPS.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </section>

            <section className="py-6 last:pb-0">
              <h2 className="font-serif text-lg sm:text-xl font-bold border-l-4 border-red-600 pl-3 mb-3">
                What happens next
              </h2>
              <div className="space-y-3 pl-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                <p>We acknowledge every grievance within 24 hours of receiving it. The form acknowledges it at once, with a ticket number.</p>
                <p>We decide on it within 15 days, and tell you the decision by email.</p>
                <p>
                  With the ticket and your email, you can{" "}
                  <Link href="/grievance/status" className="font-semibold text-red-600 dark:text-red-400 hover:underline">
                    check your grievance&apos;s status
                  </Link>
                  . Each month we publish the{" "}
                  <Link href="/grievance-report" className="font-semibold text-red-600 dark:text-red-400 hover:underline">
                    grievances received and the action taken
                  </Link>
                  .
                </p>
                <p>
                  To report a security issue on this site, write to the same address: the Grievance Officer is also our
                  point of contact for CERT-In.
                </p>
              </div>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
