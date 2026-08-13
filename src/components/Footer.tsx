"use client";

import Link from "next/link";
import { Newspaper, ArrowUp, Globe } from "lucide-react";
import { Language, TRANSLATIONS } from "@/lib/translations";
import { useTheme } from "@/context/ThemeContext";
import { useLanguage } from "@/context/LanguageContext";

interface FooterProps {
  language?: Language;
}

export default function Footer({ language: propsLang }: FooterProps) {
  const { theme } = useTheme();
  const { language: globalLang } = useLanguage();
  const language = globalLang || propsLang || "en";
  const t = TRANSLATIONS[language];
  const isDark = theme === "dark";

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <footer
      className={`mt-12 sm:mt-16 lg:mt-20 border-t transition-colors duration-200 ${
        isDark
          ? "border-[#2b2f36] bg-[#121417] text-slate-300"
          : "border-slate-200 bg-slate-100 text-slate-700"
      }`}
    >
      {/* Top Red Accent Stripe */}
      <div className="h-1 w-full bg-gradient-to-r from-red-600 via-rose-500 to-red-600" />

      <div className="mx-auto max-w-[1500px] px-3 py-8 sm:px-4 sm:py-10 md:px-6 md:py-14 lg:px-10">
        <div className="grid grid-cols-1 gap-8 sm:gap-10 md:grid-cols-12">
          {/* Brand & About Column */}
          <div className="space-y-5 md:col-span-7">
            <Link href="/" className="flex items-center space-x-3 group">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-600 to-rose-700 text-white shadow-md shadow-red-500/20 transition-transform group-hover:scale-105">
                <Newspaper className="h-6 w-6" />
              </div>
              <div>
                <span className={`font-serif text-2xl font-black tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                  TIMES<span className="text-red-600">PRIME</span>
                </span>
                <span className={`block text-[9px] tracking-widest uppercase font-bold ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  SABSE TEZ • {t.globalNewsHub}
                </span>
              </div>
            </Link>

            <p className={`text-xs sm:text-sm leading-relaxed font-medium max-w-lg ${isDark ? "text-slate-400" : "text-slate-600"}`}>
              {t.footer.about}
            </p>

            {/* Social Follow Network */}
            <div className="space-y-2 pt-1">
              <span className={`text-[11px] font-bold uppercase tracking-wider block ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                {language === "hi" ? "सोशल मीडिया पर जुड़ें:" : "Connect With Us:"}
              </span>
              <div className="flex items-center space-x-2.5">
                <span className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors cursor-pointer text-xs font-bold shadow-xs ${isDark ? "bg-[#22262c] text-white hover:bg-red-600" : "bg-slate-200 text-slate-800 hover:bg-red-600 hover:text-white"}`}>𝕏</span>
                <span className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors cursor-pointer text-xs font-bold shadow-xs ${isDark ? "bg-[#22262c] text-white hover:bg-red-600" : "bg-slate-200 text-slate-800 hover:bg-red-600 hover:text-white"}`}>▶</span>
                <span className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors cursor-pointer text-xs font-bold shadow-xs ${isDark ? "bg-[#22262c] text-white hover:bg-emerald-600" : "bg-slate-200 text-slate-800 hover:bg-emerald-600 hover:text-white"}`}>💬</span>
                <span className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors cursor-pointer text-xs font-bold shadow-xs ${isDark ? "bg-[#22262c] text-white hover:bg-pink-600" : "bg-slate-200 text-slate-800 hover:bg-pink-600 hover:text-white"}`}>📷</span>
                <span className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors cursor-pointer text-xs font-bold shadow-xs ${isDark ? "bg-[#22262c] text-white hover:bg-blue-600" : "bg-slate-200 text-slate-800 hover:bg-blue-600 hover:text-white"}`}>f</span>
              </div>
            </div>
          </div>

          {/* Quick Categories Navigation */}
          <div className="space-y-4 md:col-span-5">
            <h3 className={`text-xs font-black uppercase tracking-widest border-l-2 border-red-600 pl-2 ${isDark ? "text-white" : "text-slate-900"}`}>
              {t.footer.newsCategories}
            </h3>
            <div className={`grid grid-cols-2 gap-2 text-xs sm:text-sm font-semibold ${isDark ? "text-slate-400" : "text-slate-600"}`}>
              <Link href="/?category=general" className="hover:text-red-600 dark:hover:text-red-400 transition-colors flex items-center gap-1.5"><span>›</span> {t.categories.general}</Link>
              <Link href="/?category=tech" className="hover:text-red-600 dark:hover:text-red-400 transition-colors flex items-center gap-1.5"><span>›</span> {t.categories.tech}</Link>
              <Link href="/?category=business" className="hover:text-red-600 dark:hover:text-red-400 transition-colors flex items-center gap-1.5"><span>›</span> {t.categories.business}</Link>
              <Link href="/?category=sports" className="hover:text-red-600 dark:hover:text-red-400 transition-colors flex items-center gap-1.5"><span>›</span> {t.categories.sports}</Link>
              <Link href="/?category=entertainment" className="hover:text-red-600 dark:hover:text-red-400 transition-colors flex items-center gap-1.5"><span>›</span> {t.categories.entertainment}</Link>
              <Link href="/?category=health" className="hover:text-red-600 dark:hover:text-red-400 transition-colors flex items-center gap-1.5"><span>›</span> {t.categories.health}</Link>
              <Link href="/?category=science" className="hover:text-red-600 dark:hover:text-red-400 transition-colors flex items-center gap-1.5"><span>›</span> {t.categories.science}</Link>
              <Link href="/saved" className="hover:text-red-600 dark:hover:text-red-400 transition-colors flex items-center gap-1.5"><span>›</span> {language === "hi" ? "सेव किए गए समाचार" : "Saved Articles"}</Link>
            </div>
          </div>
        </div>

        {/* Bottom Copyright & Back-To-Top Bar */}
        <div className={`mt-8 sm:mt-12 flex flex-col items-center justify-between border-t pt-4 sm:pt-6 text-[10px] sm:text-xs sm:flex-row gap-3 sm:gap-4 ${isDark ? "border-[#262a30] text-slate-500" : "border-slate-300 text-slate-500"}`}>
          <p>© {new Date().getFullYear()} TimesPrime News Network. {t.footer.allRightsReserved}</p>

          <div className="flex items-center space-x-6">

            <button
              onClick={scrollToTop}
              className={`flex items-center space-x-1 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors cursor-pointer ${isDark ? "bg-[#22262c] text-slate-300 hover:bg-red-600 hover:text-white" : "bg-slate-200 text-slate-700 hover:bg-red-600 hover:text-white"}`}
              title="Back to top"
            >
              <span>{language === "hi" ? "ऊपर जाएं" : "Back to top"}</span>
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
