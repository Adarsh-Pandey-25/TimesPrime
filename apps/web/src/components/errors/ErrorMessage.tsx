// The reader site's not-found and error pages (R1-07), in the reader's language. Each page passes
// its own title and body (not-found.tsx, error.tsx), so the error boundary's client chunk does not
// carry the not-found text; the shared strings live here. None is in the shared translations, so
// the other pages do not carry them. The page design comes in R2; until then this is the plain
// layout of the site's other text pages.
//
// BL-039: no hook and no "use client". Both languages are in the markup, each in a span with its
// own lang, and globals.css shows the one <html lang> names (the language context sets it). So the
// root not-found page renders on the server with no client code at all, and the error boundary,
// which must be a client component, carries only this markup and its retry button. Every page
// route loads both (gotcha 3.27), so what they import is paid on every page.
//
// A plain <a>, not next/link: next/link here cost every page 9 KB (measured in R1-07). Leaving an
// error page is a full page load anyway.
const TEXT = {
  en: { retry: "Try again", home: "Back to the latest news", reference: "Reference" },
  hi: { retry: "फिर से कोशिश करें", home: "ताज़ा समाचार पर लौटें", reference: "संदर्भ" },
} as const;

/** A page's own message, in both languages. */
export interface Message {
  en: { title: string; body: string };
  hi: { title: string; body: string };
}

type Language = keyof typeof TEXT;
type Pick = (language: Language) => string;

/** The text in both languages; globals.css hides the one <html lang> does not name. */
function Both({ text }: { text: Pick }) {
  return (
    <>
      <span lang="en" className="tp-lang-en">
        {text("en")}
      </span>
      <span lang="hi" className="tp-lang-hi">
        {text("hi")}
      </span>
    </>
  );
}

interface ErrorMessageProps {
  message: Message;
  /** The error boundary's retry: shown as a button when given. */
  onRetry?: () => void;
  /** A server error's digest, which matches its line in the server logs. */
  digest?: string;
}

export default function ErrorMessage({ message, onRetry, digest }: ErrorMessageProps) {
  return (
    <main className="flex-1">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-8 sm:py-14 space-y-5">
        <h1 className="font-serif text-3xl sm:text-4xl font-extrabold">
          <Both text={(l) => message[l].title} />
        </h1>
        <div className="h-1 w-14 rounded-full bg-red-600" />
        <p className="text-base leading-relaxed text-slate-700 dark:text-slate-300">
          <Both text={(l) => message[l].body} />
        </p>
        <div className="flex items-center gap-4">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 transition-colors"
            >
              <Both text={(l) => TEXT[l].retry} />
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- on purpose: next/link here cost every page 9 KB (see the top of this file) */}
          <a href="/" className="text-sm font-bold text-red-600 dark:text-red-400 hover:underline">
            <Both text={(l) => TEXT[l].home} />
          </a>
        </div>
        {digest && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            <Both text={(l) => `${TEXT[l].reference}: ${digest}`} />
          </p>
        )}
      </div>
    </main>
  );
}
