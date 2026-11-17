"use client";

import { useEffect } from "react";
import { reportClientError } from "@timesprime/shared/lib/clientErrorReport";
import ErrorMessage, { type Message } from "@/components/errors/ErrorMessage";

const MESSAGE: Message = {
  en: { title: "Something went wrong", body: "This page could not be loaded. Please try again." },
  hi: { title: "कुछ गड़बड़ हो गई", body: "यह पेज लोड नहीं हो सका। कृपया फिर से कोशिश करें।" },
};

// An error while rendering a page, inside the root layout (R1-07; bundled docs:
// file-conventions/error.md). A boundary catches the error, so nothing reports it unless this
// does. `retry` re-fetches and re-renders the segment. Not named Error, as the docs' example is:
// inside it that name is this function, and `instanceof Error` would always be false.
export default function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    // To Sentry, through the reporter instrumentation-client.ts registers (clientErrorReport.ts).
    reportClientError(error);
  }, [error]);
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  return <ErrorMessage message={MESSAGE} onRetry={retry} digest={digest} />;
}
