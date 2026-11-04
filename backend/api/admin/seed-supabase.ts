import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { saveArticlesToDB } from "@/backend/services/news";
import { ADMIN_ROUTE_RULES } from "@/backend/auth/adminRoutePolicy";
import { SITE_WIDE } from "@/backend/auth/scope";
import { auditUnavailable, beginAudit, finishAudit, requirePermission } from "@/backend/auth/requirePermission";
import type { NewsDataRawArticle } from "@/backend/shared/types";

// Gated by requirePermission, the only gate on this path (service_role bypasses RLS; Panel 0):
// sync.run for the whole site. The sync is audited as attempted, then its outcome.
const RULE = ADMIN_ROUTE_RULES["/api/admin/seed-supabase"].POST;

const CATEGORIES = ["top", "technology", "business", "sports", "entertainment", "health", "science"];

export async function POST(request: NextRequest) {
  const gate = await requirePermission(request, RULE, SITE_WIDE);
  if (!gate.ok) return gate.response;
  const actor = gate.actor;

  try {
    // Server-side name only (BL-029): a NEXT_PUBLIC_ name is inlined into any client bundle that reads it.
    const apiKey = process.env.NEWSDATA_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { status: "error", message: "NEWSDATA_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    const entry = { action: "sync.run", entityType: "sync", entityId: "all-categories", after: { categories: CATEGORIES } };
    const attempt = await beginAudit(actor, entry);
    if (!attempt) return auditUnavailable();

    let totalSaved = 0;

    for (const cat of CATEGORIES) {
      try {
        const url = `https://newsdata.io/api/1/latest?apikey=${apiKey}&category=${cat}&language=en`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) continue;

        const data = await res.json();
        const articles = (data.results || []).map((art: NewsDataRawArticle) => ({
          article_id: art.article_id || art.link,
          title: art.title || "Untitled News",
          link: art.link || "#",
          description: art.description || "",
          content: art.content || art.description || "",
          pubDate: art.pubDate || new Date().toISOString(),
          image_url: art.image_url || art.source_icon || null,
          source_id: art.source_id || "",
          source_name: art.source_name || "News Source",
          category: art.category || [cat],
          country: art.country || ["us"],
          language: art.language || "english",
        }));

        const saved = await saveArticlesToDB(articles);
        totalSaved += saved.length;
      } catch (e) {
        // Continue loop for other categories
      }
    }

    await finishAudit(actor, attempt, "succeeded", { ...entry, after: { categories: CATEGORIES, total_articles: totalSaved } });

    return NextResponse.json({
      status: "success",
      message: `Full news categories successfully synchronized to Supabase!`,
      totalArticlesProcessed: totalSaved,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { status: "error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
