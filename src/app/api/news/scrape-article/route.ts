import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import * as Sentry from "@sentry/nextjs";
import { validateExternalUrl } from "@/lib/urlValidation";
import { cache, CACHE_TTL_SCRAPE_SECONDS } from "@/lib/cache";
import { urlToHostname } from "@/lib/sentryScrub";

interface ScrapeCacheEntry {
  title: string;
  content: string[];
  text: string;
  isPaywalled?: boolean;
  description?: string;
  image?: string;
}

const MAX_CONTENT_CHARS = 5000;

// DOM-level removal — runs BEFORE paragraph extraction, so anything inside
// these containers can never reach $("p").each() as a paragraph at all.
// More reliable than the text-pattern matching below: a removed node's
// children are gone from the tree, regardless of what text they contain or
// whether that text happens to match any of the patterns further down.
const DOM_REMOVAL_SELECTORS = [
  '[class*="author-bio"]',
  '[class*="author-info"]',
  '[class*="writer-info"]',
  '[itemprop="author"]',
  "nav",
  "header",
  "footer",
  '[class*="breadcrumb"]',
  '[role="navigation"]',
];

function removeNonContentNodes($: CheerioAPI): void {
  for (const selector of DOM_REMOVAL_SELECTORS) {
    $(selector).remove();
  }
}

// Paywall detection — runs immediately after $ is loaded, before any DOM
// removal or paragraph extraction. A paywalled page's visible HTML is
// mostly a teaser plus a subscription prompt, not the actual article;
// running the normal extraction pipeline on it produces junk or nothing at
// all, which is the "blank content" bug this exists to prevent.
interface PaywallDetectionResult {
  isPaywalled: boolean;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
}

// Class-name fragments commonly used for paywall/subscription-gate
// wrappers. Broad substring matches deliberately: publishers name these
// containers all sorts of things, but "paywall", "subscriber-only", and
// "premium-content" show up across a wide range of CMSs and paywall
// vendors (Piano, Tinypass/Zephr, in-house implementations).
const PAYWALL_SELECTORS = [
  '[class*="paywall"]',
  '[class*="subscriber-only"]',
  '[class*="premium-content"]',
  ".tp-modal",
  ".article-lock",
];

// Meta-tag signals used by publishers integrated with platform-level
// subscription tooling (e.g. Meta's article:content_tier extension, used
// by outlets like Washington Post) to mark a page as locked independent of
// any visible DOM wrapper.
function hasPaywallMetaTag($: CheerioAPI): boolean {
  const contentTier = $('meta[property="article:content_tier"]').attr("content")?.toLowerCase();
  if (contentTier === "locked") return true;

  const access = $('meta[name="access"]').attr("content")?.toLowerCase();
  if (access === "paid" || access === "subscription") return true;

  return false;
}

// schema.org NewsArticle/Article markup's isAccessibleForFree flag — the
// closest thing to an authoritative, publisher-declared paywall signal.
// Scanned across every JSON-LD block on the page since publishers vary in
// whether it's a top-level property or nested under an @graph array.
function hasPaywallStructuredData($: CheerioAPI): boolean {
  let found = false;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (found) return;
    const raw = $(el).html();
    if (!raw || !raw.includes("isAccessibleForFree")) return;
    try {
      const parsed = JSON.parse(raw);
      const nodes = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.["@graph"])
          ? parsed["@graph"]
          : [parsed];
      for (const node of nodes) {
        const value = node?.isAccessibleForFree;
        if (value === false || value === "false" || value === "False") {
          found = true;
          break;
        }
      }
    } catch {
      // Malformed JSON-LD — ignore this block, other signals still apply.
    }
  });
  return found;
}

