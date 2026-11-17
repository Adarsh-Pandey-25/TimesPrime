/**
 * Shared constants/utilities for the news pipeline: the category map and the editorial filters the
 * worker's refresh and the database reads apply. There are no built-in mock articles (B-04, Phase
 * B): an empty database is an empty feed.
 */

import { Article } from "../types";

export const CATEGORY_MAP: Record<string, string> = {
  general: "top",
  tech: "technology",
  technology: "technology",
  business: "business",
  entertainment: "entertainment",
  sports: "sports",
  science: "science",
  health: "health",
  politics: "politics",
  world: "world",
};

/** Maps a friendly category id (e.g. "tech") to NewsData.io's category taxonomy. */
export function mapCategory(category: string): string {
  return CATEGORY_MAP[category.toLowerCase()] || category;
}

/** Detects Devanagari (Hindi) script in text. */
export function containsHindiScript(text?: string | null): boolean {
  return !!text && /[\u0900-\u097F]/.test(text);
}

// Unicode ranges for the other Indic scripts NewsData.io aggregates besides
// Devanagari (Hindi/Marathi/Sanskrit) \u2014 confirmed against live Supabase data
// (August 2026): 3 Odia-script rows (from sambad_in, otvkhabar_in \u2014 both
// Odisha regional outlets) were passing the old "not Devanagari = English"
// check and leaking into the English feed. This app only has an English/Hindi
// reading experience, so a Bengali/Tamil/Odia/etc. title doesn't belong in
// either feed \u2014 it should be excluded from both, not default to "English".
const INDIC_SCRIPT_REGEX = new RegExp(
  "[" +
    "\u0900-\u097F" + // Devanagari (Hindi/Marathi/Sanskrit)
    "\u0980-\u09FF" + // Bengali/Assamese
    "\u0A00-\u0A7F" + // Gurmukhi (Punjabi)
    "\u0A80-\u0AFF" + // Gujarati
    "\u0B00-\u0B7F" + // Odia
    "\u0B80-\u0BFF" + // Tamil
    "\u0C00-\u0C7F" + // Telugu
    "\u0C80-\u0CFF" + // Kannada
    "\u0D00-\u0D7F" + // Malayalam
    "]"
);

/** Detects ANY Indic script (Devanagari or otherwise) in text. */
export function containsNonLatinIndicScript(text?: string | null): boolean {
  return !!text && INDIC_SCRIPT_REGEX.test(text);
}

/**
 * Keeps only articles whose title script matches the requested language.
 * "hi" = genuine Devanagari only. Anything else ("en") = no Indic script at
 * all \u2014 a Bengali/Odia/Tamil/etc. title is excluded from both feeds rather
 * than falling through to "English" by default (see containsNonLatinIndicScript).
 */
export function filterArticlesByLanguageScript(articles: Article[], language: string): Article[] {
  return articles.filter((art) => {
    if (language === "hi") return containsHindiScript(art.title);
    return !containsNonLatinIndicScript(art.title);
  });
}

// Confirmed against live Supabase data (August 2026): 55 rows matched,
// spread across 9 different categories (business, top, health,
// entertainment, lifestyle, technology, world, science, environment) —
// not limited to any single category. Every sampled title (25 checked)
// was unambiguously daily-horoscope/tarot-card content, zero false
// positives.
//
// Deliberately NOT included: a broader "religious ritual explainer"
// pattern (पूजा/व्रत/मुहूर्त/पुराण-style phrasing) was investigated too,
// but every candidate term found either had negligible volume (0-2 rows)
// or demonstrated real false-positive risk. "पूर्णिमा" (full moon), the
// highest-volume candidate, also matched a genuine Raksha Bandhan
// date-announcement article and a lunar-eclipse news article — exactly
// the "legitimate news article that happens to mention a ritual/festival
// term" failure mode this needs to avoid, not just ritual filler. Rather
// than guess at a workaround, that sub-pattern is left out entirely.
//
// BL-044 (16 Nov 2026): "What Cosmic Changes Await Us? Astrological Insights for 2023 and Beyond"
// got through. Added, as narrowly: "astrological", "ज्योतिषीय" (its Hindi) and "zodiac sign".
// Not "astrology" or "astrologer" alone: "astrology app raises funding" and "police arrest
// astrologer" are news. The feed's read path (db.ts) applies the same filter, so stored rows
// these terms match stop showing; wording they still miss needs a look at the table (BL-044).
const HOROSCOPE_FILLER_TERMS = [
  "राशिफल",
  "टैरो",
  "कुंडली",
  "rashifal",
  "horoscope",
  "tarot",
  "astrological",
  "ज्योतिषीय",
  "zodiac sign",
];

