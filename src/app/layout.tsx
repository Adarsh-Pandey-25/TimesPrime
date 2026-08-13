import type { Metadata, Viewport } from "next";
import { PT_Serif } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/context/ThemeContext";
import { LanguageProvider } from "@/context/LanguageContext";
import FloatingAiAssistant from "@/components/FloatingAiAssistant";

const ptSerif = PT_Serif({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1c1e" },
  ],
};

export const metadata: Metadata = {
  title: {
    default: "TimesPrime News - Premium News Aggregator",
    template: "%s | TimesPrime News",
  },
  description: "Stay updated with real-time headlines, top news, and AI-curated summaries from around the globe.",
  keywords: ["news", "headlines", "world news", "technology", "business", "entertainment", "sports"],
  authors: [{ name: "TimesPrime Team" }],
  openGraph: {
    title: "TimesPrime News - Premium News Aggregator",
    description: "Stay updated with real-time headlines and AI-curated news.",
    url: "https://timesprimenews.com",
    siteName: "TimesPrime News",
    locale: "en_US",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${ptSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-slate-50 dark:bg-[#1a1c1e] text-slate-900 dark:text-slate-100 font-serif selection:bg-blue-600 selection:text-white transition-colors duration-200">
        <ThemeProvider>
          <LanguageProvider>
            {children}
            <FloatingAiAssistant />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