// schema.org NewsArticle/Article JSON-LD's articleBody — a structured,
// publisher-declared full-text field, independent of whatever HTML markup
// wraps the actual article (custom CMS blocks, JS-rendered content, AMP
// pages, etc.). Reuses the same @graph-aware JSON-LD scan pattern as
// hasPaywallStructuredData above.
//
// Added as a fallback for when $("p") finds nothing usable — confirmed
// against live data (August 2026, 120-URL sample): of 5 pages where normal
// paragraph extraction found zero usable content, 4 (Times of India, News18
// Hindi, Janta Se Rishta, Bundle.app) had a ready JSON-LD articleBody. The
// 5th (a CNBC video page) had no articleBody either, since it genuinely
// wasn't a text article. A general-purpose library (e.g. @mozilla/readability)
// was considered but not adopted — this fallback alone covers the large
// majority of the zero-paragraph cases found, without a new dependency or
// the regression risk of a different extraction strategy on sources that
// already work.
function extractJsonLdArticleBody($: CheerioAPI): string | null {
  let articleBody: string | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (articleBody) return;
    const raw = $(el).html();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const nodes = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.["@graph"])
          ? parsed["@graph"]
          : [parsed];
      for (const node of nodes) {
        if (typeof node?.articleBody === "string" && node.articleBody.trim().length > 0) {
          articleBody = node.articleBody.trim();
          break;
        }
      }
    } catch {
      // Malformed JSON-LD — ignore this block, other signals still apply.
    }
  });
  return articleBody;
}

// articleBody frequently arrives as one run-on string with paragraph breaks
// stripped entirely (confirmed live: a real Times of India articleBody with
// no \n or \n\n anywhere). Splitting only on ". " would fragment ordinary
// sentences; splitting only at a hard paragraph boundary is impossible since
// none survived. The reliable signal that DOES survive is a period
// immediately followed by a capital letter with NO space — real prose
// always has a space after a sentence-ending period, so a missing space is
// exactly where an HTML <p> boundary most likely collapsed. This also
// matters for junk filtering: without splitting, a trailing boilerplate
// sentence (e.g. TOI's "You Can Also Check: ..." rate/weather link list)
// stays buried mid-string where isJunkParagraph's startsWith checks can
// never reach it; splitting isolates it into its own paragraph instead.
function splitArticleBodyIntoParagraphs(text: string): string[] {
  return text
    .split(/\.(?=[A-Z])/)
    .map((part, i, arr) => (i < arr.length - 1 ? part + "." : part))
    .map((part) => part.trim())
    .filter(Boolean);
}

function detectPaywall($: CheerioAPI): PaywallDetectionResult {
  const isPaywalled =
    PAYWALL_SELECTORS.some((selector) => $(selector).length > 0) ||
    hasPaywallMetaTag($) ||
    hasPaywallStructuredData($);

  if (!isPaywalled) return { isPaywalled: false };

  return {
    isPaywalled: true,
    ogTitle: $('meta[property="og:title"]').attr("content")?.trim(),
    ogDescription: $('meta[property="og:description"]').attr("content")?.trim(),
    ogImage: $('meta[property="og:image"]').attr("content")?.trim(),
  };
}

