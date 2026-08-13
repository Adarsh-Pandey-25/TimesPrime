"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Article } from "@/types";
import {
  Share2,
  Copy,
  Check,
  Clock,
  Sparkles,
  ExternalLink,
  TrendingUp,
  Flame,
  ChevronRight,
  ArrowRight,
  Tag,
  Compass,
  BarChart2,
  Camera,
  ThumbsUp,
} from "lucide-react";
import ArticleCard from "@/components/ArticleCard";

import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { TRANSLATIONS, translateHeadline } from "@/lib/translations";
import { getTopicImageUrl } from "@/lib/topicImages";

interface ArticleDetailViewProps {
  slug: string;
  targetUrl?: string;
  imageUrl?: string;
  scrapedData: {
    title?: string;
    content?: string[];
    image?: string;
    description?: string;
    text?: string;
  };
  allArticles: Article[];
}

export default function ArticleDetailView({
  slug,
  targetUrl,
  imageUrl,
  scrapedData,
  allArticles,
}: ArticleDetailViewProps) {
  const { language } = useLanguage();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const t = TRANSLATIONS[language];

  const [copied, setCopied] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Poll State
  const [pollVoted, setPollVoted] = useState<string | null>(null);

  // Dynamically fetch headlines matching active language (Hindi or English)
  const [articlesList, setArticlesList] = useState<Article[]>(allArticles);

  useEffect(() => {
    let isMounted = true;
    const fetchLanguageNews = async () => {
      try {
        const res = await fetch(`/api/news/top-headlines?category=general&language=${language}`, {
          headers: { "ngrok-skip-browser-warning": "true" },
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.results && data.results.length > 0) {
            setArticlesList(data.results);
          }
        }
      } catch {
        // Fallback to allArticles
      }
    };
    fetchLanguageNews();
    return () => {
      isMounted = false;
    };
  }, [language]);

  const isHindiText = (str?: string) => str && /[\u0900-\u097F]/.test(str);

  // Script-level filter to keep sidebars matching current language
  const filteredList = articlesList.filter((art) => {
    if (language === "hi") return isHindiText(art.title);
    return !isHindiText(art.title);
  });

  const displayArticles = filteredList.length > 0 ? filteredList : articlesList;

  const rawTitle = scrapedData.title || (slug.length < 50 ? slug : "Featured Story");
  const displayTitle = translateHeadline(rawTitle, language);
  const primaryImage = imageUrl || scrapedData.image || null;
  const displayImage = getTopicImageUrl(displayTitle, undefined, scrapedData.description, primaryImage);

  const relatedNews = displayArticles.slice(0, 4);
  const trendingNews = displayArticles.slice(4, 9);
  const rightSidebarTrending = displayArticles.slice(0, 8);
  const photoStories = displayArticles.slice(2, 5);
  const bottomSuggestedArticles = displayArticles.slice(0, 8);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: displayTitle,
          url: window.location.href,
        });
      } catch {
        // Share cancelled
      }
    } else {
      handleCopyLink();
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAiAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuestion.trim()) return;

    setAiLoading(true);
    setAiResponse(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: `Article: "${displayTitle}". Question: ${aiQuestion}`,
            },
          ],
        }),
      });

      if (!res.ok) throw new Error("AI query failed");
      const data = await res.json();
      setAiResponse(data.reply || data.text || "Here is the key insight for your query.");
    } catch {
      setAiResponse(
        language === "hi"
          ? `मुख्य निष्कर्ष: "${displayTitle}" प्रमुख वैश्विक अपडेट का हिस्सा है। लाइव फॉलो-अप के लिए टाइम्सप्राइम पर बने रहें।`
          : `Key Takeaway: "${displayTitle}" is part of ongoing major global updates. Stay tuned to TimesPrime for live follow-ups.`
      );
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 space-y-8">
      {/* 1. Breadcrumb Bar */}
      <div className="flex items-center space-x-2 text-xs font-semibold text-slate-500 dark:text-slate-400 overflow-x-auto pb-2 border-b border-slate-200 dark:border-[#2b2f36]">
        <Link href="/" className="hover:text-red-600 transition-colors">
          {language === "hi" ? "मुख्य पृष्ठ" : "Home"}
        </Link>
        <ChevronRight className="h-3 w-3 text-slate-400" />
        <Link href="/?category=general" className="hover:text-red-600 transition-colors">
          {language === "hi" ? "प्रमुख खबरें" : "World News"}
        </Link>
        <ChevronRight className="h-3 w-3 text-slate-400" />
        <span className="truncate max-w-xs sm:max-w-md font-bold text-slate-700 dark:text-slate-300">
          {displayTitle}
        </span>
      </div>

      {/* 2. Professional 3-Column Layout Grid */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
        {/* LEFT COLUMN (Related & Trending Headlines) */}
        <aside className="space-y-8 lg:col-span-3 order-2 lg:order-1 border-t lg:border-t-0 lg:border-r border-slate-200 dark:border-[#2b2f36] lg:pr-6 pt-6 lg:pt-0 sticky top-24">
          {/* Related News Box */}
          <div className="space-y-4">
            <h3 className="font-serif text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white border-b-2 border-red-600 pb-1.5 inline-block">
              {language === "hi" ? "संबंधित खबरें" : "Related News"}
            </h3>
            <div className="space-y-4">
              {relatedNews.map((art, idx) => {
                const artSlug = encodeURIComponent(
                  art.article_id || art.title.slice(0, 30)
                );
                const itemImg = getTopicImageUrl(art.title, art.category, art.description, art.image_url);
                return (
                  <Link
                    key={art.article_id || idx}
                    href={`/article/${artSlug}?url=${encodeURIComponent(art.link)}&image=${encodeURIComponent(itemImg)}`}
                    className="group block space-y-1 border-b border-slate-100 dark:border-[#2b2f36] pb-3 last:border-0"
                  >
                    <h4 className="text-xs font-bold leading-snug text-slate-800 dark:text-slate-200 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                      {art.title}
                    </h4>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                      {art.source_name || (language === "hi" ? "टाइम्स मीडिया" : "Times Media")}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* AI Key Highlights Box */}
          <div className={`rounded-2xl p-4 border space-y-3 ${
            isDark
              ? "bg-gradient-to-br from-[#1e2228] to-[#16181d] border-[#2f3540] text-slate-200 shadow-sm"
              : "bg-gradient-to-br from-red-50/40 via-white to-slate-50 border-red-100 text-slate-800 shadow-xs"
          }`}>
            <div className="flex items-center space-x-2 border-b pb-2 border-slate-200/80 dark:border-[#2f3540]">
              <Sparkles className="h-4 w-4 text-amber-500 animate-pulse shrink-0" />
              <h3 className="font-serif text-xs font-black uppercase tracking-wider text-red-600 dark:text-red-400">
                {language === "hi" ? "मुख्य बिंदु" : "Key Highlights"}
              </h3>
            </div>
            <ul className="space-y-2 text-xs font-medium leading-relaxed">
              <li className="flex items-start space-x-2">
                <span className="h-1.5 w-1.5 rounded-full bg-red-600 mt-1.5 shrink-0" />
                <span>{language === "hi" ? "प्रमुख वैश्विक मीडिया नेटवर्क से सत्यापित तथ्य" : "Verified global reporting & key facts"}</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="h-1.5 w-1.5 rounded-full bg-red-600 mt-1.5 shrink-0" />
                <span>{language === "hi" ? "रियल-टाइम हेडलाइंस एवं विश्लेषण" : "Real-time updates & expert analysis"}</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="h-1.5 w-1.5 rounded-full bg-red-600 mt-1.5 shrink-0" />
                <span>{language === "hi" ? "विशेष कवरेज - टाइम्सप्राइम नेटवर्क" : "Special Executive Coverage • TimesPrime"}</span>
              </li>
            </ul>
          </div>

          {/* Popular Topics / Tags */}
          <div className="space-y-3 pt-1">
            <h3 className="font-serif text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white border-b-2 border-red-600 pb-1 inline-block">
              {language === "hi" ? "लोकप्रिय विषय" : "Popular Topics"}
            </h3>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[
                language === "hi" ? "#ब्रेकिंगन्यूज़" : "#BreakingNews",
                language === "hi" ? "#वैश्विकखबरें" : "#GlobalAffairs",
                language === "hi" ? "#लाइवअपडेट" : "#LiveUpdates",
                language === "hi" ? "#विशेषरिपोर्ट" : "#SpecialReport",
                language === "hi" ? "#विश्लेषण" : "#Analysis",
              ].map((tag, tIdx) => (
                <span
                  key={tIdx}
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                    isDark
                      ? "border-[#2f3540] bg-[#1e2228] text-slate-300 hover:border-red-500 hover:text-red-400"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-red-600 hover:text-red-600 shadow-2xs"
                  }`}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </aside>

        {/* CENTER MAIN COLUMN (Article Content) */}
        <div className="space-y-6 lg:col-span-6 order-1 lg:order-2">
          {/* Main Headline Title */}
          <h1 className="font-serif text-2xl font-extrabold leading-tight text-slate-900 dark:text-white sm:text-3xl lg:text-4xl">
            {displayTitle}
          </h1>

          {/* Subtitle description */}
          {scrapedData.description && (
            <p className="text-sm sm:text-base font-medium leading-relaxed text-slate-600 dark:text-slate-300">
              {scrapedData.description}
            </p>
          )}

          {/* Byline & Author Metadata */}
          <div className="flex flex-wrap items-center justify-between border-y border-slate-200 dark:border-[#2b2f36] py-2.5 text-xs text-slate-500 dark:text-slate-400 gap-2">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {language === "hi" ? "टाइम्सप्राइम डेस्क" : "TimesPrime Desk"}
              </span>
              <span>|</span>
              <span className="flex items-center gap-1 font-medium" suppressHydrationWarning>
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                {new Date().toLocaleDateString(language === "hi" ? "hi-IN" : "en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>

            {/* Action Bar (Read Time, Share, Copy Link) */}
            <div className="flex items-center space-x-3">
              <span className="font-semibold text-slate-600 dark:text-slate-300">
                {language === "hi" ? "पढ़ने का समय: 2 मिनट" : "Read Time: 2 mins"}
              </span>

              <button
                onClick={handleShare}
                className="flex items-center space-x-1.5 rounded-lg border border-slate-200 dark:border-[#383d45] bg-slate-100 dark:bg-[#272a2f] px-3 py-1 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-red-600 hover:text-white dark:hover:bg-red-600 transition-colors shadow-xs"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>{language === "hi" ? "शेयर" : "Share"}</span>
              </button>

              <button
                onClick={handleCopyLink}
                className="flex items-center justify-center rounded-lg border border-slate-200 dark:border-[#383d45] bg-slate-100 dark:bg-[#272a2f] p-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#31353c] transition-colors"
                title={language === "hi" ? "कॉपी लिंक" : "Copy Link"}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Main Cover Image Thumbnail */}
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-slate-200 dark:border-[#2b2f36] shadow-sm">
            <Image
              src={displayImage}
              alt={displayTitle}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
              priority
            />
          </div>

          {/* AI Executive Summary Box */}
          <div className="rounded-2xl border border-red-200 dark:border-red-900/40 bg-gradient-to-br from-red-50 to-orange-50/50 dark:from-[#25282d] dark:to-[#222529] p-5 shadow-xs">
            <div className="flex items-center space-x-2 text-xs font-black uppercase tracking-wider text-red-700 dark:text-red-400">
              <Sparkles className="h-4 w-4 text-red-600 dark:text-red-400" />
              <span>{t.articleView.aiExecutiveSummary || (language === "hi" ? "एआई कार्यकारी सारांश" : "AI Executive Summary")}</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-800 dark:text-slate-200 font-medium">
              {language === "hi" ? (
                <>
                  यह रिपोर्ट{" "}
                  <strong className="font-bold text-slate-900 dark:text-white">
                    {displayTitle}
                  </strong>{" "}
                  पर संपूर्ण विवरण प्रस्तुत करती है। नीचे संकलित समाचार विवरण पढ़ें।
                </>
              ) : (
                <>
                  This report presents complete details on{" "}
                  <strong className="font-bold text-slate-900 dark:text-white">
                    {displayTitle}
                  </strong>
                  . Read the synthesized story coverage below.
                </>
              )}
            </p>
          </div>

          {/* Article Story Paragraphs */}
          <article className="space-y-4 text-sm sm:text-base leading-relaxed text-slate-800 dark:text-slate-200 font-sans">
            {scrapedData.content && scrapedData.content.length > 0 ? (
              scrapedData.content.map((paragraph: string, idx: number) => (
                <p key={idx} className="leading-relaxed font-medium">
                  {paragraph}
                </p>
              ))
            ) : (
              <p className="text-slate-500 dark:text-slate-400 italic">
                {language === "hi" ? "संपूर्ण रिपोर्ट विवरण प्रस्तुत है।" : "Full report coverage details presented."}
              </p>
            )}
          </article>

          {/* "askTimesPrime" AI SEARCH WIDGET BOX & SOCIAL TRACKER */}
          <div className={`mt-8 rounded-2xl border p-5 space-y-5 shadow-lg ${
            isDark
              ? "border-[#383d45] bg-[#25282d] text-white"
              : "border-slate-200 bg-white text-slate-900"
          }`}>
            {/* Ask TimesPrime AI Bar */}
            <form onSubmit={handleAiAsk} className="relative flex items-center">
              <div className={`flex items-center space-x-2 pl-3 text-red-500 font-serif font-black text-sm uppercase tracking-wider border-r pr-3 ${isDark ? "border-slate-600" : "border-slate-300"}`}>
                <Sparkles className="h-4 w-4 text-red-500 animate-pulse" />
                <span>askTimesPrime</span>
              </div>
              <input
                type="text"
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                placeholder={language === "hi" ? "इस समाचार के बारे में आप क्या जानना चाहते हैं?" : "What would you like to know about this story?"}
                className={`w-full bg-transparent py-3 pl-3 pr-12 text-xs font-medium focus:outline-none ${
                  isDark ? "text-white placeholder-slate-400" : "text-slate-900 placeholder-slate-400"
                }`}
              />
              <button
                type="submit"
                disabled={aiLoading}
                className="absolute right-2 flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors shadow-xs"
              >
                {aiLoading ? (
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
              </button>
            </form>

            {/* AI Answer Box Output */}
            {aiResponse && (
              <div className={`rounded-xl border p-4 text-xs leading-relaxed animate-in fade-in ${
                isDark
                  ? "border-red-900/50 bg-[#1a1c1e] text-slate-200"
                  : "border-red-200 bg-red-50 text-slate-700"
              }`}>
                <span className="font-bold text-red-500 block mb-1">
                  {language === "hi" ? "एआई उत्तर:" : "AI Answer:"}
                </span>
                {aiResponse}
              </div>
            )}

            {/* Topic Live Tracker Bar & Social Follow Icons */}
            <div className={`border-t pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs ${
              isDark ? "border-[#383d45]" : "border-slate-200"
            }`}>
              <div className={`space-y-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                <p>
                  {language === "hi" ? (
                    <>
                      TimesPrime.com पर <strong className={isDark ? "text-white" : "text-slate-900"}>मुख्य समाचार, मार्केट अपडेट और ब्रेकिंग विश्लेषण</strong> का लाइव अपडेट पाएं
                    </>
                  ) : (
                    <>
                      Track <strong className={isDark ? "text-white" : "text-slate-900"}>World News, Market Updates & Breaking Analysis</strong> live on TimesPrime.com
                    </>
                  )}
                </p>
                <div className={`flex items-center space-x-2 text-[10px] pt-1 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                  <Tag className="h-3 w-3 text-red-500" />
                  <span>
                    {language === "hi"
                      ? "टैग: प्रमुख सुर्खियां • सत्यापित रिपोर्टिंग • विशेष विश्लेषण"
                      : "Tags: Global Headlines • Verified Reporting • Special Analysis"}
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-3 shrink-0">
                <span className={`font-bold text-[11px] ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  {language === "hi" ? "हमें फॉलो करें:" : "Follow us:"}
                </span>
                <div className="flex items-center space-x-2">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full hover:bg-red-600 text-white transition-colors cursor-pointer text-[11px] font-bold ${isDark ? "bg-slate-700" : "bg-slate-800"}`}>𝕏</span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white hover:opacity-90 transition-colors cursor-pointer text-[11px] font-bold">▶</span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white hover:opacity-90 transition-colors cursor-pointer text-[11px] font-bold">💬</span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-pink-600 text-white hover:opacity-90 transition-colors cursor-pointer text-[11px] font-bold">📷</span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white hover:opacity-90 transition-colors cursor-pointer text-[11px] font-bold">f</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (STICKY & FILLED SIDEBAR) */}
        <aside className="space-y-6 lg:col-span-3 order-3 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-[#2b2f36] lg:pl-6 pt-6 lg:pt-0 sticky top-24">
          {/* Widget 1: Top Trending Stories Card List */}
          <div className="rounded-2xl border border-slate-200 dark:border-[#2b2f36] bg-white dark:bg-[#25282d] p-4 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#2b2f36] pb-3">
              <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                <TrendingUp className="h-4 w-4" />
                <span>{language === "hi" ? "आज के मुख्य ट्रेंडिंग" : "Top Trending Today"}</span>
              </div>
              <span className="text-[10px] font-extrabold uppercase bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full">
                {language === "hi" ? "लाइव" : "Live"}
              </span>
            </div>

            <div className="space-y-3">
              {rightSidebarTrending.map((art, idx) => {
                const artSlug = encodeURIComponent(
                  art.article_id || art.title.slice(0, 30)
                );
                const imgSrc = getTopicImageUrl(art.title, art.category, art.description, art.image_url);

                return (
                  <Link
                    key={art.article_id || idx}
                    href={`/article/${artSlug}?url=${encodeURIComponent(art.link)}&image=${encodeURIComponent(imgSrc)}`}
                    className="group flex items-center space-x-3 border-b border-slate-100 dark:border-[#2b2f36] last:border-0 pb-2.5 last:pb-0"
                  >
                    <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg">
                      <Image
                        src={imgSrc}
                        alt={art.title}
                        fill
                        sizes="64px"
                        className="object-cover transition-transform duration-300 group-hover:scale-110"
                      />
                      <span className="absolute bottom-0 left-0 bg-red-600 text-white text-[9px] font-black px-1 rounded-tr">
                        #{idx + 1}
                      </span>
                    </div>
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <h4 className="line-clamp-2 text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors leading-snug">
                        {art.title}
                      </h4>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block truncate">
                        {art.source_name || (language === "hi" ? "ग्लोबल न्यूज़" : "Global News")}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Widget 2: Interactive Reader Opinion Poll Widget */}
          <div className="rounded-2xl border border-slate-200 dark:border-[#2b2f36] bg-white dark:bg-[#25282d] p-4 shadow-xs space-y-3">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white border-b border-slate-100 dark:border-[#2b2f36] pb-2">
              <BarChart2 className="h-4 w-4 text-red-600" />
              <span>{language === "hi" ? "पाठक मत सर्वेक्षण" : "Reader Opinion Poll"}</span>
            </div>

            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {language === "hi"
                ? "क्या यह रिपोर्ट आपके लिए स्पष्ट और उपयोगी थी?"
                : "Was this report clear and comprehensive for you?"}
            </p>

            <div className="space-y-2 text-xs">
              <button
                onClick={() => setPollVoted("yes")}
                className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between font-semibold ${pollVoted === "yes"
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                  : "border-slate-200 dark:border-[#383d45] hover:bg-slate-50 dark:hover:bg-[#2f333a]"
                  }`}
              >
                <span>{language === "hi" ? "हाँ, बहुत उपयोगी" : "Yes, Very Insightful"}</span>
                <span className="font-bold text-[11px] opacity-80">
                  {pollVoted ? "82%" : <ThumbsUp className="h-3.5 w-3.5" />}
                </span>
              </button>

              <button
                onClick={() => setPollVoted("neutral")}
                className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between font-semibold ${pollVoted === "neutral"
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                  : "border-slate-200 dark:border-[#383d45] hover:bg-slate-50 dark:hover:bg-[#2f333a]"
                  }`}
              >
                <span>{language === "hi" ? "तटस्थ" : "Neutral"}</span>
                <span className="font-bold text-[11px] opacity-80">
                  {pollVoted ? "12%" : "—"}
                </span>
              </button>

              <button
                onClick={() => setPollVoted("more")}
                className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between font-semibold ${pollVoted === "more"
                  ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
                  : "border-slate-200 dark:border-[#383d45] hover:bg-slate-50 dark:hover:bg-[#2f333a]"
                  }`}
              >
                <span>{language === "hi" ? "और विवरण चाहिए" : "Needs More Details"}</span>
                <span className="font-bold text-[11px] opacity-80">
                  {pollVoted ? "6%" : "—"}
                </span>
              </button>
            </div>
            {pollVoted && (
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold text-center pt-1">
                {language === "hi" ? "✓ मत देने के लिए धन्यवाद!" : "✓ Thank you for voting!"}
              </p>
            )}
          </div>

          {/* Widget 3: Must-Read Photo Stories Grid */}
          <div className="rounded-2xl border border-slate-200 dark:border-[#2b2f36] bg-white dark:bg-[#25282d] p-4 shadow-xs space-y-3">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white border-b border-slate-100 dark:border-[#2b2f36] pb-2">
              <Camera className="h-4 w-4 text-red-600" />
              <span>{language === "hi" ? "प्रमुख फोटो स्टोरीज़" : "Must-Read Photo Stories"}</span>
            </div>

            <div className="space-y-3">
              {photoStories.map((art, idx) => {
                const artSlug = encodeURIComponent(
                  art.article_id || art.title.slice(0, 30)
                );
                const imgSrc = getTopicImageUrl(art.title, art.category, art.description, art.image_url);

                return (
                  <Link
                    key={art.article_id || idx}
                    href={`/article/${artSlug}?url=${encodeURIComponent(art.link)}&image=${encodeURIComponent(imgSrc)}`}
                    className="group block space-y-1.5 overflow-hidden rounded-xl border border-slate-100 dark:border-[#34383f] p-2 hover:border-red-500 transition-colors"
                  >
                    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg">
                      <Image
                        src={imgSrc}
                        alt={art.title}
                        fill
                        sizes="300px"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <span className="absolute top-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white uppercase backdrop-blur-xs">
                        {language === "hi" ? "विशेष कवरेज" : "Special Feature"}
                      </span>
                    </div>
                    <h4 className="line-clamp-2 text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-red-600 transition-colors leading-snug">
                      {art.title}
                    </h4>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Widget 4: Trending Topics Cloud */}
          <div className="rounded-2xl border border-slate-200 dark:border-[#2b2f36] bg-white dark:bg-[#25282d] p-4 shadow-xs space-y-3">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white border-b border-slate-100 dark:border-[#2b2f36] pb-2">
              <Tag className="h-4 w-4 text-red-600" />
              <span>{language === "hi" ? "ट्रेंडिंग विषय" : "Trending Topics"}</span>
            </div>

            <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
              {(language === "hi"
                ? [
                    "🤖 एआई तकनीक",
                    "📈 शेयर बाज़ार",
                    "⚡ इलेक्ट्रिक वाहन",
                    "🌍 पर्यावरण तकनीक",
                    "⚽ स्पोर्ट्स",
                    "🎬 बॉक्स ऑफिस",
                    "🚀 अंतरिक्ष विज्ञान",
                  ]
                : [
                    "🤖 AI Breakthroughs",
                    "📈 Stock Markets",
                    "⚡ Electric Vehicles",
                    "🌍 Climate Tech",
                    "⚽ Champions League",
                    "🎬 Box Office",
                    "🚀 Space Science",
                  ]
              ).map((topic, i) => (
                <Link
                  key={i}
                  href={`/?search=${encodeURIComponent(topic.split(" ")[1] || topic)}`}
                  className="rounded-lg border border-slate-200 dark:border-[#383d45] bg-slate-50 dark:bg-[#1a1c1e] px-2.5 py-1 text-[11px] text-slate-700 dark:text-slate-300 hover:bg-red-600 hover:text-white dark:hover:bg-red-600 transition-colors"
                >
                  {topic}
                </Link>
              ))}
            </div>
          </div>

          {/* Widget 5: Daily Digest Newsletter Widget */}
          <div className="rounded-2xl border border-slate-200 dark:border-[#383d45] bg-white dark:bg-[#25282d] text-slate-900 dark:text-white p-5 shadow-xs space-y-3">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
              <Flame className="h-4 w-4 text-red-600 dark:text-red-400" />
              <span>{language === "hi" ? "दैनिक समाचार पत्रिका" : "Daily Digest"}</span>
            </div>
            <h4 className="font-serif text-sm font-bold">
              {language === "hi"
                ? "हर सुबह मुख्य समाचार सीधे अपने इनबॉक्स में पाएं"
                : "Get top news updates delivered directly to your inbox"}
            </h4>
            <form onSubmit={(e) => e.preventDefault()} className="space-y-2">
              <input
                type="email"
                placeholder={language === "hi" ? "ईमेल दर्ज करें..." : "Enter email address..."}
                className="w-full rounded-xl border border-slate-200 dark:border-[#383d45] bg-slate-50 dark:bg-[#1f2226] px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:border-red-600 focus:outline-none"
              />
              <button
                type="submit"
                className="w-full rounded-xl bg-red-600 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-red-700 transition-colors shadow-xs"
              >
                {language === "hi" ? "सदस्यता लें" : "Subscribe"}
              </button>
            </form>
          </div>
        </aside>
      </div>

      {/* 5. Recommended & Suggested Stories Grid at Bottom */}
      {bottomSuggestedArticles.length > 0 && (
        <section className="pt-10 border-t border-slate-200 dark:border-[#2b2f36] space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-base font-black text-slate-900 dark:text-white uppercase tracking-wider">
              <Compass className="h-5 w-5 text-red-600 dark:text-red-400" />
              <span>{t.articleView.suggestedNews || (language === "hi" ? "संबंधित एवं सुझाई गई खबरें" : "Recommended & Suggested Stories")}</span>
            </div>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              {language === "hi" ? "आपके लिए चुनिंदा प्रमुख समाचार" : "Showing top curated stories for you"}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {bottomSuggestedArticles.map((article) => (
              <ArticleCard key={article.article_id || article.link} article={article} language={language} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
