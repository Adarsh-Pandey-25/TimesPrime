import type { Metadata, Viewport } from "next";
import { PT_Serif } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@timesprime/ui/ThemeContext";
import { THEME_INIT_SCRIPT } from "@timesprime/shared/config/theme";

const ptSerif = PT_Serif({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
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
  icons: { icon: "/favicon.png" },
};

export default function AdminRootLayout({
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
      <head>
        {/* Applies the saved theme before the first paint (F-028); see packages/shared/src/config/theme.ts. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-slate-50 dark:bg-[#1a1c1e] text-slate-900 dark:text-slate-100 font-serif selection:bg-blue-600 selection:text-white transition-colors duration-200">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