/**
 * True for horoscope/tarot filler content (daily rashifal, tarot card
 * readings) — a distinct non-news content type that NewsData.io tags
 * under real news categories rather than keeping separate.
 */
export function isHoroscopeOrRitualFiller(article: {
  title?: string | null;
  description?: string | null;
}): boolean {
  const text = `${article.title || ""} ${article.description || ""}`.toLowerCase();
  return HOROSCOPE_FILLER_TERMS.some((term) => text.includes(term.toLowerCase()));
}

// Wire-syndication accounts confirmed (August 2026, 400-row sample across
// 8 categories) to redistribute identical off-topic filler — in the
// sample, a single paddy-procurement/crop-survey article, simultaneously
// dumped under "technology", "science", and "india" with zero relevance
// to any of them. Deliberately a narrow, evidence-checked list, not every
// source_id that carried the spam title: two sources that also carried it
// (globalherald_news, satyaexpress) were EXCLUDED from this list because
// they also distributed at least one genuinely on-topic story elsewhere in
// the same sample (a real health-camp article) — a source that sometimes
// publishes real content shouldn't be blanket-banned. Only source_ids with
// zero legitimate content anywhere in the sample are listed here.
const WIRE_SPAM_SOURCE_IDS = [
  "jsrtimes_in",
  "khulasa",
  "jagatvision_co_in",
  "mp18news",
  "digiananews",
  "sameera_co_in",
  "hindustanexpress_online",
  "graminbharattv_in",
];

/** True for NewsData.io source_ids confirmed to redistribute off-topic wire filler with no observed legitimate content. */
export function isFromWireSpamSource(sourceId?: string | null): boolean {
  if (!sourceId) return false;
  return WIRE_SPAM_SOURCE_IDS.includes(sourceId.toLowerCase());
}

// Confirmed against live Supabase data (August 2026): "bringatrailer" is a
// classic/collector car auction-listing site, not a news source — all 12
// rows it had ever contributed were vehicle listings ("16k-Mile 2017 Jaguar
// XJ R-Sport", "Porsche 993 Sport Seats at No Reserve", etc.), 100% tagged
// under "technology"/"top" with zero genuine tech content and zero presence
// in any other category. Unlike the "<Place> News:" hyperlocal-title
// hypothesis investigated in the same pass (rejected — see project history:
// 40-56% of those articles were genuinely on-topic, far above a reasonable
// false-positive bar), this source has no on-topic content to lose.
const NON_NEWS_LISTING_SOURCE_IDS = ["bringatrailer"];

/** True for source_ids confirmed to publish listings (not news) with zero observed on-topic content. */
export function isFromNonNewsListingSource(sourceId?: string | null): boolean {
  if (!sourceId) return false;
  return NON_NEWS_LISTING_SOURCE_IDS.includes(sourceId.toLowerCase());
}

/** Deduplicates articles by normalized (trimmed, lowercased) title. */
export function dedupeArticlesByTitle(articles: Article[]): Article[] {
  const seen = new Set<string>();
  return articles.filter((art) => {
    const key = art.title.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
