/**
 * Contextual Topic Image Selector Utility
 * Analyzes article titles, categories, and descriptions (in Hindi and English)
 * to return high-resolution, topic-relevant thumbnail images instead of generic placeholders.
 */

import { isAllowedImageUrl } from "./imageDomains";
import { Article } from "@/types";

const TOPIC_IMAGE_MAP = [
  {
    keywords: [
      // Politics, Government, Law, India, State Affairs
      "बंगाल", "सरकार", "पुलिस", "चुनाव", "मदरसा", "मस्जिद", "कोर्ट", "नेता", "मंत्रालय", "प्रशासन", "संसद", "संविधान", "सुप्रीम कोर्ट", "हाईकोर्ट", "कमिशनर", "एसपी", "शुभेंदु", "भाजपा", "कांग्रेस", "आप", "केजरीवाल", "मोदी",
      "bengal", "government", "police", "election", "court", "minister", "parliament", "politics", "india", "modi", "state", "assembly", "governance", "judge", "bjp", "congress", "law"
    ],
    imageUrls: [
      "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=1200&auto=format&fit=crop&q=80", // Lady Justice
      "https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=1200&auto=format&fit=crop&q=80", // Parliament
      "https://images.unsplash.com/photo-1555848962-6e79363ec58f?w=1200&auto=format&fit=crop&q=80", // Gavel
      "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=1200&auto=format&fit=crop&q=80", // Government building
    ],
  },
  {
    keywords: [
      // Tech, AI, Mobile, Cyber, Gadgets
      "एआई", "तकनीक", "स्मार्टफोन", "कंप्यूटर", "सॉफ्टवेयर", "ऐप", "साइबर", "डेटा", "एप्पल", "गूगल", "माइक्रोसॉफ्ट", "मोबाइल", "इंटरनेट",
      "ai", "tech", "technology", "apple", "iphone", "google", "software", "chip", "cyber", "data", "robot", "cloud", "app", "gadget"
    ],
    imageUrls: [
      "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop&q=80", // Circuits
      "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200&auto=format&fit=crop&q=80", // AI / neural
      "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1200&auto=format&fit=crop&q=80", // Code / matrix
      "https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=1200&auto=format&fit=crop&q=80", // AI robot
    ],
  },
  {
    keywords: [
      // Business, Stocks, Economy, Banking, Finance. The "shares"/"nasdaq"/
      // "short interest" style keywords cover a very common NewsData.io
      // headline pattern — stock-ticker-mention articles like "XYZ Corp
      // (NASDAQ:XYZ) Sees Large Drop in Short Interest" — that don't
      // literally contain "stock" or "market" anywhere in the text.
      "व्यापार", "शेयर", "बाज़ार", "अर्थव्यवस्था", "बैंक", "निवेश", "वित्त", "रुपया", "डॉलर", "कम्पनी", "स्टॉक", "बिटकॉइन",
      "business", "stock", "stocks", "shares", "market", "markets", "economy", "bank", "crypto",
      "bitcoin", "trade", "finance", "financial", "investor", "investors", "revenue", "dollar",
      "nasdaq", "nyse", "earnings", "shareholder", "shareholders", "etf", "ipo"
    ],
    imageUrls: [
      "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&auto=format&fit=crop&q=80", // Skyscrapers / city
      "https://images.unsplash.com/photo-1444653614773-995cb1ef9efa?w=1200&auto=format&fit=crop&q=80", // Business meeting
      "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1200&auto=format&fit=crop&q=80", // Trading screen
      "https://images.unsplash.com/photo-1579532537598-459ecdaf39cc?w=1200&auto=format&fit=crop&q=80", // Charts
    ],
  },
  {
    keywords: [
      // Sports, Cricket, Football, Tennis
      "खेल", "क्रिकेट", "मैच", "टीम", "खिलाड़ी", "टूर्नामेंट", "ओलंपिक", "जीत", "विश्व कप", "आईपीएल", "फुटबॉल",
      "sport", "sports", "cricket", "football", "match", "stadium", "cup", "champion", "league", "ipl", "messi", "ronaldo", "virat"
    ],
    imageUrls: [
      "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1200&auto=format&fit=crop&q=80", // Stadium
      "https://images.unsplash.com/photo-1540747913346-19212a729b62?w=1200&auto=format&fit=crop&q=80", // Cricket
      "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1200&auto=format&fit=crop&q=80", // Football
      "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=1200&auto=format&fit=crop&q=80", // Running track
    ],
  },
  {
    keywords: [
      // Entertainment, Cinema, Movies, Bollywood
      "फिल्म", "सिनेमा", "अभिनेता", "अभिनेत्री", "मनोरंजन", "संगीत", "गीत", "बॉलीवुड", "हॉलीवुड", "स्टार", "ट्रेलर",
      // "star" deliberately excluded: as a bare English word it's genuinely
      // ambiguous (celebrity vs. astronomical star) and was misrouting
      // astronomy headlines ("...a massive star has been discovered") into
      // Entertainment. The Hindi "स्टार" loanword is kept — in Hindi
      // journalism it's used almost exclusively for celebrities, since
      // "तारा" is the word for an astronomical star.
      "movie", "film", "cinema", "actor", "actress", "entertainment", "music", "trailer", "bollywood", "hollywood", "ott"
    ],
    imageUrls: [
      "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1200&auto=format&fit=crop&q=80", // Cinema hall
      "https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?w=1200&auto=format&fit=crop&q=80", // Movie camera
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1200&auto=format&fit=crop&q=80", // Concert
      "https://images.unsplash.com/photo-1512036666432-2181c1f26420?w=1200&auto=format&fit=crop&q=80", // Music studio
    ],
  },
  {
    keywords: [
      // Health, Medical, Science
      "स्वास्थ्य", "अस्पताल", "डॉक्टर", "दवा", "बीमारी", "इलाज", "वैक्सीन", "कैंसर", "कोरोना", "वायरस",
      "health", "hospital", "doctor", "medicine", "disease", "cure", "virus", "medical", "vaccine", "treatment"
    ],
    imageUrls: [
      "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1200&auto=format&fit=crop&q=80", // Medical lab
      "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=1200&auto=format&fit=crop&q=80", // Doctor
      "https://images.unsplash.com/photo-1584820927498-cfe5211fd8bf?w=1200&auto=format&fit=crop&q=80", // Hospital
      "https://images.unsplash.com/photo-1530026405186-ed1f139313f8?w=1200&auto=format&fit=crop&q=80", // Pharmacy
    ],
  },
  {
    keywords: [
      // Space, Astronomy, Rocket, Science
      "अंतरिक्ष", "रॉकेट", "उपग्रह", "ग्रह", "वैज्ञानिक", "नासा", "इसरो", "विज्ञान", "खगोल",
      "space", "nasa", "isro", "rocket", "planet", "astronomy", "galaxy", "moon", "mars", "satellite", "physics"
    ],
    imageUrls: [
      "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&auto=format&fit=crop&q=80", // Deep space
      "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=1200&auto=format&fit=crop&q=80", // Earth from space
      "https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?w=1200&auto=format&fit=crop&q=80", // Moon
      "https://images.unsplash.com/photo-1457364887197-9150188c107b?w=1200&auto=format&fit=crop&q=80", // Rocket launch
    ],
  },
  {
    keywords: [
      // Science, Research, Laboratory, Discovery (deliberately broader than
      // the Space bucket above, which only covers astronomy specifically —
      // general science articles like "researchers discover..." or
      // "study finds..." matched nothing before this bucket existed, which
      // was the root cause of every Science-category card collapsing onto
      // the same generic fallback image)
      "अनुसंधान", "अध्ययन", "प्रयोगशाला", "खोज", "रसायन", "जीव विज्ञान", "शोधकर्ता",
      "research", "researcher", "researchers", "scientist", "scientists", "study", "studies",
      "discovery", "discovered", "laboratory", "chemistry", "biology", "university",
      "experiment", "breakthrough", "findings"
    ],
    imageUrls: [
      "https://images.unsplash.com/photo-1507413245164-6160d8298b31?w=1200&auto=format&fit=crop&q=80", // Plasma ball / physics
      "https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=1200&auto=format&fit=crop&q=80", // Lab glassware / pipette
      "https://images.unsplash.com/photo-1518152006812-edab29b069ac?w=1200&auto=format&fit=crop&q=80", // Microscopes
      "https://images.unsplash.com/photo-1554475901-4538ddfbccc2?w=1200&auto=format&fit=crop&q=80", // Chemistry test tubes
    ],
  },
];