// Paragraphs that start with one of these are author bios, bylines, or
// site chrome that publishers wrap in the same <p> tags as real article
// text — cheerio can't tell them apart structurally, so filter by content.
const JUNK_START_PATTERNS = [
  "लेखक के बारे में",
  "लेखक:",
  "संपादक के बारे में",
  "रिपोर्टर के बारे में",
  "... और पढ़ें",
  "और पढ़ें",
  "about the author",
  "author:",
  "written by",
  "reporter:",
  "correspondent:",
  "editor's note:",
  "disclosure:",
  "read more:",
  "also read:",
  "tags:",
  "follow us",
  "subscribe to",
  "copyright",
  "© copyright", // "copyright" alone doesn't match when a leading © symbol precedes it — found via testing (starherald.com)
  "all rights reserved",

  // App-download / subscription prompts — Hindi
  "एप डाउनलोड करें",
  "ऐप डाउनलोड करें",
  "अमर उजाला एप",
  "अमर उजाला ऐप", // spelling variant (ऐ vs ए) not covered by "अमर उजाला एप" above — found via testing
  "hindi news app",
  "वीडियो विज्ञापन देखें",
  "वेबसाइट पर पढ़ना जारी रखें",
  "खबरें लगातार पढ़ने के लिए",
  "breaking news in hindi",
  "get all india news in hindi",
  "stay updated with us",
  "डाउनलोड करें android",
  "ios hindi news app",
  "और अधिक पढ़ें",
  "पूरी खबर पढ़ें",

  // App-download / subscription prompts — English
  "download our app",
  "subscribe to our newsletter",
  "follow us on", // already covered by "follow us" above (no "on") — kept for parity with the requested list
  "get the latest news",
  "read more at",
  "click here to read",

  // App-download / social prompts — Hindi (round 2)
  "ऐप डाउनलोड", // broader than "ऐप डाउनलोड करें" above — catches other verb forms
  "एप डाउनलोड", // broader than "एप डाउनलोड करें" above
  // Deliberately startsWith-only, not contains: "सोशल मीडिया" ("social
  // media") is common enough in genuine news prose (articles about social
  // media policy, platforms, trends) that a mid-paragraph contains-check
  // would filter real content, not just the "follow us on social media"
  // boilerplate this is meant to catch.
  "सोशल मीडिया",

  // App-download / social prompts — English (round 2)
  "follow the fresh indian express",
  "follow us on whatsapp", // textually distinct from "follow us on" above — kept for parity with the requested list
  "download the tne app",
  "download the app",
  "join our whatsapp",
  "follow our whatsapp channel",
  "get our newsletter",
  "join our telegram",
  "follow us on telegram", // textually distinct from "follow us on" above — kept for parity with the requested list
  "enable notifications",
  "get the latest news on whatsapp", // textually distinct from "get the latest news" above — kept for parity with the requested list
  "push notifications", // moved from JUNK_CONTAINS_PATTERNS — was matching mid-sentence in legitimate tech paragraphs (e.g. "...update now supports richer push notifications...")

  // Confirmed live (August 2026, 5/5 sampled TOI articles): a rate/weather/
  // AQI link-list boilerplate TOI appends to its JSON-LD articleBody field
  // specifically — only reachable via splitArticleBodyIntoParagraphs' JSON-LD
  // fallback path, since normal <p>-tag extraction never sees it merged in.
  "you can also check:",
];

// Substrings that flag junk anywhere in the paragraph, not just the start.
// "यह भी पढ़ें" / "इसे भी पढ़ें" ("also read this") and "अपने मोबाइल पे"
// ("on your mobile") are commonly embedded mid-paragraph as inline
// cross-links or app-download callouts on Hindi publisher sites, not
// necessarily leading a whole paragraph the way the start-patterns above do.
const JUNK_CONTAINS_PATTERNS = [
  "cookie",
  "rights reserved",
  "majority shareholder", // publisher-ownership boilerplate — found via testing (starherald.com: "A Lee Enterprises, Incorporated newspaper. Majority shareholder: ...")
  "यह भी पढ़ें",
  "इसे भी पढ़ें",
  "अपने मोबाइल पे",
  "व्हाट्सएप चैनल",
  "व्हाट्सऐप",
  "न्यूजलेटर सब्सक्राइब",
  "टेलीग्राम",
  "whatsapp channel",
  "telegram channel",
  "newsletter subscription",
  "subscribe to our channel",
];

// Author-bio sentences ("Currently has 10 years of experience in
// journalism...") rarely start with a fixed phrase, but reliably contain
// both halves of one of these pairs.
const BIO_PATTERN_PAIRS: [string, string][] = [
  ["वर्तमान में", "सालों का अनुभव"],
  ["पत्रकारिता में", "अनुभव"],
];

const SOCIAL_PROMPT_PATTERNS = ["follow on", "share on", "फॉलो करें", "शेयर करें", "follow on whatsapp"];

