"use client";

import { useEffect } from "react";
import { reportClientError } from "@timesprime/shared/lib/clientErrorReport";
import ErrorMessage from "@/components/ErrorMessage";

// An error while rendering a back-office page (R1-07; bundled docs: file-conventions/error.md). A
// boundary catches the error, so nothing reports it unless this does. Not named Error: inside it
// that name would be this function, and `instanceof Error` always false.
export default function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    // To Sentry, through the reporter instrumentation-client.ts registers (clientErrorReport.ts).
    reportClientError(error);
  }, [error]);
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  return <ErrorMessage kind="error" onRetry={retry} digest={digest} />;
}
