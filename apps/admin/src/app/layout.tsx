import type { Metadata, Viewport } from "next";
import { Noto_Serif_Devanagari, PT_Serif } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@timesprime/ui/ThemeContext";
import { THEME_INIT_SCRIPT } from "@timesprime/shared/config/theme";
import { ADMIN_ASSET_PREFIX } from "@timesprime/shared/config/adminAssets";
import { FeedbackProvider } from "@/components/ui/Feedback";

const ptSerif = PT_Serif({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

// The reader site's Devanagari face, so Hindi on the Desk (the editor, the list, the preview) looks
// as it will on the site. It only draws Devanagari, after PT Serif in the font stack (globals.css),
// and is not preloaded: a screen with no Hindi never downloads it.
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1c1e" },
  ],
};

// The back office is never indexed.
export const metadata: Metadata = {
  title: { default: "TimesPrime Admin", template: "%s | TimesPrime Admin" },
  robots: { index: false, follow: false },
  // public/admin-assets/favicon.png: at the root, /favicon.png is the reader site's (R1-04).
  icons: { icon: `${ADMIN_ASSET_PREFIX}/favicon.png` },
};

export default function AdminRootLayout({
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
        {/* Applies the saved theme before the first paint (F-028); see packages/shared/src/config/theme.ts. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-slate-50 dark:bg-[#1a1c1e] text-slate-900 dark:text-slate-100 font-serif selection:bg-blue-600 selection:text-white transition-colors duration-200">
        <ThemeProvider>
          <FeedbackProvider>{children}</FeedbackProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
