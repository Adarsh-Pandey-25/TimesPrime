import type { Metadata } from "next";
import ErrorMessage, { type Message } from "@/components/errors/ErrorMessage";

// Any unmatched URL, and every notFound() with no nearer not-found file (R1-07). Next answers 404
// and adds <meta name="robots" content="noindex"> (bundled docs: file-conventions/not-found.md).
export const metadata: Metadata = { title: "Page not found" };

// A server component (BL-039): it ships no client code.
const MESSAGE: Message = {
  en: { title: "Page not found", body: "The page you asked for does not exist, or it has moved." },
  hi: { title: "पेज नहीं मिला", body: "आप जो पेज ढूँढ रहे हैं, वह मौजूद नहीं है या कहीं और चला गया है।" },
};

export default function NotFound() {
  return <ErrorMessage message={MESSAGE} />;
}
