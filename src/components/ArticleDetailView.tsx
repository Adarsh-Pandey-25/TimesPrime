"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Article } from "@/types";
import {
  Share2,
  Copy,
  Check,
  CheckCircle,
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
  ThumbsUp,
  BookOpen,
} from "lucide-react";
import ArticleCard from "@/components/ArticleCard";

import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { TRANSLATIONS, translateHeadline } from "@/lib/translations";
import { assignDedupedTopicImages } from "@/lib/topicImages";

// Generic placeholder sentences the scraper/route layer substitutes in when
// it can't extract real paragraphs from the publisher page (see
// src/app/api/news/scrape-article/route.ts and src/app/article/[slug]/page.tsx).
// Rendered verbatim they look like a broken app, not a deliberate message —
// detect them here so the UI can swap in a styled "read at source" CTA instead.
const SCRAPE_FALLBACK_MESSAGES = [
  "Full article coverage is available at the publisher source.",
  "Full article coverage details for this report are available directly on the official publisher website below.",
  "Full coverage details for this article are presented below. Click the external publisher link to read directly on the source website.",
];

function isScrapeFallbackContent(content?: string[] | null): boolean {
  return !!content && content.length === 1 && SCRAPE_FALLBACK_MESSAGES.includes(content[0].trim());
}

/** Estimated reading time at ~200 wpm, minimum 1 minute. */
function estimateReadMinutes(paragraphs: string[]): number {
  const wordCount = paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(wordCount / 200));
}

/** Bare hostname (no "www.") used both as the source label and the
 * original-article domain — there's no separate publisher-name field
 * available here, and a real hostname is more trustworthy than a guess. */
