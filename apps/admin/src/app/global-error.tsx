"use client";

import { useEffect } from "react";
import { reportClientError } from "@timesprime/shared/lib/clientErrorReport";

// An error in the back office's root layout itself (R1-07). It replaces the whole document, with
// no global styles (bundled docs: file-conventions/error.md "Global Error"), so it carries its own.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    // To Sentry, through the reporter instrumentation-client.ts registers (clientErrorReport.ts).
    reportClientError(error);
  }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Georgia, serif", background: "#f8fafc", color: "#0f172a" }}>
        <title>Something went wrong | TimesPrime Admin</title>
        <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 16px" }}>
          <h1 style={{ fontSize: 24, margin: "0 0 12px" }}>Something went wrong</h1>
          <p style={{ lineHeight: 1.6 }}>This page could not be loaded. Please try again.</p>
          <button
            type="button"
            onClick={retry}
            style={{ background: "#dc2626", color: "#fff", border: 0, borderRadius: 12, padding: "8px 16px", fontWeight: 700, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
