import type { Metadata } from "next";
import ErrorMessage from "@/components/ErrorMessage";

// An unknown /admin/... page, and every notFound() in the back office (R1-07). Next answers 404
// with noindex (bundled docs: file-conventions/not-found.md); the root layout already says noindex.
export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return <ErrorMessage kind="not-found" />;
}
