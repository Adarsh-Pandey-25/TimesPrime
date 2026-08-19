import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";
import * as Sentry from "@sentry/nextjs";
import { paraphraseTitle, paraphraseText } from "@/lib/paraphraser";
import { validateExternalUrl } from "@/lib/urlValidation";
import { cache, CACHE_TTL_SCRAPE_SECONDS } from "@/lib/cache";
import { urlToHostname } from "@/lib/sentryScrub";

interface ScrapeCacheEntry {
  title: string;
  content: string[];
  text: string;
}

const MAX_CONTENT_CHARS = 5000;

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
  "all rights reserved",
];

// Substrings that flag junk anywhere in the paragraph, not just the start.
const JUNK_CONTAINS_PATTERNS = ["cookie", "rights reserved"];

// Author-bio sentences ("Currently has 10 years of experience in
// journalism...") rarely start with a fixed phrase, but reliably contain
// both halves of one of these pairs.
const BIO_PATTERN_PAIRS: [string, string][] = [
  ["वर्तमान में", "सालों का अनुभव"],
  ["पत्रकारिता में", "अनुभव"],
];

const SOCIAL_PROMPT_PATTERNS = ["follow on", "share on", "फॉलो करें"];

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

    // Extract title
    const rawTitle =
      $("h1").first().text().trim() ||
      $("title").text().trim() ||
      "Article Details";
    const pageTitle = paraphraseTitle(rawTitle);

    // Extract paragraphs. Junk-filtering runs on the raw scraped text
    // (before paraphraseText) so a bio's rewording can't dodge a
    // start-pattern match that the original text would have hit.
    const rawParagraphs: string[] = [];
    $("p").each((_, element) => {
      const text = $(element).text().trim();
      if (text) {
        rawParagraphs.push(text);
      }
    });

    const cleanedParagraphs = cleanContent(rawParagraphs).map((text) => paraphraseText(text));
    const resultContent =
      cleanedParagraphs.length > 0
        ? truncateContent(cleanedParagraphs, MAX_CONTENT_CHARS)
        : ["Full article coverage is available at the publisher source."];
    const fullText = resultContent.join("\n\n");

    // Save to shared cache
    await cache.set(
      cacheKey,
      { title: pageTitle, content: resultContent, text: fullText },
      CACHE_TTL_SCRAPE_SECONDS
    );

    // Save full article content to Supabase database asynchronously
    try {
      const { supabase, isSupabaseConfigured } = await import("@/lib/supabase");
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
    });
  } catch (error: any) {
    console.warn("Fast scrape fallback for:", error.message);

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
    });
  }
}
