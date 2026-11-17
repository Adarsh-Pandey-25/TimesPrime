"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Article } from "@timesprime/shared/types";
import { Share2, Copy, Check, Clock, ExternalLink, TrendingUp, ChevronRight, Compass } from "lucide-react";
import ArticleCard from "@/components/news/ArticleCard";
import AskAboutArticle from "@/components/article/AskAboutArticle";

import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@timesprime/ui/ThemeContext";
import { assignPlaceholders, thumbnailFor } from "@timesprime/shared/config/categoryPlaceholders";
import { safePublisherHref } from "@timesprime/shared/lib/urlValidation";
import { aiChatEnabled } from "@timesprime/shared/config/aiChat";

/** Bare hostname (no "www."), the source's name when the row carries none. */
function getSourceDomain(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * When the story was published, in India's time, as the reader's language writes it. NewsData's
 * times carry no zone and are UTC; stored rows may carry one. Null when there is none to show.
 */
export function storyTime(pubDate: string | undefined, language: string): string | null {
  if (!pubDate) return null;
  const iso = /[zZ]$|[+-]\d\d:?\d\d$/.test(pubDate) ? pubDate : `${pubDate.replace(" ", "T")}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const text = date.toLocaleString(language === "hi" ? "hi-IN" : "en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${text} IST`;
}

interface ArticleDetailViewProps {
  /** The stored outside story (B-05): headline, NewsData's short summary, source, time, category. */
  story: Article;
  allArticles: Article[];
}

/**
 * An outside story (B-05, Phase B, approved by the owner's senior on 16 Nov 2026): its headline,
 * NewsData's short summary, the source, the time and a link to the full story on the publisher's
 * site. TimesPrime shows no part of the publisher's text and no translation of it: Hindi readers
 * get stories from NewsData's Hindi feed instead (R1-12). The page around it lists more stories.
 */
export default function ArticleDetailView({ story, allArticles }: ArticleDetailViewProps) {
  const { language } = useLanguage();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [copied, setCopied] = useState(false);

  // Every link out to the publisher goes through this (F-005): http(s), a named host, no
  // credentials. The page passes only a stored story, so this is the second check, not the first.
  const publisherHref = safePublisherHref(story.link);
  const sourceDomain = getSourceDomain(publisherHref ?? undefined);
  const sourceName = story.source_name || sourceDomain || (language === "hi" ? "स्रोत" : "the source");
  const published = storyTime(story.pubDate, language);

  // The side lists follow the reader's language: the feed's stories in that language.
  const [articlesList, setArticlesList] = useState<Article[]>(allArticles);
  useEffect(() => {
    let isMounted = true;
    const fetchLanguageNews = async () => {
      try {
        const res = await fetch(`/api/news/top-headlines?category=general&language=${language}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.results && data.results.length > 0) setArticlesList(data.results);
        }
      } catch {
        // The server's list stays.
      }
    };
    fetchLanguageNews();
    return () => {
      isMounted = false;
    };
  }, [language]);

  const isHindiText = (str?: string) => !!str && /[ऀ-ॿ]/.test(str);
  const others = articlesList.filter((art) => art.link !== story.link);
  const inLanguage = others.filter((art) => (language === "hi" ? isHindiText(art.title) : !isHindiText(art.title)));
  const displayArticles = inLanguage.length > 0 ? inLanguage : others;

  // Disjoint slices, so no story shows twice on the page.
  const relatedNews = displayArticles.slice(0, 4);
  const trending = displayArticles.slice(4, 12);
  const suggested = displayArticles.slice(12, 20);

  // Each story's own category drawing (B-03): never a stock or publisher photo.
  const dedupedImages = assignPlaceholders([story, ...relatedNews, ...trending, ...suggested]);
  const heroImage = dedupedImages.get(story)!;

  const storyHref = (art: Article) =>
    `/article/${encodeURIComponent(art.article_id || art.title.slice(0, 30))}?url=${encodeURIComponent(art.link)}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: story.title, url: window.location.href });
      } catch {
        // Share cancelled
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 text-xs font-semibold text-slate-500 dark:text-slate-400 overflow-x-auto pb-2 border-b border-slate-200 dark:border-[#2b2f36]">
        <Link href="/" className="hover:text-red-600 transition-colors">
          {language === "hi" ? "मुख्य पृष्ठ" : "Home"}
        </Link>
        <ChevronRight className="h-3 w-3 text-slate-400" />
        <span className="truncate max-w-xs sm:max-w-md font-bold text-slate-700 dark:text-slate-300">{story.title}</span>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
        {/* LEFT COLUMN: related stories */}
        <aside className="space-y-8 lg:col-span-3 order-2 lg:order-1 border-t lg:border-t-0 lg:border-r border-slate-200 dark:border-[#2b2f36] lg:pr-6 pt-6 lg:pt-0 sticky top-24">
          {relatedNews.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-serif text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white border-b-2 border-red-600 pb-1.5 inline-block">
                {language === "hi" ? "संबंधित खबरें" : "Related News"}
              </h3>
              <div className="space-y-1">
                {relatedNews.map((art, idx) => (
                  <Link
                    key={art.article_id || idx}
                    href={storyHref(art)}
                    className={`group flex items-start gap-2.5 rounded-lg p-2 -mx-2 transition-colors border-b border-slate-100 dark:border-[#2b2f36] last:border-0 ${
                      isDark ? "hover:bg-[#22252a]" : "hover:bg-slate-50"
                    }`}
                  >
                    <span className="mt-0.5 shrink-0 text-xs font-black text-red-600 dark:text-red-400 w-4">{idx + 1}.</span>
                    <div className="relative h-11 w-14 shrink-0 overflow-hidden rounded-lg">
                      <Image src={thumbnailFor(art)} alt="" fill sizes="56px" className="object-cover" />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <h4 className="text-xs font-bold leading-snug text-slate-800 dark:text-slate-200 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors line-clamp-2">
                        {art.title}
                      </h4>
                      {art.source_name && (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{art.source_name}</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* CENTER: the story */}
        <article className="space-y-6 lg:col-span-6 order-1 lg:order-2">
          <h1 className="font-serif text-2xl font-extrabold leading-tight text-slate-900 dark:text-white sm:text-3xl lg:text-4xl">
            {story.title}
          </h1>

          {/* Source, time, share */}
          <div className="flex flex-wrap items-center justify-between border-y border-slate-200 dark:border-[#2b2f36] py-2.5 text-xs text-slate-500 dark:text-slate-400 gap-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {language === "hi" ? `स्रोत: ${sourceName}` : `Source: ${sourceName}`}
              </span>
              {published && (
                <>
                  <span aria-hidden="true">|</span>
                  <span className="flex items-center gap-1 font-medium">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    <time dateTime={story.pubDate}>{published}</time>
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center space-x-3">
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
                aria-label={language === "hi" ? "कॉपी लिंक" : "Copy Link"}
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-slate-200 dark:border-[#2b2f36] shadow-sm">
            <Image src={heroImage} alt="" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" preload fetchPriority="high" />
          </div>

          {/* NewsData's short summary, said to be the source's */}
          {story.description && (
            <section className="space-y-2" aria-label={language === "hi" ? "सारांश" : "Summary"}>
              <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {language === "hi" ? `${sourceName} के अनुसार सारांश` : `Summary, as published by ${sourceName}`}
              </h2>
              <p className="text-sm sm:text-base font-medium leading-relaxed text-slate-700 dark:text-slate-200">{story.description}</p>
            </section>
          )}

          {/* The full story, on the publisher's site */}
          {publisherHref && (
            <div className="rounded-xl border border-slate-200 dark:border-[#383d45] border-l-4 border-l-red-600 bg-white dark:bg-[#25282d] p-5 space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {language === "hi"
                  ? `पूरी खबर ${sourceName} की वेबसाइट पर है। टाइम्सप्राइम यहां सिर्फ़ शीर्षक और एक छोटा सारांश दिखाता है।`
                  : `The full story is on ${sourceName}'s website. TimesPrime shows only the headline and a short summary here.`}
              </p>
              <a
                href={publisherHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-sm font-bold text-white hover:bg-red-700 transition-colors shadow-xs"
              >
                <ExternalLink className="h-4 w-4" />
                {language === "hi" ? `पूरी खबर ${sourceName} पर पढ़ें` : `Read the full story at ${sourceName}`}
              </a>
            </div>
          )}
        </article>

        {/* RIGHT COLUMN */}
        <aside className="space-y-6 lg:col-span-3 order-3 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-[#2b2f36] lg:pl-6 pt-6 lg:pt-0 sticky top-24">
          {aiChatEnabled() && <AskAboutArticle title={story.title} description={story.description ?? undefined} />}

          {trending.length > 0 && (
            <div className="rounded-2xl border border-slate-200 dark:border-[#2b2f36] bg-white dark:bg-[#25282d] p-4 shadow-xs space-y-4">
              <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-[#2b2f36] pb-3 text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                <TrendingUp className="h-4 w-4" />
                <span>{language === "hi" ? "और खबरें" : "More Stories"}</span>
              </div>
              <div className="space-y-3.5">
                {trending.map((art, idx) => (
                  <Link
                    key={art.article_id || idx}
                    href={storyHref(art)}
                    className="group flex items-center space-x-3 border-b border-slate-100 dark:border-[#2b2f36] last:border-0 pb-3.5 last:pb-0"
                  >
                    <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg">
                      <Image src={thumbnailFor(art)} alt="" fill sizes="64px" className="object-cover" />
                    </div>
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <h4 className="line-clamp-2 text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors leading-snug">
                        {art.title}
                      </h4>
                      {art.source_name && (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block truncate">{art.source_name}</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {suggested.length > 0 && (
        <section className="rounded-2xl bg-gray-50 dark:bg-[#1a1c1e] p-4 sm:p-6 lg:p-8 space-y-6">
          <div className="flex items-center space-x-2 text-base font-black text-slate-900 dark:text-white uppercase tracking-wider">
            <Compass className="h-5 w-5 text-red-600 dark:text-red-400" />
            <span>{language === "hi" ? "आपके लिए और खबरें" : "You Might Also Like"}</span>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {suggested.map((article) => (
              <ArticleCard key={article.article_id || article.link} article={article} language={language} imageUrl={dedupedImages.get(article)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