// Deterministic per-article picker within a topic's image pool, so the same
// article always resolves to the same image (SSR/CSR consistency) while
// different articles in the same topic spread across the pool instead of
// all collapsing onto entry [0].
function hashTitle(title: string): number {
  return title.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
}

// Characters that count as "part of a word" for boundary purposes, covering
// both Latin and Devanagari script since keywords mix both.
const WORD_CHARS = "a-zA-Z0-9\\u0900-\\u097F";

/**
 * Whole-word keyword match — NOT a plain substring check. Short/common
 * keywords like Tech's "ai" or Entertainment's "star" would otherwise match
 * inside unrelated words ("affairs", "maintain", "started", "startup"),
 * silently routing completely unrelated articles to the wrong topic image.
 * Found live: an astronomy headline about a "massive star" was matching
 * Entertainment via "star" inside nothing at all — "star" itself — while a
 * malware/security article matched Tech's "ai" via "affairs".
 */
function keywordMatches(haystack: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?<![${WORD_CHARS}])${escaped}(?![${WORD_CHARS}])`, "i");
  return pattern.test(haystack);
}

// General India / Global News default image (clean newspaper press badge).
// Used both when no topic keyword matches, and by callers (e.g. HomeClient's
// dedup pass) as a neutral last resort once a topic's whole pool is used up.
export const GENERIC_NEWS_FALLBACK = "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=1200&auto=format&fit=crop&q=80";

/**
 * Returns the full ordered pool of contextually relevant images for an
 * article: the deterministic hash-picked image first, followed by the rest
 * of that topic's pool (wrapped around). Callers that need to avoid
 * duplicate images across several cards (e.g. a feed page) can walk this
 * list and pick the first entry not already in use.
 */
function buildCombinedText(
  title?: string | null,
  category?: string | string[] | null,
  description?: string | null
): string {
  return `${title || ""} ${description || ""} ${Array.isArray(category) ? category.join(" ") : category || ""}`.toLowerCase();
}

/** Index into TOPIC_IMAGE_MAP of the first matching topic, or null if none match. */
function findMatchingTopicIndex(combinedText: string): number | null {
  for (let i = 0; i < TOPIC_IMAGE_MAP.length; i++) {
    for (const kw of TOPIC_IMAGE_MAP[i].keywords) {
      if (keywordMatches(combinedText, kw)) return i;
    }
  }
  return null;
}

export function getTopicImageCandidates(
  title?: string | null,
  category?: string | string[] | null,
  description?: string | null,
  existingUrl?: string | null
): string[] {
  // Only use existingUrl if it's on the next/image allowlist (see
  // imageDomains.ts) — anything else (the vast majority of real article
  // images, which come from arbitrary publisher domains via NewsData.io)
  // falls through to the keyword-matched Unsplash image below instead of
  // being rejected by Next's image optimizer at render time.
  if (
    existingUrl &&
    typeof existingUrl === "string" &&
    isAllowedImageUrl(existingUrl) &&
    existingUrl !== GENERIC_NEWS_FALLBACK
  ) {
    return [existingUrl];
  }

  const topicIndex = findMatchingTopicIndex(buildCombinedText(title, category, description));
  if (topicIndex === null) return [GENERIC_NEWS_FALLBACK];

  const pool = TOPIC_IMAGE_MAP[topicIndex].imageUrls;
  const startIdx = hashTitle(title || "") % pool.length;
  return [...pool.slice(startIdx), ...pool.slice(0, startIdx)];
}

/**
 * Returns a single contextually relevant thumbnail image based on article
 * title, category, and description (the deterministic hash pick from
 * getTopicImageCandidates).
 */
export function getTopicImageUrl(
  title?: string | null,
  category?: string | string[] | null,
  description?: string | null,
  existingUrl?: string | null
): string {
  return getTopicImageCandidates(title, category, description, existingUrl)[0];
}

/**
 * Assigns a deduplicated image to every article in a list.
 *
 * This is the one place that dedup logic should live — every component that
 * renders more than one article card side by side (home feed, category
 * dropdown, article detail sidebars, saved articles, suggested-stories
 * grids) needs it, and copy-pasting the same loop into each of them is
 * exactly how the "same image on every card" bug went unfixed in most of
 * the app after being fixed in only one place.
 *
 * Per-topic round robin, not "first unused, else the shared fallback":
 * on a single CATEGORY page almost every visible card matches the same one
 * topic by definition, so a naive "fall back to the shared generic photo
 * once the 4-image pool runs out" rule meant cards 5+ in a filtered
 * Entertainment/Business/etc. feed all collapsed onto one identical
 * placeholder — visually indistinguishable from the original bug even
 * though each pick was individually "correct". Instead, each topic gets
 * its own cursor that keeps cycling through that topic's pool
 * (1,2,3,4,1,2,3,4,...), so repeats are spaced out and still thematically
 * right, rather than every card past the 4th being an identical stranger.
 * GENERIC_NEWS_FALLBACK is reserved for articles that match no topic at all.
 *
 * Each call starts fresh — callers that render several *separate* groups of
 * cards on the same page (e.g. a sidebar list and a lower grid) should call
 * this once per group rather than sharing one Map across groups, unless
 * they specifically want dedup to span both.
 */
export function assignDedupedTopicImages(articles: Article[]): Map<Article, string> {
  const topicDrawCounts = new Map<number, number>();
  const imageMap = new Map<Article, string>();

  for (const art of articles) {
    if (!art) continue;

    if (
      art.image_url &&
      typeof art.image_url === "string" &&
      isAllowedImageUrl(art.image_url) &&
      art.image_url !== GENERIC_NEWS_FALLBACK
    ) {
      imageMap.set(art, art.image_url);
      continue;
    }

    const combinedText = buildCombinedText(art.title, art.category, art.description);
    const topicIndex = findMatchingTopicIndex(combinedText);

    if (topicIndex === null) {
      imageMap.set(art, GENERIC_NEWS_FALLBACK);
      continue;
    }

    // Pure sequential cycling (no per-article hash offset here): mixing in
    // a hash-based start index let two unrelated articles' offsets
    // coincidentally land on the same slot, clustering repeats together.
    // A plain counter guarantees consecutive same-topic articles are always
    // `pool.length` apart — the maximum possible spacing for a fixed pool.
    const pool = TOPIC_IMAGE_MAP[topicIndex].imageUrls;
    const drawCount = topicDrawCounts.get(topicIndex) ?? 0;
    const picked = pool[drawCount % pool.length];

    topicDrawCounts.set(topicIndex, drawCount + 1);
    imageMap.set(art, picked);
  }

  return imageMap;
}
