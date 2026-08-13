import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";
import { paraphraseTitle, paraphraseText } from "@/lib/paraphraser";

// In-memory scraping cache for 0ms instantaneous article loading
const scrapeCache = new Map<string, { title: string; content: string[]; text: string; timestamp: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour in-memory cache

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

    // 1. Instant 0ms cache lookup
    const cached = scrapeCache.get(targetUrl);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
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

    // Extract paragraphs
    const paragraphs: string[] = [];
    $("p").each((_, element) => {
      const text = $(element).text().trim();
      if (text.length >= 35 && !text.toLowerCase().includes("cookie") && !text.toLowerCase().includes("rights reserved")) {
        paragraphs.push(paraphraseText(text));
      }
    });

    const fullText = paragraphs.join("\n\n");
    const resultContent = paragraphs.length > 0 ? paragraphs : ["Full article coverage is available at the publisher source."];

    // Save to 0ms instant cache
    scrapeCache.set(targetUrl, {
      title: pageTitle,
      content: resultContent,
      text: fullText,
      timestamp: Date.now(),
    });

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
    return NextResponse.json({
      url: request.url,
      title: "Full Story Coverage",
      content: ["Full article coverage details for this report are available directly on the official publisher website below."],
      text: "Full story details.",
    });
  }
}
