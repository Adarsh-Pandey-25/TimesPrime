"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Newspaper, Globe, Menu, X, Sun, Moon, Search, User, ChevronDown, Bookmark } from "lucide-react";
import { Language, TRANSLATIONS } from "@/lib/translations";
import CategoryMegaMenu from "@/components/CategoryMegaMenu";
import { Article } from "@/types";
import { useTheme } from "@/context/ThemeContext";
import { getBookmarks } from "@/lib/bookmarks";
import { useLanguage } from "@/context/LanguageContext";

interface HeaderProps {
  activeCategory?: string;
  onSelectCategory?: (category: string) => void;
  onToggleChatbot?: () => void;
  isChatOpen?: boolean;
  language?: Language;
  onChangeLanguage?: (lang: Language) => void;
  searchQuery?: string;
  onSearch?: (query: string) => void;
  articles?: Article[];
}

const CATEGORY_IDS = [
  "general",
  "india",
  "world",
  "tech",
  "business",
  "sports",
  "entertainment",
  "health",
  "science",
] as const;

export default function Header({
  activeCategory = "general",
  onSelectCategory,
  onToggleChatbot,
  isChatOpen = false,
  language: propsLanguage,
  onChangeLanguage: propsOnChangeLanguage,
  searchQuery = "",
  onSearch,
  articles = [],
}: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const { language: globalLang, toggleLanguage: globalToggleLang } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [menuDropdownOpen, setMenuDropdownOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(searchQuery);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const [bookmarkCount, setBookmarkCount] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [time, setTime] = useState<Date>(new Date());
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnterCategory = (catId: string) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredCategory(catId);
  };

  const handleMouseLeaveNav = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredCategory(null);
    }, 250);
  };

  useEffect(() => {
    setMounted(true);
    setTime(new Date());
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const updateCount = () => {
      setBookmarkCount(getBookmarks().length);
    };
    updateCount();
    window.addEventListener("timesprime_bookmarks_updated", updateCount);
    return () => {
      window.removeEventListener("timesprime_bookmarks_updated", updateCount);
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setMenuDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Lock body scroll when mobile menu open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const isDark = theme === "dark";
  const activeLang = globalLang || propsLanguage || "en";
  const t = TRANSLATIONS[activeLang];

  const toggleLanguage = () => {
    globalToggleLang();
    if (propsOnChangeLanguage) {
      propsOnChangeLanguage(activeLang === "en" ? "hi" : "en");
    }
  };

  const router = useRouter();

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    setMobileSearchOpen(false);
    setMobileMenuOpen(false);
    if (onSearch) {
      onSearch(trimmed);
    }
    const targetUrl = trimmed ? `/?search=${encodeURIComponent(trimmed)}` : `/`;
    if (typeof window !== "undefined") {
      window.location.href = targetUrl;
    } else {
      router.push(targetUrl);
    }
  };

  return (
    <header
      className={`sticky top-0 z-40 w-full border-b shadow-xs transition-colors duration-200 ${
        isDark
          ? "border-[#33373d] bg-[#1f2226] text-slate-100"
          : "border-slate-200 bg-white text-slate-900"
      }`}
    >
      {/* Main Branding & Navigation Header */}
      <div className="mx-auto flex max-w-[1500px] items-center justify-between px-3 py-2.5 sm:px-4 md:px-6 lg:px-10 gap-2 sm:gap-4">
        {/* Left Side: Brand Logo + Date Display */}
        <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
          <Link
            href="/"
            onClick={() => {
              setSearchInput("");
              if (onSelectCategory) {
                onSelectCategory("general");
              }
            }}
            className="group flex items-center space-x-2 sm:space-x-3 cursor-pointer"
          >
            <div className="flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-gradient-to-br from-red-600 to-rose-700 text-white shadow-md shadow-red-500/20 transition-transform group-hover:scale-105">
              <Newspaper className="h-5 w-5 sm:h-7 sm:w-7" />
            </div>
            <div>
              <span className="font-serif text-xl sm:text-2xl lg:text-3xl font-black tracking-tight">
                TIMES<span className="text-red-600">PRIME</span>
              </span>
              <div className="text-[8px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                SABSE TEZ • {t.globalNewsHub}
              </div>
            </div>
          </Link>
        </div>

        {/* Center: Desktop Search Input */}
        <div className="hidden md:flex flex-1 justify-center max-w-md mx-4">
          <form onSubmit={handleSearchSubmit} className="relative w-full">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={activeLang === "hi" ? "समाचार खोजें..." : "Search news..."}
              className={`w-full rounded-xl border py-2 pl-4 pr-10 text-xs font-medium focus:outline-none transition-colors ${
                isDark
                  ? "border-[#383d45] bg-[#272a2f] text-white placeholder-slate-400 focus:border-red-500"
                  : "border-slate-200 bg-slate-50 text-slate-900 placeholder-slate-400 focus:border-red-600 shadow-xs"
              }`}
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-red-600 transition-colors"
              title="Search"
            >
              <Search className="h-4 w-4 text-red-600" />
            </button>
          </form>
        </div>

        {/* Right Side Actions with Date & Time stacked ABOVE buttons */}
        <div className="flex flex-col items-end justify-center shrink-0 space-y-1">
          {/* Live Date & Time Widget (Placed directly ABOVE the action icons) */}
          <div className="flex items-center space-x-1.5 text-[10px] sm:text-[11px] font-bold translate-x-0 -translate-y-1 sm:translate-x-8 sm:-translate-y-1.5">
            {mounted ? (
              <>
                <span className="font-extrabold text-red-600 dark:text-red-400">
                  {time.toLocaleDateString(activeLang === "hi" ? "hi-IN" : "en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <span className="font-mono text-slate-600 dark:text-slate-300 font-bold">
                  {time.toLocaleTimeString(activeLang === "hi" ? "hi-IN" : "en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: true,
                  })}
                </span>
              </>
            ) : (
              <span className="h-4 w-24 sm:w-32 animate-pulse bg-slate-200 dark:bg-[#2b2f36] rounded-md"></span>
            )}
          </div>

          {/* Action Buttons Row BELOW Date & Time */}
          <div className="flex items-center space-x-2 sm:space-x-2.5">
            {/* Mobile Search Toggle */}
            <button
              onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
              className={`md:hidden flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${
                isDark ? "border-[#383d45] text-slate-200 hover:bg-[#272a2f]" : "border-slate-200 text-slate-700 hover:bg-slate-100"
              }`}
            >
              <Search className="h-4 w-4" />
            </button>

            {/* Language Switcher (Icon Only) */}
            <button
              onClick={toggleLanguage}
              className={`hidden sm:flex h-9 w-9 items-center justify-center rounded-xl border transition-all ${
                isDark
                  ? "border-red-500/40 bg-red-950/40 text-red-300 hover:bg-red-900/60"
                  : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
              }`}
              title={activeLang === "en" ? "हिंदी में बदलें" : "Switch to English"}
            >
              <Globe className="h-4 w-4 text-red-600" />
            </button>

            {/* Saved Articles (Icon Only) */}
            <Link
              href="/saved"
              className={`hidden sm:flex h-9 w-9 items-center justify-center rounded-xl border transition-all relative ${
                isDark
                  ? "border-[#383d45] bg-[#272a2f] text-slate-200 hover:bg-[#31353c]"
                  : "border-slate-200 bg-slate-100 text-slate-800 hover:bg-slate-200"
              }`}
              title="View Saved Articles"
            >
              <Bookmark className="h-4 w-4 text-red-600" />
              {bookmarkCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-black text-white">
                  {bookmarkCount}
                </span>
              )}
            </Link>

            {/* Theme Toggle (Icon Only) */}
            <button
              onClick={toggleTheme}
              className={`hidden sm:flex h-9 w-9 items-center justify-center rounded-xl border transition-all ${
                isDark
                  ? "border-[#383d45] bg-[#272a2f] text-amber-400 hover:bg-[#31353c]"
                  : "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
              title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Login Button (Icon Only) */}
            <Link
              href="/admin"
              className="hidden sm:flex h-9 w-9 items-center justify-center rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-600/20 transition-all"
              title={activeLang === "hi" ? "लॉगिन / एडमिन" : "Login / Admin"}
            >
              <User className="h-4 w-4" />
            </Link>

            {/* Mobile Hamburger Menu Toggle Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={`md:hidden flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${
                isDark ? "border-[#383d45] text-slate-200 hover:bg-[#272a2f]" : "border-slate-200 text-slate-700 hover:bg-slate-100"
              }`}
              aria-label="Open Navigation Drawer"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Search Bar (slides down) */}
      {mobileSearchOpen && (
        <div className={`md:hidden px-3 pb-3 border-b ${isDark ? "border-[#2b2f36]" : "border-slate-200"}`}>
          <form onSubmit={handleSearchSubmit} className="relative w-full">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={activeLang === "hi" ? "समाचार खोजें..." : "Search news..."}
              autoFocus
              className={`w-full rounded-xl border py-2.5 pl-4 pr-10 text-sm font-medium focus:outline-none transition-colors ${
                isDark
                  ? "border-[#383d45] bg-[#272a2f] text-white placeholder-slate-400 focus:border-red-500"
                  : "border-slate-200 bg-slate-50 text-slate-900 placeholder-slate-400 focus:border-red-600 shadow-xs"
              }`}
            />
            <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2">
              <Search className="h-4 w-4 text-red-600" />
            </button>
          </form>
        </div>
      )}

      {/* Mobile Left Navigation Drawer (React Portal directly to document.body) */}
      {mobileMenuOpen && mounted && createPortal(
        <div className="md:hidden fixed inset-0 z-[99999] flex animate-in fade-in duration-200">
          {/* Dark Backdrop Blur */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Left Slide-Out Sidebar Drawer Panel */}
          <div className={`relative z-10 w-[88vw] max-w-xs h-full flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-left duration-250 ${
            isDark
              ? "bg-[#181a1d] text-slate-100 border-r border-[#2d323a]"
              : "bg-white text-slate-900 border-r border-slate-200"
          }`}>
            {/* Drawer Header with Logo & Close Button */}
            <div className={`flex items-center justify-between px-5 py-4 border-b ${
              isDark ? "bg-[#1f2227] border-[#2b2f36]" : "bg-slate-50 border-slate-200"
            }`}>
              <div className="flex items-center space-x-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-red-600 to-rose-700 text-white shadow-md">
                  <Newspaper className="h-4 w-4" />
                </div>
                <div>
                  <span className="font-serif text-lg font-black tracking-tight">
                    TIMES<span className="text-red-600">PRIME</span>
                  </span>
                  <span className="block text-[8px] font-bold uppercase tracking-widest text-slate-400">
                    {t.globalNewsHub}
                  </span>
                </div>
              </div>

              {/* Close X Button */}
              <button
                onClick={() => setMobileMenuOpen(false)}
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                  isDark ? "bg-[#2b2f36] text-slate-200 hover:bg-red-600 hover:text-white" : "bg-slate-200 text-slate-700 hover:bg-red-600 hover:text-white"
                }`}
                title="Close Menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>



            {/* Scrollable Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">

              {/* Categories Navigation */}
              <div className="space-y-2.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-red-600 block px-1">
                  {activeLang === "hi" ? "समाचार श्रेणियां" : "News Categories"}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORY_IDS.map((catId) => {
                    const isActive = activeCategory === catId;
                    return (
                      <Link
                        key={catId}
                        href={`/?category=${catId}`}
                        onClick={() => {
                          if (onSelectCategory) onSelectCategory(catId);
                          setMobileMenuOpen(false);
                        }}
                        className={`rounded-xl px-3 py-2.5 text-center text-xs font-bold uppercase transition-all ${
                          isActive
                            ? "bg-red-600 text-white shadow-md font-extrabold scale-[1.02]"
                            : isDark
                            ? "bg-[#22252a] text-slate-200 hover:bg-[#2b2f36] border border-[#2e333b]"
                            : "bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200"
                        }`}
                      >
                        {t.categories[catId]}
                      </Link>
                    );
                  })}
                </div>
              </div>

              {/* Quick Preferences */}
              <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-[#2b2f36]">
                <span className="text-[10px] font-black uppercase tracking-widest text-red-600 block px-1 mb-2">
                  {activeLang === "hi" ? "त्वरित विकल्प" : "Quick Actions"}
                </span>


                {/* Saved Articles */}
                <Link
                  href="/saved"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-xs font-bold transition-all ${
                    isDark ? "bg-[#22252a] text-slate-100 hover:bg-[#2b2f36]" : "bg-slate-100 text-slate-800 hover:bg-slate-200"
                  }`}
                >
                  <span className="flex items-center space-x-2.5">
                    <Bookmark className="h-4 w-4 text-red-600" />
                    <span>{activeLang === "hi" ? "सेव किए गए समाचार" : "Saved Articles"}</span>
                  </span>
                  {bookmarkCount > 0 && (
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-black text-white">
                      {bookmarkCount}
                    </span>
                  )}
                </Link>

                {/* Language Switcher */}
                <button
                  onClick={() => {
                    toggleLanguage();
                    setMobileMenuOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-xs font-bold transition-all ${
                    isDark ? "bg-[#22252a] text-slate-100 hover:bg-[#2b2f36]" : "bg-slate-100 text-slate-800 hover:bg-slate-200"
                  }`}
                >
                  <span className="flex items-center space-x-2.5">
                    <Globe className="h-4 w-4 text-red-600" />
                    <span>{activeLang === "hi" ? "भाषा: हिंदी" : "Language: English"}</span>
                  </span>
                  <span className="rounded-md bg-red-600 px-2 py-0.5 text-[9px] font-black text-white uppercase">
                    {activeLang === "hi" ? "EN" : "HI"}
                  </span>
                </button>

                {/* Theme Switcher */}
                <button
                  onClick={() => {
                    toggleTheme();
                    setMobileMenuOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-xs font-bold transition-all ${
                    isDark ? "bg-[#22252a] text-slate-100 hover:bg-[#2b2f36]" : "bg-slate-100 text-slate-800 hover:bg-slate-200"
                  }`}
                >
                  <span className="flex items-center space-x-2.5">
                    {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-700" />}
                    <span>{isDark ? (activeLang === "hi" ? "थीम: लाइट मोड" : "Theme: Light Mode") : (activeLang === "hi" ? "थीम: डार्क मोड" : "Theme: Dark Mode")}</span>
                  </span>
                  <span className="rounded-md bg-red-600 px-2 py-0.5 text-[9px] font-black text-white uppercase">
                    {isDark ? "Dark" : "Light"}
                  </span>
                </button>

                {/* Login / Admin */}
                <Link
                  href="/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex w-full items-center justify-center space-x-2 rounded-xl bg-red-600 hover:bg-red-700 text-white py-3 px-4 text-xs font-black shadow-md shadow-red-600/30 transition-all mt-3"
                >
                  <User className="h-4 w-4" />
                  <span>{activeLang === "hi" ? "लॉगिन / एडमिन डैशबोर्ड" : "Login / Admin Dashboard"}</span>
                </Link>
              </div>

              {/* Social Links */}
              <div className="pt-4 border-t border-slate-100 dark:border-[#2b2f36] text-center space-y-2">
                <span className={`text-[11px] font-bold block ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  {activeLang === "hi" ? "सोशल मीडिया:" : "Follow Us:"}
                </span>
                <div className="flex items-center justify-center space-x-3 text-sm">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-[#22252a] text-slate-800 dark:text-white hover:bg-red-600 hover:text-white transition-colors cursor-pointer font-bold shadow-xs">𝕏</span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-[#22252a] text-[#1877f2] dark:text-white hover:bg-[#1877f2] hover:text-white transition-colors cursor-pointer font-serif font-bold shadow-xs">f</span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-[#22252a] text-red-600 dark:text-white hover:bg-red-600 hover:text-white transition-colors cursor-pointer shadow-xs">▶</span>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Category Navigation Bar */}
      <nav
        onMouseLeave={handleMouseLeaveNav}
        className="relative overflow-visible shadow-md transition-colors duration-200 border-t border-b border-red-800/40 bg-gradient-to-r from-[#b91c1c] via-[#c21d28] to-[#b91c1c] text-white"
      >
        <div className="mx-auto flex max-w-[1500px] items-center px-2 py-1 sm:px-4 md:px-6 lg:px-10 overflow-x-auto scrollbar-hide gap-1 sm:gap-1.5">
          {CATEGORY_IDS.map((catId) => {
            const isActive = activeCategory === catId;
            const isHovered = hoveredCategory === catId;
            const label = t.categories[catId];
            return (
              <div
                key={catId}
                onMouseEnter={() => handleMouseEnterCategory(catId)}
                className="relative py-0.5 shrink-0"
              >
                <Link
                  href={`/?category=${catId}`}
                  onClick={() => {
                    if (onSelectCategory) onSelectCategory(catId);
                    setHoveredCategory(null);
                  }}
                  className={`flex items-center space-x-1 sm:space-x-1.5 whitespace-nowrap rounded-full px-3.5 sm:px-4 py-1.5 font-sans text-[11px] sm:text-xs font-extrabold uppercase tracking-widest transition-all duration-200 cursor-pointer ${
                    isActive
                      ? "bg-white text-[#b91c1c] shadow-md shadow-black/20 font-black scale-[1.03]"
                      : isHovered
                      ? "bg-white/20 text-white shadow-xs rounded-full"
                      : "text-red-50 hover:text-white hover:bg-white/15 rounded-full"
                  }`}
                >
                  <span>{label}</span>
                  <ChevronDown className={`h-2.5 w-2.5 sm:h-3 sm:w-3 transition-transform hidden sm:block ${isHovered ? "rotate-180 text-white" : isActive ? "text-[#b91c1c]" : "opacity-75"}`} />
                </Link>
              </div>
            );
          })}
        </div>

        {/* Hover Mega Dropdown */}
        {hoveredCategory && (
          <div
            onMouseEnter={() => handleMouseEnterCategory(hoveredCategory)}
            onMouseLeave={handleMouseLeaveNav}
          >
            <CategoryMegaMenu
              category={hoveredCategory}
              articles={articles}
              language={activeLang}
              onClose={() => setHoveredCategory(null)}
              onSelectCategory={onSelectCategory}
            />
          </div>
        )}
      </nav>
    </header>
  );
}
