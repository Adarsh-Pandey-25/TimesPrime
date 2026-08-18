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
import { getCategoryColor, getCategoryBadgeBgClass, getCategoryBorderClass } from "@/lib/categoryColors";

// NewsData.io returns this literal string as the description (and
// sometimes the title) for articles whose full content requires a paid
// plan. Detect it so paywalled placeholder text never reaches the UI.
const PAYWALL_PLACEHOLDER = "ONLY AVAILABLE IN PAID PLANS";

function containsPaywallPlaceholder(text?: string | null): boolean {
  return !!text && text.toUpperCase().includes(PAYWALL_PLACEHOLDER);
}

/** Shown in place of the image when it fails to load, instead of a blank/broken box. */
function ImagePlaceholder() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800">
      <span
        className="font-serif text-4xl font-black tracking-tight text-white/40 dark:text-white/15 select-none"
        aria-hidden="true"
      >
        TP
      </span>
    </div>
  );
}

interface ArticleCardProps {
  article: Article;
  featured?: boolean;
  language?: Language;
  relatedStories?: Article[];
  // Optional pre-resolved image (e.g. from a feed-level dedup pass). Falls
  // back to this card's own getTopicImageUrl lookup when omitted.
  imageUrl?: string;
  // Optional extra classes merged onto the card's root — e.g. Latest
  // Updates passes a min-height so its 4-col grid stays visually even.
  className?: string;
}

