import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { supabase, isSupabaseConfigured } from "@/server/supabase";
import { logAdminAction } from "@/server/auditLog";

// Auth is handled upstream by proxy.ts (matcher covers /api/admin/:path*),
// so by the time a request reaches this handler it has already been validated.

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

interface AdminArticleRow {
  id: string;
  article_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  link: string | null;
  source_name: string | null;
  category: string[] | null;
  language: string | null;
  created_at: string;
}

// The country column stores full lowercase country names (verified against
// live data — "india", "united states of america", "china", ...), not
// ISO codes, so a 2-letter code from the client has to be translated
// before it can match anything via .contains(). Codes not in this map are
// passed through as-is, on the chance a caller already has the real
// stored value handy.
const COUNTRY_CODE_TO_STORED_NAME: Record<string, string> = {
  in: "india",
  us: "united states of america",
  gb: "united kingdom",
  au: "australia",
  ca: "canada",
};

/**
 * Paginated, filterable list of stored articles for the admin dashboard.
 * Query params: page (default 1), limit (default 20, capped at 100),
 * category (TEXT[] contains-match, "general" means no filter), country
 * (TEXT[] contains-match — 2-letter code like "in", translated to the
 * stored country name via COUNTRY_CODE_TO_STORED_NAME), search (title
 * ilike). Returns { articles, total, page, totalPages }.
 */
export async function GET(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Supabase is not configured on the server." },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(searchParams.get("limit")) || DEFAULT_LIMIT));
    const category = searchParams.get("category")?.trim() || "";
    const country = searchParams.get("country")?.trim().toLowerCase() || "";
    const search = searchParams.get("search")?.trim() || "";

    let query = supabase
      .from("articles")
      .select(
        "id, article_id, title, description, image_url, link, source_name, category, language, created_at",
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (category && category !== "general") {
      query = query.contains("category", [category]);
    }
    if (country) {
      query = query.contains("country", [COUNTRY_CODE_TO_STORED_NAME[country] || country]);
    }
    if (search) {
      query = query.ilike("title", `%${search}%`);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data, error, count } = await query.range(from, to);

    if (error) {
      console.error("Admin articles list error:", error.message);
      Sentry.captureMessage(`Admin articles list error: ${error.message}`, {
        tags: { source: "supabase" },
        extra: { operation: "listArticles", page, limit, category, country, search },
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return NextResponse.json({
      articles: (data ?? []) as AdminArticleRow[],
      total,
      page,
      totalPages,
    });
  } catch (err) {
    console.error("Admin articles list error:", err);
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "listArticles" } });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch articles." },
      { status: 500 }
    );
  }
}

/**
 * Deletes a single article by article_id (not the row's UUID). Body:
 * { article_id: string }. Returns { success: true, deleted: article_id }.
 */
export async function DELETE(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Supabase is not configured on the server." },
        { status: 503 }
      );
    }

    let articleId: unknown;
    try {
      const body = await request.json();
      articleId = body?.article_id;
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    if (typeof articleId !== "string" || !articleId.trim()) {
      return NextResponse.json({ error: "article_id is required." }, { status: 400 });
    }

    const { error } = await supabase.from("articles").delete().eq("article_id", articleId);

    if (error) {
      console.error("Admin article delete error:", error.message);
      Sentry.captureMessage(`Admin article delete error: ${error.message}`, {
        tags: { source: "supabase" },
        extra: { operation: "deleteArticle", articleId },
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logAdminAction("article_deleted", `Deleted article: ${articleId}`, { article_id: articleId });

    return NextResponse.json({ success: true, deleted: articleId });
  } catch (err) {
    console.error("Admin article delete error:", err);
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "deleteArticle" } });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete article." },
      { status: 500 }
    );
  }
}

interface PatchArticleBody {
  article_id?: unknown;
  title?: unknown;
  description?: unknown;
  image_url?: unknown;
  source_name?: unknown;
  category?: unknown;
  language?: unknown;
}

type ArticleUpdateFields = Partial<
  Pick<AdminArticleRow, "title" | "description" | "image_url" | "source_name" | "category" | "language">
>;

/**
 * Partially updates one article by article_id. Body:
 * { article_id, title?, description?, image_url?, source_name?, category?, language? } —
 * only the fields present in the body are written. Returns
 * { success: true, article }.
 */
export async function PATCH(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Supabase is not configured on the server." },
        { status: 503 }
      );
    }

    let body: PatchArticleBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const articleId = body.article_id;
    if (typeof articleId !== "string" || !articleId.trim()) {
      return NextResponse.json({ error: "article_id is required." }, { status: 400 });
    }

    const updates: ArticleUpdateFields = {};
    if (typeof body.title === "string") updates.title = body.title;
    if (typeof body.description === "string") updates.description = body.description;
    if (typeof body.image_url === "string") updates.image_url = body.image_url;
    if (typeof body.source_name === "string") updates.source_name = body.source_name;
    if (typeof body.language === "string") updates.language = body.language;
    if (Array.isArray(body.category) && body.category.every((c): c is string => typeof c === "string")) {
      updates.category = body.category;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("articles")
      .update(updates)
      .eq("article_id", articleId)
      .select("id, article_id, title, description, image_url, link, source_name, category, language, created_at")
      .single();

    if (error) {
      console.error("Admin article update error:", error.message);
      Sentry.captureMessage(`Admin article update error: ${error.message}`, {
        tags: { source: "supabase" },
        extra: { operation: "updateArticle", articleId },
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logAdminAction("article_edited", `Edited article: ${articleId}`, {
      article_id: articleId,
      fields: Object.keys(updates),
    });

    return NextResponse.json({ success: true, article: data as AdminArticleRow });
  } catch (err) {
    console.error("Admin article update error:", err);
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "updateArticle" } });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update article." },
      { status: 500 }
    );
  }
}
