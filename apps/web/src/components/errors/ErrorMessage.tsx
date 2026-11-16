"use client";

import { useLanguage } from "@/context/LanguageContext";

// The reader site's not-found and error pages (R1-07), in the reader's language. The strings live
// here, not in the shared translations, so the other pages do not carry them. The page design
// comes in R2; until then this is the plain layout of the site's other text pages.
//
// A plain <a>, not next/link: every page loads the root not-found and error components, and each
// got its own copy of next/link's client code (+9 KB a route, measured). Leaving an error page is
// a full page load anyway.
const TEXT = {
  en: {
    "not-found": { title: "Page not found", body: "The page you asked for does not exist, or it has moved." },
    error: { title: "Something went wrong", body: "This page could not be loaded. Please try again." },
    retry: "Try again",
    home: "Back to the latest news",
    reference: "Reference",
  },
  hi: {
    "not-found": { title: "पेज नहीं मिला", body: "आप जो पेज ढूँढ रहे हैं, वह मौजूद नहीं है या कहीं और चला गया है।" },
    error: { title: "कुछ गड़बड़ हो गई", body: "यह पेज लोड नहीं हो सका। कृपया फिर से कोशिश करें।" },
    retry: "फिर से कोशिश करें",
    home: "ताज़ा समाचार पर लौटें",
    reference: "संदर्भ",
  },
} as const;

interface ErrorMessageProps {
  kind: "not-found" | "error";
  /** The error boundary's retry: shown as a button when given. */
  onRetry?: () => void;
  /** A server error's digest, which matches its line in the server logs. */
  digest?: string;
}

export default function ErrorMessage({ kind, onRetry, digest }: ErrorMessageProps) {
  const { language } = useLanguage();
  const t = TEXT[language === "hi" ? "hi" : "en"];
  return (
    <main className="flex-1">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-8 sm:py-14 space-y-5">
        <h1 className="font-serif text-3xl sm:text-4xl font-extrabold">{t[kind].title}</h1>
        <div className="h-1 w-14 rounded-full bg-red-600" />
        <p className="text-base leading-relaxed text-slate-700 dark:text-slate-300">{t[kind].body}</p>
        <div className="flex items-center gap-4">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 transition-colors"
            >
              {t.retry}
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- on purpose: next/link here cost every page 9 KB (see the top of this file) */}
          <a href="/" className="text-sm font-bold text-red-600 dark:text-red-400 hover:underline">
            {t.home}
          </a>
        </div>
        {digest && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t.reference}: {digest}
          </p>
        )}
      </div>
    </main>
  );
}
