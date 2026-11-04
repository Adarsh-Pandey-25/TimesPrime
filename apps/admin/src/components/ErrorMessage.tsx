// The back office's not-found and error pages (R1-07). English, like the rest of the back office.
// A plain <a>, not next/link, as in the reader site's (apps/web/src/components/errors): every
// page loads these components, and each got its own copy of next/link's client code.
const TEXT = {
  "not-found": { title: "Page not found", body: "There is no back-office page at this address." },
  error: { title: "Something went wrong", body: "This page could not be loaded. Please try again." },
} as const;

interface ErrorMessageProps {
  kind: "not-found" | "error";
  /** The error boundary's retry: shown as a button when given. */
  onRetry?: () => void;
  /** A server error's digest, which matches its line in the server logs. */
  digest?: string;
}

export default function ErrorMessage({ kind, onRetry, digest }: ErrorMessageProps) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-14 space-y-5">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{TEXT[kind].title}</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">{TEXT[kind].body}</p>
      <div className="flex items-center gap-4">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 transition-colors"
          >
            Try again
          </button>
        )}
        <a href="/admin" className="text-xs font-bold text-red-600 hover:underline">
          Back to the dashboard
        </a>
      </div>
      {digest && <p className="text-xs text-slate-500">Reference: {digest}</p>}
    </main>
  );
}