function getSourceDomain(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

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
  const [newsletterSubmitted, setNewsletterSubmitted] = useState(false);

  const hasScrapedContent =
    !!scrapedData.content &&
    scrapedData.content.length > 0 &&
    !isScrapeFallbackContent(scrapedData.content);

  const readMinutes = hasScrapedContent ? estimateReadMinutes(scrapedData.content!) : 2;

  const sourceDomain = getSourceDomain(targetUrl);

  // Only the fallback (no real scraped content) branch auto-redirects —
  // when we have real content, staying on TimesPrime is the whole point.
  const shouldAutoRedirect = !hasScrapedContent && !!targetUrl;
  const [redirectSeconds, setRedirectSeconds] = useState(5);

  useEffect(() => {
    if (!shouldAutoRedirect) return;
    if (redirectSeconds <= 0) {
      window.location.href = targetUrl!;
      return;
    }
    const timer = setTimeout(() => setRedirectSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [shouldAutoRedirect, redirectSeconds, targetUrl]);

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

  // A pseudo-article standing in for the hero image so it goes through the
  // same dedup pass as every list below — without this, the hero image was
  // resolved independently and could coincidentally land on the exact same
  // pool image as a sidebar/grid card (only visible when the article has no
  // real primaryImage, forcing a keyword-based pick like everything else).
  const heroArticle: Article = {
    article_id: "__hero__",
    title: displayTitle,
    link: targetUrl || "",
    description: scrapedData.description || "",
    image_url: primaryImage,
    pubDate: "",
  };

  // Non-overlapping slices, sized to whatever displayArticles actually has.
  // These previously all started at (or near) index 0, so the exact same
  // articles rendered 2-3x on one page — once as "Related News", again as
  // "Top Trending Today", and again in the bottom grid. A fixed-index-range
  // fallback for thin data would just reintroduce the same overlap (a
  // single NewsData.io page is often ~10 articles), so this consumes
  // sequentially instead: each section takes only what's left after the
  // ones before it, and simply renders fewer cards (or is hidden by its
  // existing length guard) rather than ever repeating an article a later
  // section already used.
  const relatedNewsEnd = Math.min(4, displayArticles.length);
  const rightSidebarTrendingEnd = relatedNewsEnd + Math.min(8, displayArticles.length - relatedNewsEnd);
  const bottomSuggestedEnd = rightSidebarTrendingEnd + Math.min(8, displayArticles.length - rightSidebarTrendingEnd);

  const relatedNews = displayArticles.slice(0, relatedNewsEnd);
  const rightSidebarTrending = displayArticles.slice(relatedNewsEnd, rightSidebarTrendingEnd);
  const bottomSuggestedArticles = displayArticles.slice(rightSidebarTrendingEnd, bottomSuggestedEnd);

  // One dedup pass across all three sections — they're built from disjoint
  // slices of displayArticles now, so a single shared Map is both simpler
  // and stronger than per-section passes: it also stops the bottom grid
  // from picking the same themed image as a sidebar card, not just the
  // same article.
  const dedupedImages = assignDedupedTopicImages([
    heroArticle,
    ...relatedNews,
    ...rightSidebarTrending,
    ...bottomSuggestedArticles,
  ]);
  const displayImage = dedupedImages.get(heroArticle)!;

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
          message: aiQuestion,
          articleContext: {
            title: displayTitle,
            description: scrapedData.description,
          },
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `AI query failed with status ${res.status}`);
      }
      if (!res.body) {
        throw new Error("No response body from server.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setAiResponse(fullText);
      }

      if (!fullText.trim()) {
        setAiResponse("Here is the key insight for your query.");
      }
    } catch (err) {
      console.error("askTimesPrime failed:", err instanceof Error ? err.message : err);
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
            <div className="space-y-1">
              {relatedNews.map((art, idx) => {
                const artSlug = encodeURIComponent(
                  art.article_id || art.title.slice(0, 30)
                );
                const itemImg = dedupedImages.get(art)!;
                return (
                  <Link
                    key={art.article_id || idx}
                    href={`/article/${artSlug}?url=${encodeURIComponent(art.link)}&image=${encodeURIComponent(itemImg)}`}
                    className={`group flex items-start gap-2.5 rounded-lg p-2 -mx-2 transition-colors border-b border-slate-100 dark:border-[#2b2f36] last:border-0 ${
                      isDark ? "hover:bg-[#22252a]" : "hover:bg-slate-50"
                    }`}
                  >
                    <span className="mt-0.5 shrink-0 text-xs font-black text-red-600 dark:text-red-400 w-4">
                      {idx + 1}.
                    </span>
                    <div className="relative h-11 w-14 shrink-0 overflow-hidden rounded-lg">
                      <Image src={itemImg} alt={art.title} fill sizes="56px" className="object-cover" />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <h4 className="text-xs font-bold leading-snug text-slate-800 dark:text-slate-200 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors line-clamp-2">
                        {art.title}
                      </h4>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                        {art.source_name || (language === "hi" ? "टाइम्स मीडिया" : "Times Media")}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* AI Key Highlights Box */}
          <div className={`rounded-2xl p-4 border border-l-4 border-l-emerald-600 space-y-3 ${
            isDark
              ? "bg-gradient-to-br from-[#1e2228] to-[#16181d] border-[#2f3540] text-slate-200 shadow-sm"
              : "bg-gradient-to-br from-emerald-50/40 via-white to-slate-50 border-slate-200 text-slate-800 shadow-xs"
          }`}>
            <div className="flex items-center space-x-2 border-b pb-2 border-slate-200/80 dark:border-[#2f3540]">
              <Sparkles className="h-4 w-4 text-amber-500 animate-pulse shrink-0" />
              <h3 className="font-serif text-xs font-black uppercase tracking-wider text-[#1E3A5F] dark:text-[#7EA8D8]">
                {language === "hi" ? "मुख्य बिंदु" : "Key Highlights"}
              </h3>
            </div>
            <ul className="space-y-2 text-xs font-medium leading-relaxed">
              <li className="flex items-start space-x-2">
                <Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                <span>{language === "hi" ? "प्रमुख वैश्विक मीडिया नेटवर्क से सत्यापित तथ्य" : "Verified global reporting & key facts"}</span>
              </li>
              <li className="flex items-start space-x-2">
                <Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                <span>{language === "hi" ? "रियल-टाइम हेडलाइंस एवं विश्लेषण" : "Real-time updates & expert analysis"}</span>
              </li>
              <li className="flex items-start space-x-2">
                <Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
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
                  className={`text-[10px] font-bold px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
                    isDark
                      ? "border-[#2f3540] bg-[#1e2228] text-slate-300 hover:bg-red-600 hover:border-red-600 hover:text-white"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-red-600 hover:border-red-600 hover:text-white shadow-2xs"
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

          {/* Source Attribution Line */}
          {targetUrl && sourceDomain && (
            <a
              href={targetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              <span>{language === "hi" ? `स्रोत: ${sourceDomain}` : `Source: ${sourceDomain}`}</span>
            </a>
          )}

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
              <span className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-200">
                <BookOpen className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                {language === "hi" ? `${readMinutes} मिनट का पठन` : `${readMinutes} min read`}
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

          {/* AI Executive Summary Box — animated red/navy/red gradient border */}
          <div
            className="animate-gradient-border rounded-2xl p-[2px] bg-[length:200%_200%]"
            style={{ backgroundImage: "linear-gradient(90deg, #dc2626, #1E3A5F, #dc2626)" }}
          >
            <div className="rounded-2xl bg-gradient-to-br from-red-50 to-orange-50/50 dark:from-[#25282d] dark:to-[#222529] p-5">
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
          </div>

          {/* Original Source Banner — shown for every article, not just
              when the scraper falls back, so readers always know where
              to go for the full publisher story. */}
          {targetUrl && sourceDomain && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border-l-4 border-red-600 bg-[#1E3A5F] dark:bg-[#0f1923] px-5 py-4">
              <p className="text-sm font-medium text-white/90 leading-relaxed">
                {language === "hi"
                  ? `📰 यह लेख ${sourceDomain} से लिया गया है। मूल खबर पढ़ने के लिए क्लिक करें।`
                  : `📰 This article is sourced from ${sourceDomain}. Click to read the original story.`}
              </p>
              <a
                href={targetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {language === "hi" ? "मूल लेख पढ़ें →" : "Read Original Article →"}
              </a>
            </div>
          )}

          {/* Article Story Paragraphs */}
          <article className="space-y-4 text-sm sm:text-base text-slate-800 dark:text-slate-200 font-sans" style={{ lineHeight: 1.8 }}>
            {hasScrapedContent ? (
              scrapedData.content!.map((paragraph: string, idx: number) => (
                <div key={idx}>
                  <p
                    className={
                      idx === 0
                        ? "font-semibold text-base sm:text-lg"
                        : "font-medium"
                    }
                    style={{ lineHeight: 1.8 }}
                  >
                    {paragraph}
                  </p>
                  {idx > 0 && (idx + 1) % 3 === 0 && (
                    <hr className="mt-4 border-[#E2E8F0] dark:border-[#2b2f36]" />
                  )}
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-slate-200 dark:border-[#383d45] border-l-4 border-l-red-600 bg-white dark:bg-[#25282d] p-5 space-y-3">
                <h3 className="font-serif text-base font-bold text-slate-900 dark:text-white">
                  {language === "hi" ? "पूरी खबर स्रोत पर उपलब्ध है" : "Full Story Available at Source"}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {language === "hi"
                    ? "यह लेख प्रकाशक के प्लेटफॉर्म पर उपलब्ध है। पूरी कवरेज पढ़ने के लिए नीचे क्लिक करें।"
                    : "This article is hosted on the publisher's platform. Click below to read the complete coverage, analysis, and updates."}
                </p>
                {targetUrl && (
                  <>
                    <a
                      href={targetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-sm font-bold text-white hover:bg-red-700 transition-colors shadow-xs"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {language === "hi" ? "पूरा लेख पढ़ें →" : "Read Full Article →"}
                    </a>
                    {shouldAutoRedirect && (
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {language === "hi"
                          ? `${redirectSeconds} सेकंड में मूल लेख खुल रहा है... `
                          : `Opening original article in ${redirectSeconds} second${redirectSeconds === 1 ? "" : "s"}... `}
                        <a href={targetUrl} className="underline hover:text-red-600 dark:hover:text-red-400">
                          {language === "hi" ? "यदि रीडायरेक्ट न हो तो यहां क्लिक करें" : "Click here if not redirected"}
                        </a>
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </article>

          {/* Topic Live Tracker Bar & Social Follow Icons */}
          <div className={`mt-8 rounded-2xl border p-5 shadow-lg ${
            isDark
              ? "border-[#383d45] bg-[#25282d] text-white"
              : "border-slate-200 bg-white text-slate-900"
          }`}>
            <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs`}>
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
          {/* Widget 0: Compact askTimesPrime — moved here from the bottom of
              the article so it's visible without scrolling past everything. */}
          <div className={`rounded-2xl border p-3.5 shadow-sm space-y-3 ${
            isDark
              ? "border-[#383d45] bg-[#25282d] text-white"
              : "border-slate-200 bg-white text-slate-900"
          }`}>
            <div className="flex items-center space-x-1.5 text-red-500 font-serif font-black text-xs uppercase tracking-wider">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
              </span>
              <Sparkles className="h-3.5 w-3.5 text-red-500" />
              <span>askTimesPrime</span>
            </div>
            <form onSubmit={handleAiAsk} className="relative flex items-center">
              <input
                type="text"
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                placeholder={language === "hi" ? "इस लेख के बारे में कुछ भी पूछें..." : "Ask anything about this article..."}
                className={`w-full rounded-xl border py-2 pl-3 pr-9 text-[11px] font-medium focus:outline-none transition-colors ${
                  isDark
                    ? "border-[#383d45] bg-[#1f2226] text-white placeholder-slate-500 focus:border-red-500"
                    : "border-slate-200 bg-slate-50 text-slate-900 placeholder-slate-400 focus:border-red-600"
                }`}
              />
              <button
                type="submit"
                disabled={aiLoading}
                className="absolute right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors shadow-xs"
              >
                {aiLoading ? (
                  <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ArrowRight className="h-3 w-3" />
                )}
              </button>
            </form>
            {aiResponse && (
              <div className={`rounded-lg border p-3 text-[11px] leading-relaxed animate-in fade-in ${
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
          </div>

          {/* Widget 1: Top Trending Stories Card List */}
          <div className="rounded-2xl border border-slate-200 dark:border-[#2b2f36] bg-white dark:bg-[#25282d] p-4 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#2b2f36] pb-3">
              <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                <TrendingUp className="h-4 w-4" />
                <span>{language === "hi" ? "आज के मुख्य ट्रेंडिंग" : "Top Trending Today"}</span>
              </div>
              <span className="flex items-center gap-1 text-[10px] font-extrabold uppercase bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full">
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-600 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-600" />
                </span>
                {language === "hi" ? "लाइव" : "Live"}
              </span>
            </div>

            <div className="space-y-3.5">
              {rightSidebarTrending.map((art, idx) => {
                const artSlug = encodeURIComponent(
                  art.article_id || art.title.slice(0, 30)
                );
                const imgSrc = dedupedImages.get(art)!;
                const rankColor =
                  idx === 0 ? "bg-red-600" : idx === 1 ? "bg-red-500" : idx === 2 ? "bg-red-400" : "bg-slate-500";

                return (
                  <Link
                    key={art.article_id || idx}
                    href={`/article/${artSlug}?url=${encodeURIComponent(art.link)}&image=${encodeURIComponent(imgSrc)}`}
                    className="group flex items-center space-x-3 border-b border-slate-100 dark:border-[#2b2f36] last:border-0 pb-3.5 last:pb-0"
                  >
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white ${rankColor}`}>
                      {idx + 1}
                    </span>
                    <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg">
                      <Image
                        src={imgSrc}
                        alt={art.title}
                        fill
                        sizes="64px"
                        className="object-cover transition-transform duration-300 group-hover:scale-110"
                      />
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
              {(
                [
                  { key: "yes" as const, pct: 82, label: language === "hi" ? "हाँ, बहुत उपयोगी" : "Yes, Very Insightful", bar: "bg-emerald-500", border: "border-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-300" },
                  { key: "neutral" as const, pct: 12, label: language === "hi" ? "तटस्थ" : "Neutral", bar: "bg-blue-500", border: "border-blue-500", bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-300" },
                  { key: "more" as const, pct: 6, label: language === "hi" ? "और विवरण चाहिए" : "Needs More Details", bar: "bg-amber-500", border: "border-amber-500", bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-300" },
                ]
              ).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setPollVoted(opt.key)}
                  className={`w-full text-left p-2.5 rounded-xl border transition-all font-semibold ${
                    pollVoted === opt.key ? `${opt.border} ${opt.bg} ${opt.text}` : "border-slate-200 dark:border-[#383d45] hover:bg-slate-50 dark:hover:bg-[#2f333a]"
                  }`}
                >
                  <span className="flex items-center justify-between">
                    <span>{opt.label}</span>
                    <span className="font-bold text-[11px] opacity-80">
                      {pollVoted ? `${opt.pct}%` : opt.key === "yes" ? <ThumbsUp className="h-3.5 w-3.5" /> : "—"}
                    </span>
                  </span>
                  {pollVoted && (
                    <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-[#1a1c1e]">
                      <span
                        className={`block h-full rounded-full ${opt.bar} transition-all duration-500`}
                        style={{ width: `${opt.pct}%` }}
                      />
                    </span>
                  )}
                </button>
              ))}
            </div>
            {pollVoted && (
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold text-center pt-1">
                {language === "hi" ? "✓ मत देने के लिए धन्यवाद! 1,284 वोट" : "✓ Thank you for voting! 1,284 votes"}
              </p>
            )}
          </div>

          {/* Widget 3: Must-Read Photo Stories Grid — removed. Its "photos"
              were the same limited stock-image pool used everywhere else on
              the page, adding visual clutter without unique content. */}

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

          {/* Widget 5: Daily Digest Newsletter Widget — kept prominent for
              retention, so it gets a stronger border + shadow than the
              other sidebar widgets rather than blending in. */}
          <div className="rounded-2xl border-2 border-[#1E3A5F]/30 dark:border-[#4A7BAF]/40 bg-white dark:bg-[#25282d] text-slate-900 dark:text-white p-5 shadow-md space-y-3">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
              <Flame className="h-4 w-4 text-red-600 dark:text-red-400" />
              <span>{language === "hi" ? "दैनिक समाचार पत्रिका" : "Daily Digest"}</span>
            </div>
            <h4 className="font-serif text-sm font-bold">
              {language === "hi"
                ? "हर सुबह मुख्य समाचार सीधे अपने इनबॉक्स में पाएं"
                : "Get top news updates delivered directly to your inbox"}
            </h4>
            {newsletterSubmitted ? (
              <p className="flex items-center gap-2 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/40 px-3 py-2.5 text-xs font-semibold text-green-700 dark:text-green-400">
                <CheckCircle className="h-4 w-4 shrink-0" />
                {language === "hi"
                  ? "आप सूची में शामिल हो गए हैं! पहला संस्करण कल सुबह आएगा।"
                  : "You're on the list! First edition arrives tomorrow morning."}
              </p>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const emailInput = e.currentTarget.querySelector<HTMLInputElement>('input[type="email"]');
                  if (!emailInput?.value.trim()) return;
                  setNewsletterSubmitted(true);
                  setTimeout(() => setNewsletterSubmitted(false), 4000);
                }}
                className="space-y-2"
              >
                <input
                  type="email"
                  required
                  placeholder={language === "hi" ? "आपका ईमेल पता" : "Your email address"}
                  className="w-full rounded-xl border border-slate-200 dark:border-[#383d45] bg-slate-50 dark:bg-[#1f2226] px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:border-[#1E3A5F] focus:outline-none"
                />
                <button
                  type="submit"
                  className="w-full rounded-xl bg-[#1E3A5F] py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#16293f] transition-colors shadow-xs"
                >
                  {language === "hi" ? "सदस्यता लें" : "Subscribe"}
                </button>
              </form>
            )}
          </div>
        </aside>
      </div>

      {/* 5. Recommended & Suggested Stories Grid at Bottom */}
      {bottomSuggestedArticles.length > 0 && (
        <section className="rounded-2xl bg-gray-50 dark:bg-[#1a1c1e] p-4 sm:p-6 lg:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-base font-black text-slate-900 dark:text-white uppercase tracking-wider">
              <Compass className="h-5 w-5 text-red-600 dark:text-red-400" />
              <span>{language === "hi" ? "आपके लिए और खबरें" : "You Might Also Like"}</span>
            </div>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              {language === "hi" ? "आपके लिए चुनिंदा प्रमुख समाचार" : "Showing top curated stories for you"}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {bottomSuggestedArticles.map((article) => (
              <ArticleCard
                key={article.article_id || article.link}
                article={article}
                language={language}
                imageUrl={dedupedImages.get(article)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
