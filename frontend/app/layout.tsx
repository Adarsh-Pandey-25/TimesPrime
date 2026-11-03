import type { Metadata, Viewport } from "next";
import { Noto_Serif_Devanagari, PT_Serif } from "next/font/google";
import "@/frontend/styles/globals.css";
import { ThemeProvider } from "@/frontend/context/ThemeContext";
import { LanguageProvider } from "@/frontend/context/LanguageContext";
import { FloatingAiAssistant } from "@/frontend/features/chat";
import { BreakingNewsBanner } from "@/frontend/features/news";
import { THEME_INIT_SCRIPT } from "@/backend/shared/config/theme";

const ptSerif = PT_Serif({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

// PT Serif has no Devanagari, so Hindi fell back to whatever the device had. This face sits after
// it in the font stack (globals.css) and only draws Devanagari. Not preloaded: an English page
// never downloads it.
const notoSerifDevanagari = Noto_Serif_Devanagari({
  weight: "variable",
  subsets: ["devanagari"],
  variable: "--font-devanagari",
  display: "swap",
  preload: false,
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
  icons: {
    icon: "/favicon.png",
  },
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
      className={`${ptSerif.variable} ${notoSerifDevanagari.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the saved theme before the first paint (F-028); see shared/config/theme.ts. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-slate-50 dark:bg-[#1a1c1e] text-slate-900 dark:text-slate-100 font-serif selection:bg-blue-600 selection:text-white transition-colors duration-200">
        <ThemeProvider>
          <LanguageProvider>
            <BreakingNewsBanner />
            {children}
            <FloatingAiAssistant />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