export default function ArticleCard({
  article,
  featured = false,
  language: propsLang,
  relatedStories = [],
  imageUrl,
  className = "",
}: ArticleCardProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const { language: globalLang } = useLanguage();
  const language = globalLang || propsLang || "en";

  const contextualImage = imageUrl || getTopicImageUrl(article.title, article.category, article.description, article.image_url);
  const [imgSrc, setImgSrc] = useState(contextualImage);
  const [imgFailed, setImgFailed] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    setBookmarked(isBookmarked(article.article_id || article.link));
    setImgSrc(imageUrl || getTopicImageUrl(article.title, article.category, article.description, article.image_url));
    // A new article deserves a fresh attempt, not the previous card's failure.
    setImgFailed(false);
  }, [article, imageUrl]);

  // Skip paywalled articles entirely — must come after all hooks above
  // (Rules of Hooks), but before any further rendering work.
  if (containsPaywallPlaceholder(article.title)) {
    return null;
  }

  const t = TRANSLATIONS[language];
  const isDark = theme === "dark";

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
  const cleanBody = containsPaywallPlaceholder(rawBody)
    ? "Click to read the full story at the source."
    : rawBody;
  const displayDesc = translateHeadline(cleanBody, language);

  const articleSlug = encodeURIComponent(
    article.article_id || article.title.slice(0, 30)
  );
  // Pass the already-validated image (imgSrc comes from getTopicImageUrl, which
  // enforces the next/image allowlist). Passing the raw article.image_url here
  // would just put a long publisher URL in the query string that the detail
  // page discards anyway when it isn't on the allowlist.
  const activeImg = imgSrc || contextualImage;
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
    const relImg = getTopicImageUrl(relArt.title, relArt.category, relArt.description, relArt.image_url);
    router.push(`/article/${relSlug}?url=${encodeURIComponent(relArt.link)}&image=${encodeURIComponent(relImg)}`);
  };

  const topicCategory = article.category?.[0] || "News";
  const categoryBorderClass = getCategoryBorderClass(topicCategory);
  const categoryBadgeBgClass = getCategoryBadgeBgClass(topicCategory);
  const categoryDotColor = getCategoryColor(topicCategory);

  // Featured: full-bleed cinematic hero — image top (title overlapping its
  // bottom gradient), everything else stacked below. Structurally different
  // enough from the small-card layout (no shared 12-col grid anymore) that
  // it's its own branch rather than a shared JSX tree with conditionals
  // threaded through every element.
  if (featured) {
    return (
      <Link
        href={detailUrl}
        className={`group relative flex flex-col overflow-hidden rounded-2xl shadow-xl transition-all duration-300 cursor-pointer ${className} ${
          isDark ? "bg-[#1e2124] text-slate-100" : "bg-white text-slate-900"
        }`}
      >
        {/* CINEMATIC IMAGE with overlapping title */}
        <div className="relative aspect-[21/9] w-full overflow-hidden group/img">
          {imgFailed ? (
            <ImagePlaceholder />
          ) : (
            <Image
              src={imgSrc}
              alt={displayTitle}
              fill
              sizes="100vw"
              className="object-cover transition-transform duration-500 group-hover/img:scale-[1.05]"
              onError={() => setImgFailed(true)}
              priority
            />
          )}
          {/* Bottom 40% dark gradient so the overlapping title stays readable */}
          <div className="absolute inset-x-0 bottom-0 h-[40%] bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none" />

          <div className="absolute top-3 left-3 flex items-center gap-1.5">
            <span className="rounded-full bg-white/90 backdrop-blur-sm px-2.5 py-1 text-[10px] font-black text-red-600 uppercase tracking-wider shadow-sm animate-pulse">
              Featured
            </span>
            <span
              className={`rounded-full ${categoryBadgeBgClass} backdrop-blur-sm px-2.5 py-1 text-[10px] font-black text-white uppercase tracking-wider shadow-sm`}
            >
              {topicCategory}
            </span>
          </div>

          <h2 className="absolute inset-x-0 bottom-0 p-4 sm:p-6 font-serif font-extrabold leading-tight text-white text-2xl sm:text-3xl lg:text-4xl [text-shadow:0_2px_10px_rgb(0_0_0_/_60%)]">
            {displayTitle}
          </h2>
        </div>

        {/* CONTENT BELOW IMAGE */}
        <div className="p-4 sm:p-6 space-y-3">
          <div className="flex items-center space-x-2 text-xs opacity-75">
            <span
              className="h-1.5 w-1.5 rounded-full shrink-0"
              style={{ backgroundColor: categoryDotColor }}
              aria-hidden="true"
            />
            <span className="font-bold text-red-600 dark:text-red-400">
              {article.source_name || "Times Media"}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1 text-[11px]" suppressHydrationWarning>
              <Clock className="h-3 w-3" />
              {formatDate(article.pubDate)}
            </span>
          </div>

          <p className="text-[13px] sm:text-sm leading-relaxed text-slate-700 dark:text-slate-300 font-medium line-clamp-3">
            {displayDesc ||
              "Click to read full story coverage and interactive AI executive synthesis."}
          </p>

          {relatedStories.length > 0 && (
            <div className="rounded-xl border border-slate-100 dark:border-[#383d45] bg-slate-50/90 dark:bg-[#1a1c1e]/90 p-3 space-y-2 text-xs">
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

          <div
            className={`pt-3 flex items-center justify-between border-t mt-2 ${
              isDark ? "border-[#34383f]" : "border-slate-100"
            }`}
          >
            <span className="inline-flex items-center space-x-1 text-sm font-bold text-red-600 dark:text-red-400 group-hover:text-red-700">
              <span>{t.readFullArticle}</span>
              <ExternalLink className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
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

  return (
    <Link
      href={detailUrl}
      className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-l-4 ${categoryBorderClass} p-5 transition-all duration-300 shadow-sm cursor-pointer ${className} ${
        isDark
          ? "border-[#34383f] bg-[#26292f] text-slate-100 hover:border-red-600/50 hover:bg-[#2a2d33] hover:shadow-xl hover:shadow-black/30"
          : "border-slate-200 bg-[#FAFAFA] text-slate-900 hover:border-red-500/50 hover:shadow-xl hover:shadow-slate-300/40"
      }`}
    >
      {/* IMAGE CONTAINER */}
      <div className="relative overflow-hidden rounded-xl group/img block aspect-[16/10] w-full">
        {imgFailed ? (
          <ImagePlaceholder />
        ) : (
          <Image
            src={imgSrc}
            alt={displayTitle}
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover/img:scale-[1.08]"
            onError={() => setImgFailed(true)}
          />
        )}
        {/* Bottom gradient overlay for depth — purely decorative here (no
            overlaid text like the featured card), so skip it over the
            placeholder rather than muddying the clean grey gradient. */}
        {!imgFailed && (
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 via-black/10 to-transparent pointer-events-none" />
        )}

        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
          <span
            className={`rounded-full ${categoryBadgeBgClass} backdrop-blur-sm px-2.5 py-1 text-[10px] font-black text-white uppercase tracking-wider shadow-sm`}
          >
            {topicCategory}
          </span>
        </div>
      </div>

      {/* CONTENT COLUMN */}
      <div className="flex flex-col justify-between space-y-3 mt-3">
        <div className="space-y-2.5">
          <div className="flex items-center space-x-2 text-xs opacity-75">
            <span
              className="h-1.5 w-1.5 rounded-full shrink-0"
              style={{ backgroundColor: categoryDotColor }}
              aria-hidden="true"
            />
            <span className="font-bold text-red-600 dark:text-red-400">
              {article.source_name || "Times Media"}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1 text-[11px]" suppressHydrationWarning>
              <Clock className="h-3 w-3" />
              {formatDate(article.pubDate)}
            </span>
          </div>

          <div className="border-t border-slate-100 dark:border-[#34383f]" />

          <h2 className="font-serif font-extrabold leading-normal transition-colors group-hover:text-red-600 dark:group-hover:text-red-400 text-base sm:text-lg line-clamp-2">
            {displayTitle}
          </h2>

          <p className="text-[13px] sm:text-sm leading-relaxed text-slate-700 dark:text-slate-300 font-medium line-clamp-2">
            {displayDesc ||
              "Click to read full story coverage and interactive AI executive synthesis."}
          </p>
        </div>

        {/* BOTTOM ACTION BAR */}
        <div
          className={`pt-3 flex items-center justify-between border-t mt-4 ${
            isDark ? "border-[#34383f]" : "border-slate-100"
          }`}
        >
          <span className="inline-flex items-center space-x-1 text-xs sm:text-sm font-bold text-red-600 dark:text-red-400 group-hover:text-red-700">
            <span>{t.readArticle}</span>
            <ExternalLink className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
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
