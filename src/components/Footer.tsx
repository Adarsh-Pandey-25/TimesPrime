"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowUp } from "lucide-react";
import { Language, TRANSLATIONS } from "@/lib/translations";
import { useTheme } from "@/context/ThemeContext";
import { useLanguage } from "@/context/LanguageContext";

interface FooterProps {
  language?: Language;
}

const SOCIAL_ICONS = [
  {
    label: "Twitter/X",
    bg: "bg-black",
    style: undefined,
    path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  },
  {
    label: "YouTube",
    bg: "bg-red-600",
    style: undefined,
    path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  },
  {
    label: "WhatsApp",
    bg: "bg-green-500",
    style: undefined,
    path: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z",
  },
  {
    label: "Instagram",
    bg: "",
    style: { background: "linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)" },
    path: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z",
  },
  {
    label: "Facebook",
    bg: "bg-blue-600",
    style: undefined,
    path: "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
  },
] as const;

export default function Footer({ language: propsLang }: FooterProps) {
  const { theme } = useTheme();
  const { language: globalLang } = useLanguage();
  const language = globalLang || propsLang || "en";
  const t = TRANSLATIONS[language];
  const isDark = theme === "dark";

  const [newsletterSubmitted, setNewsletterSubmitted] = useState(false);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleNewsletterSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const emailInput = e.currentTarget.querySelector<HTMLInputElement>('input[type="email"]');
    if (!emailInput?.value.trim()) return;
    setNewsletterSubmitted(true);
    setTimeout(() => setNewsletterSubmitted(false), 4000);
  };

  return (
    <footer className="mt-0 transition-colors duration-200">
      {/* SECTION 1 — Main Footer */}
      <div className={isDark ? "bg-[#0f1923] text-slate-300" : "bg-[#1E3A5F] text-slate-300"}>
        <div className="mx-auto max-w-[1500px] px-3 py-8 sm:px-4 sm:py-10 md:px-6 md:py-14 lg:px-10">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {/* Column 1 — Brand & Social */}
            <div className="col-span-2 md:col-span-1 space-y-5 self-start">
              <Link href="/" className="flex items-center space-x-3 group w-fit">
                <Image
                  src="/logo-dark.png"
                  alt="TimesPrime"
                  width={1574}
                  height={261}
                  className="h-8 w-auto sm:h-10 transition-transform group-hover:scale-105"
                />
              </Link>

              <p className="text-xs sm:text-sm leading-relaxed font-medium max-w-lg text-slate-300">
                {t.footer.about}
              </p>

              <div className="space-y-2 pt-1">
                <span className="text-[11px] font-bold uppercase tracking-wider block text-slate-400">
                  {language === "hi" ? "हमें फॉलो करें:" : "Follow Us:"}
                </span>
                <div className="flex items-center space-x-2.5">
                  {SOCIAL_ICONS.map((social) => (
                    <span
                      key={social.label}
                      title={social.label}
                      style={social.style}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg cursor-pointer transition-opacity hover:opacity-80 ${social.bg}`}
                    >
                      <svg viewBox="0 0 24 24" fill="white" className="h-4 w-4">
                        <path d={social.path} />
                      </svg>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Column 2 — News Categories */}
            <div className="space-y-4 self-start">
              <h3 className="text-[10px] font-black uppercase tracking-widest border-l-2 border-red-600 pl-2 text-slate-400">
                {language === "hi" ? "समाचार" : "News"}
              </h3>
              <div className="flex flex-col gap-2 text-sm font-medium">
                <Link href="/?category=general" className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
                  <span>›</span> {t.categories.general}
                </Link>
                <Link href="/?category=india" className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
                  <span>›</span> {t.categories.india}
                </Link>
                <Link href="/?category=world" className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
                  <span>›</span> {t.categories.world}
                </Link>
                <Link href="/?category=tech" className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
                  <span>›</span> {t.categories.tech}
                </Link>
                <Link href="/?category=business" className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
                  <span>›</span> {t.categories.business}
                </Link>
              </div>
            </div>

            {/* Column 3 — More News */}
            <div className="space-y-4 self-start">
              <h3 className="text-[10px] font-black uppercase tracking-widest border-l-2 border-red-600 pl-2 text-slate-400">
                {language === "hi" ? "अधिक समाचार" : "More News"}
              </h3>
              <div className="flex flex-col gap-2 text-sm font-medium">
                <Link href="/?category=sports" className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
                  <span>›</span> {t.categories.sports}
                </Link>
                <Link href="/?category=entertainment" className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
                  <span>›</span> {t.categories.entertainment}
                </Link>
                <Link href="/?category=health" className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
                  <span>›</span> {t.categories.health}
                </Link>
                <Link href="/?category=science" className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
                  <span>›</span> {t.categories.science}
                </Link>
                <Link href="/saved" className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
                  <span>›</span> {language === "hi" ? "सेव किए गए समाचार" : "Saved Articles"}
                </Link>
              </div>
            </div>

            {/* Column 4 — Company (placeholder links) */}
            <div className="space-y-4 self-start">
              <h3 className="text-[10px] font-black uppercase tracking-widest border-l-2 border-red-600 pl-2 text-slate-400">
                {language === "hi" ? "कंपनी" : "Company"}
              </h3>
              <div className="flex flex-col gap-2 text-sm font-medium">
                <Link href="/about" className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
                  <span>›</span> {language === "hi" ? "हमारे बारे में" : "About Us"}
                </Link>
                <Link href="/contact" className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
                  <span>›</span> {language === "hi" ? "संपर्क करें" : "Contact Us"}
                </Link>
                <Link href="#" className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
                  <span>›</span> {language === "hi" ? "विज्ञापन दें" : "Advertise With Us"}
                </Link>
                <Link href="/privacy" className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
                  <span>›</span> {language === "hi" ? "गोपनीयता नीति" : "Privacy Policy"}
                </Link>
                <Link href="/terms" className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
                  <span>›</span> {language === "hi" ? "उपयोग की शर्तें" : "Terms of Use"}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2 — Newsletter Strip */}
      <div className={isDark ? "w-full bg-[#080e14]" : "w-full bg-[#152A47]"}>
        <div className="mx-auto max-w-[1500px] px-3 py-4 sm:px-4 md:px-6 lg:px-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm sm:text-base font-bold text-white text-center sm:text-left">
            📰 {language === "hi" ? "जुड़े रहें — अपनी दैनिक समाचार डाइजेस्ट पाएं" : "Stay Informed — Get Your Daily News Digest"}
          </p>

          {newsletterSubmitted ? (
            <p className="flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white">
              ✓ {language === "hi" ? "सदस्यता सफल!" : "You're subscribed!"}
            </p>
          ) : (
            <form onSubmit={handleNewsletterSubmit} className="flex items-center gap-2 w-full sm:w-auto justify-center">
              <div className="flex w-full sm:w-auto gap-2">
                <input
                  type="email"
                  required
                  placeholder={language === "hi" ? "अपना ईमेल दर्ज करें" : "Enter your email"}
                  className="rounded-lg bg-white text-slate-900 placeholder-slate-400 px-4 py-2 text-sm flex-1 focus:outline-none"
                />
                <button
                  type="submit"
                  className="ml-0 rounded-lg bg-[#DC2626] text-white font-bold px-4 py-2 text-sm hover:bg-[#b91c1c] transition-colors"
                >
                  {language === "hi" ? "सदस्यता लें" : "Subscribe"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* SECTION 3 — Copyright Bar */}
      <div className={isDark ? "bg-[#080e14]" : "bg-[#152A47]"}>
        <div className="mx-auto max-w-[1500px] px-3 py-3 sm:px-4 md:px-6 lg:px-10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <p className="text-slate-400">
            © {new Date().getFullYear()} TimesPrime News Network. {t.footer.allRightsReserved}
          </p>

          <div className="flex items-center flex-wrap justify-center gap-x-2 gap-y-1.5 text-slate-400">
            <Link href="/privacy" className="hover:text-white transition-colors">
              {language === "hi" ? "गोपनीयता नीति" : "Privacy Policy"}
            </Link>
            <span>·</span>
            <Link href="/terms" className="hover:text-white transition-colors">
              {language === "hi" ? "उपयोग की शर्तें" : "Terms of Use"}
            </Link>
            <span>·</span>
            <Link href="/contact" className="hover:text-white transition-colors">
              {language === "hi" ? "संपर्क करें" : "Contact Us"}
            </Link>
            <span>·</span>
            <Link href="#" className="hover:text-white transition-colors">
              {language === "hi" ? "आरएसएस फीड" : "RSS Feeds"}
            </Link>
            <span>·</span>
            <button
              onClick={scrollToTop}
              className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
              title="Back to top"
            >
              <span>{language === "hi" ? "ऊपर जाएं" : "Back to top"}</span>
              <ArrowUp className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