// Author-bio sentences that name the author ("Priya Sharma is a senior
// reporter at...") can't be caught by a literal substring the way
// BIO_PATTERN_PAIRS catches nameless bios — the name varies, only the
// surrounding shape is fixed. These run as real regex, not .includes().
const JUNK_REGEX_PATTERNS: RegExp[] = [
  /\bis\s+(a|the)\s+(senior\s+|chief\s+|principal\s+|staff\s+)?(reporter|correspondent|journalist|columnist|editor)\s+(at|for|with)\b/i,
  /\bcovers\s+.{0,40}\s+for\s+\S/i,
  /\bhas\s+been\s+(writing|reporting|covering)\s+.{0,40}\s+(for|since)\b/i,
  /\bfollow\s+\S+(\s+\S+)?\s+on\s+(twitter|instagram|facebook|linkedin)\b/i,
  // Hindi equivalents
  /वरिष्ठ\s+(पत्रकार|संवाददाता|लेखक|संपादक)\s+(हैं|है)/,
  /(ट्विटर|इंस्टाग्राम|फेसबुक)\s+पर\s+फॉलो\s+करें/,
];

const MIN_PARAGRAPH_LENGTH = 40;

function isJunkParagraph(text: string): boolean {
  if (text.length < MIN_PARAGRAPH_LENGTH) return true;

  const lower = text.toLowerCase();

  if (JUNK_START_PATTERNS.some((pattern) => lower.startsWith(pattern.toLowerCase()))) {
    return true;
  }

  if (JUNK_CONTAINS_PATTERNS.some((pattern) => lower.includes(pattern))) {
    return true;
  }

  if (BIO_PATTERN_PAIRS.some(([a, b]) => text.includes(a) && text.includes(b))) {
    return true;
  }

  if (SOCIAL_PROMPT_PATTERNS.some((pattern) => lower.includes(pattern.toLowerCase()))) {
    return true;
  }

  if (JUNK_REGEX_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  return false;
}

function cleanContent(paragraphs: string[]): string[] {
  return paragraphs.filter((text) => !isJunkParagraph(text));
}

// Caps total content at MAX_CONTENT_CHARS, cutting mid-paragraph if needed
// so an unusually long trailing bio can't slip through under the cap.
function truncateContent(paragraphs: string[], maxChars: number): string[] {
  const truncated: string[] = [];
  let total = 0;
  for (const paragraph of paragraphs) {
    if (total >= maxChars) break;
    const remaining = maxChars - total;
    if (paragraph.length > remaining) {
      truncated.push(paragraph.slice(0, remaining) + "...");
      break;
    }
    truncated.push(paragraph);
    total += paragraph.length;
  }
  return truncated;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get("url");

    if (!targetUrl) {
      return NextResponse.json(
        { error: "Missing required query parameter: url" },
        { status: 400 }
      );
    }

    const urlCheck = await validateExternalUrl(targetUrl);
    if (!urlCheck.ok) {
      return NextResponse.json(
        { error: `Invalid target URL: ${urlCheck.reason}` },
        { status: 400 }
      );
    }

    const cacheKey = `scrape:${targetUrl}`;

    // 1. Instant cache lookup
    const cached = await cache.get<ScrapeCacheEntry>(cacheKey);
    if (cached) {
      return NextResponse.json({
        url: targetUrl,
        title: cached.title,
        content: cached.content,
        text: cached.text,
        isPaywalled: cached.isPaywalled ?? false,
        description: cached.description,
        image: cached.image,
        cached: true,
      });
    }

    // 2. Fast Axios request with 2.5 second aggressive timeout
    const response = await axios.get(targetUrl, {
      timeout: 2500,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
    });

    const $ = cheerio.load(response.data);

    // Paywall check runs before any extraction — a locked page's body
    // isn't the article, so there's nothing worth running
    // removeNonContentNodes/paragraph-extraction on. Whatever OG metadata
    // survives outside the paywall is still returned, so the UI can show a
    // real title/description instead of a blank page.
    const paywall = detectPaywall($);
    if (paywall.isPaywalled) {
      const paywallTitle =
        paywall.ogTitle ||
        $("h1").first().text().trim() ||
        $("title").text().trim() ||
        "Article Details";
      const paywallDescription = paywall.ogDescription || "";
      const paywallImage = paywall.ogImage || "";

      await cache.set(
        cacheKey,
        {
          title: paywallTitle,
          content: [],
          text: "",
          isPaywalled: true,
          description: paywallDescription,
          image: paywallImage,
        },
        CACHE_TTL_SCRAPE_SECONDS
      );

      return NextResponse.json({
        url: targetUrl,
        title: paywallTitle,
        content: [],
        text: "",
        isPaywalled: true,
        description: paywallDescription,
        image: paywallImage,
      });
    }

    // Extract title
    const rawTitle =
      $("h1").first().text().trim() ||
      $("title").text().trim() ||
      "Article Details";
    const pageTitle = rawTitle;

    // Remove author-bio/nav/breadcrumb containers from the tree before
    // paragraph extraction — see removeNonContentNodes for why this runs
    // before the $("p").each() loop rather than after.
    removeNonContentNodes($);

    // Extract paragraphs. Junk-filtering runs on the raw scraped text.
    const LINK_DENSITY_THRESHOLD = 0.8;
    const rawParagraphs: string[] = [];
    $("p").each((_, element) => {
      const text = $(element).text().trim();
      if (!text) return;

      // Nav-like paragraph a selector above missed (e.g. a "related links"
      // list rendered as a <p> instead of a proper <nav>): mostly hyperlink
      // text isn't article content, regardless of what the words say.
      const linkText = $(element).find("a").text().trim();
      if (linkText.length / text.length >= LINK_DENSITY_THRESHOLD) return;

      rawParagraphs.push(text);
    });

    // Fallback for pages whose markup doesn't use plain <p> tags at all
    // (custom CMS block structure, JS-rendered content, AMP pages) — see
    // extractJsonLdArticleBody above for the live-data evidence behind this.
    // Only engaged when normal extraction found effectively nothing, so a
    // page that already works via $("p") is completely unaffected.
    if (rawParagraphs.length < 2) {
      const articleBody = extractJsonLdArticleBody($);
      if (articleBody) {
        rawParagraphs.push(...splitArticleBodyIntoParagraphs(articleBody));
      }
    }

    const cleanedParagraphs = cleanContent(rawParagraphs);
    const resultContent =
      cleanedParagraphs.length > 0
        ? truncateContent(cleanedParagraphs, MAX_CONTENT_CHARS)
        : ["Full article coverage is available at the publisher source."];
    const fullText = resultContent.join("\n\n");

    // Save to shared cache
    await cache.set(
      cacheKey,
      { title: pageTitle, content: resultContent, text: fullText, isPaywalled: false },
      CACHE_TTL_SCRAPE_SECONDS
    );

    // Save full article content to Supabase database asynchronously
    try {
      const { supabase, isSupabaseConfigured } = await import("@/server/supabase");
      if (isSupabaseConfigured() && targetUrl) {
        supabase
          .from("articles")
          .update({ content: fullText })
          .eq("link", targetUrl)
          .then();
      }
    } catch {
      // Ignore background save error
    }

    return NextResponse.json({
      url: targetUrl,
      title: pageTitle,
      content: resultContent,
      text: fullText || "Full article coverage.",
      isPaywalled: false,
    });
  } catch (error: unknown) {
    console.warn("Fast scrape fallback for:", error instanceof Error ? error.message : String(error));

    // Domain only — never send the full target URL (which may carry query
    // params / tracking IDs) to Sentry.
    const failedTargetUrl = new URL(request.url).searchParams.get("url");
    const isTimeout = axios.isAxiosError(error) && error.code === "ECONNABORTED";
    Sentry.captureException(error, {
      tags: { source: "scraper", failureType: isTimeout ? "timeout" : "parse_or_fetch" },
      extra: { targetDomain: failedTargetUrl ? urlToHostname(failedTargetUrl) : "unknown" },
    });

    return NextResponse.json({
      url: request.url,
      title: "Full Story Coverage",
      content: ["Full article coverage details for this report are available directly on the official publisher website below."],
      text: "Full story details.",
      isPaywalled: false,
    });
  }
}
