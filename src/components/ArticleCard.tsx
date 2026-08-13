"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Article } from "@/types";
import { Clock, ExternalLink, Bookmark, Layers } from "lucide-react";
import { Language, TRANSLATIONS, translateHeadline } from "@/lib/translations";
import { useTheme } from "@/context/ThemeContext";
import { isBookmarked, toggleBookmark } from "@/lib/bookmarks";
import { useLanguage } from "@/context/LanguageContext";

import { getTopicImageUrl } from "@/lib/topicImages";

interface ArticleCardProps {
  article: Article;
  featured?: boolean;
  language?: Language;
  relatedStories?: Article[];
}

export default function ArticleCard({
  article,
  featured = false,
  language: propsLang,
  relatedStories = [],
}: ArticleCardProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const { language: globalLang } = useLanguage();
  const language = globalLang || propsLang || "en";
  
  const contextualImage = getTopicImageUrl(article.title, article.category, article.description, article.image_url);
  const [imgSrc, setImgSrc] = useState(contextualImage);
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    setBookmarked(isBookmarked(article.article_id || article.link));
    setImgSrc(getTopicImageUrl(article.title, article.category, article.description, article.image_url));
  }, [article]);

  const t = TRANSLATIONS[language];
  const isDark = theme === "dark";

  const fallbackImage = contextualImage;

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

      if (diffHours < 1) return language === "hi" ? "अभी-अभी" : "Just now";
      if (diffHours < 24)
        return language === "hi" ? `${diffHours} घंटे पहले` : `${diffHours}h ago`;
      return date.toLocaleDateString(language === "hi" ? "hi-IN" : "en-US", {
        month: "short",
        day: "numeric",
      });
    } catch {
      return language === "hi" ? "हाल ही में" : "Recent";
    }
  };

  const displayTitle = translateHeadline(article.title, language);
  const rawBody = article.description || article.content || "";
  const displayDesc = translateHeadline(rawBody, language);

  const articleSlug = encodeURIComponent(
    article.article_id || article.title.slice(0, 30)
  );
  const activeImg = article.image_url || imgSrc || contextualImage;
  const imageParam = activeImg ? `&image=${encodeURIComponent(activeImg)}` : "";
  const detailUrl = `/article/${articleSlug}?url=${encodeURIComponent(article.link)}${imageParam}`;

  const handleCardClick = () => {
    router.push(detailUrl);
  };

  const handleBookmarkClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newState = toggleBookmark(article);
    setBookmarked(newState);
  };

  const handleSubStoryClick = (e: React.MouseEvent, relArt: Article) => {
    e.preventDefault();
    e.stopPropagation();
    const relSlug = encodeURIComponent(
      relArt.article_id || relArt.title.slice(0, 30)
    );
    const relImg = relArt.image_url || getTopicImageUrl(relArt.title, relArt.category, relArt.description);
    router.push(`/article/${relSlug}?url=${encodeURIComponent(relArt.link)}&image=${encodeURIComponent(relImg)}`);
  };

  const topicCategory = article.category?.[0] || "News";

  return (
    <Link
      href={detailUrl}
      className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border transition-all shadow-sm cursor-pointer ${
        featured ? "md:grid md:grid-cols-12 p-4 md:p-6 gap-6" : "p-4"
      } ${
        isDark
          ? "border-[#34383f] bg-[#25282d] text-slate-100 hover:border-red-600/50 hover:bg-[#2a2d33]"
          : "border-slate-200 bg-white text-slate-900 hover:border-red-500/50 hover:shadow-lg"
      }`}
    >
      {/* IMAGE CONTAINER */}
      <div
        className={`relative overflow-hidden rounded-xl group/img block ${
          featured ? "aspect-video w-full md:col-span-7" : "aspect-[16/10] w-full"
        }`}
      >
        <Image
          src={imgSrc}
          alt={displayTitle}
          fill
          sizes={featured ? "(max-width: 768px) 100vw, 60vw" : "(max-width: 768px) 100vw, 33vw"}
          className="object-cover transition-transform duration-500 group-hover/img:scale-105"
          onError={() => setImgSrc(fallbackImage)}
          priority={featured}
        />
        <div className="absolute top-2.5 left-2.5 flex items-center gap-2">
          <span className="rounded bg-red-600 px-2.5 py-1 text-[10px] font-black text-white uppercase tracking-wider shadow-sm">
            {topicCategory}
          </span>
        </div>
      </div>

      {/* CONTENT COLUMN */}
      <div
        className={`flex flex-col justify-between ${
          featured ? "md:col-span-5 space-y-4 pt-2 md:pt-0" : "space-y-3 mt-3"
        }`}
      >
        <div className="space-y-2.5">
          <div className="flex items-center space-x-2 text-xs opacity-75">
            <span className="font-bold text-red-600 dark:text-red-400">
              {article.source_name || "Times Media"}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1 text-[11px]" suppressHydrationWarning>
              <Clock className="h-3 w-3" />
              {formatDate(article.pubDate)}
            </span>
          </div>

          <h2
            className={`font-serif font-extrabold leading-snug transition-colors group-hover:text-red-600 dark:group-hover:text-red-400 ${
              featured ? "text-xl sm:text-2xl lg:text-3xl" : "text-base sm:text-lg line-clamp-2"
            }`}
          >
            {displayTitle}
          </h2>

          <p
            className={`text-xs sm:text-sm leading-relaxed opacity-85 font-medium ${
              featured ? "line-clamp-3" : "line-clamp-2 text-xs"
            }`}
          >
            {displayDesc ||
              "Click to read full story coverage and interactive AI executive synthesis."}
          </p>

          {/* MORE RELATED HEADLINES BOX */}
          {featured && relatedStories.length > 0 && (
            <div className="mt-3 rounded-xl border border-slate-100 dark:border-[#383d45] bg-slate-50/90 dark:bg-[#1a1c1e]/90 p-3 space-y-2 text-xs">
              <div className="flex items-center space-x-1.5 text-[10px] font-black uppercase tracking-wider text-red-600 dark:text-red-400 border-b border-slate-200 dark:border-[#2f333a] pb-1.5">
                <Layers className="h-3 w-3 text-red-600" />
                <span>More Coverage in {topicCategory}</span>
              </div>
              <div className="space-y-1.5">
                {relatedStories.slice(0, 3).map((relArt, idx) => (
                  <button
                    key={relArt.article_id || idx}
                    onClick={(e) => handleSubStoryClick(e, relArt)}
                    className="w-full text-left flex items-start space-x-2 text-[11px] font-semibold text-slate-800 dark:text-slate-200 hover:text-red-600 dark:hover:text-red-400 transition-colors truncate"
                  >
                    <span className="text-red-600 font-bold">•</span>
                    <span className="truncate">{relArt.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM ACTION BAR */}
        <div className="pt-3 flex items-center justify-between border-t border-slate-100 dark:border-[#34383f] mt-4">
          <span className="inline-flex items-center space-x-1 text-xs sm:text-sm font-bold text-red-600 dark:text-red-400 group-hover:text-red-700">
            <span>{featured ? t.readFullArticle : t.readArticle}</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </span>

          <button
            onClick={handleBookmarkClick}
            className={`rounded-lg p-1.5 transition-colors relative z-20 ${
              bookmarked
                ? "bg-red-600 text-white shadow-xs"
                : "text-slate-400 hover:bg-slate-100 dark:hover:bg-[#31353c] hover:text-slate-600"
            }`}
            title={bookmarked ? "Remove Bookmark" : t.saveArticle}
          >
            <Bookmark className={`h-4 w-4 ${bookmarked ? "fill-current" : ""}`} />
          </button>
        </div>
      </div>
    </Link>
  );
}
