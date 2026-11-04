import type { Metadata } from "next";
import ErrorMessage from "@/components/errors/ErrorMessage";

// Any unmatched URL, and every notFound() with no nearer not-found file (R1-07). Next answers 404
// and adds <meta name="robots" content="noindex"> (bundled docs: file-conventions/not-found.md).
export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return <ErrorMessage kind="not-found" />;
}
