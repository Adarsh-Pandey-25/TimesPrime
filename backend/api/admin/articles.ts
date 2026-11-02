import "server-only";

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { supabase, isSupabaseConfigured } from "@/backend/lib/supabase";
import { containsPattern } from "@/backend/lib/likePattern";
import { ADMIN_ROUTE_RULES } from "@/backend/auth/adminRoutePolicy";
import { ANY_SCOPE } from "@/backend/auth/decide";
import { articleScope } from "@/backend/auth/scope";
import { auditUnavailable, beginAudit, finishAudit, requirePermission, requireTarget } from "@/backend/auth/requirePermission";

// Each handler passes requirePermission first: the only gate on this path, because the Supabase
// client here is service_role and bypasses RLS (Panel 0). The proxy's check is optimistic. A change
// checks the article's own scope (language, category[0]; ADR 0003) once the article is loaded, and
// is audited as attempted, then its outcome; if the attempt cannot be recorded, nothing changes.
const RULES = ADMIN_ROUTE_RULES["/api/admin/articles"];

/** The columns a change reads first: its scope, and the before-values for the audit row. */
const CURRENT_COLUMNS = "article_id, title, description, image_url, source_name, category, language";

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
 * Needs article.view_admin in any scope; articles are public data, and the desk filter is Panel 2.
 */
export async function GET(request: NextRequest) {
  const gate = await requirePermission(request, RULES.GET);
  if (!gate.ok) return gate.response;

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
      // Escaped like the feed search (F-006): % _ \ in the term are literal, * is dropped.
      query = query.ilike("title", containsPattern(search));
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

type CurrentArticle = Pick<AdminArticleRow, "article_id" | "title" | "description" | "image_url" | "source_name" | "category" | "language">;

/** The article a change targets, or a response that ends the request (404, or 500 on a read error). */
async function loadCurrent(articleId: string): Promise<{ row: CurrentArticle } | { response: NextResponse }> {
  const { data, error } = await supabase.from("articles").select(CURRENT_COLUMNS).eq("article_id", articleId).maybeSingle();
  if (error) {
    console.error("Admin article read error:", error.message);
    return { response: NextResponse.json({ error: error.message }, { status: 500 }) };
  }
  if (!data) return { response: NextResponse.json({ error: "Article not found." }, { status: 404 }) };
  return { row: data as CurrentArticle };
}

/**
 * Deletes a single article by article_id (not the row's UUID). Body:
 * { article_id: string }. Returns { success: true, deleted: article_id }.
 * Needs article.unpublish in the article's scope. An unknown article_id is 404: there is no scope
 * to check it against (before Panel 0 it answered success and deleted nothing).
 */
export async function DELETE(request: NextRequest) {
  const gate = await requirePermission(request, RULES.DELETE, ANY_SCOPE);
  if (!gate.ok) return gate.response;
  const actor = gate.actor;

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

    const current = await loadCurrent(articleId);
    if ("response" in current) return current.response;
    const target = articleScope(current.row);
    const scoped = await requireTarget(actor, RULES.DELETE, target);
    if (!scoped.ok) return scoped.response;

    const entry = {
      action: "article.unpublish",
      entityType: "article",
      entityId: articleId,
      target,
      before: { title: current.row.title, language: current.row.language, category: current.row.category },
    };
    const attempt = await beginAudit(actor, entry);
    if (!attempt) return auditUnavailable();

    const { error } = await supabase.from("articles").delete().eq("article_id", articleId);

    if (error) {
      console.error("Admin article delete error:", error.message);
      Sentry.captureMessage(`Admin article delete error: ${error.message}`, {
        tags: { source: "supabase" },
        extra: { operation: "deleteArticle", articleId },
      });
      await finishAudit(actor, attempt, "failed", { ...entry, reason: error.message });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await finishAudit(actor, attempt, "succeeded", entry);

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
 * Needs article.edit in the article's scope; an edit that moves the article to another language or
 * first category needs it in the new scope as well (ADR 0003), so no one moves an article in or
 * out of a desk they do not hold.
 */
export async function PATCH(request: NextRequest) {
  const gate = await requirePermission(request, RULES.PATCH, ANY_SCOPE);
  if (!gate.ok) return gate.response;
  const actor = gate.actor;

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

    const current = await loadCurrent(articleId);
    if ("response" in current) return current.response;
    const target = articleScope(current.row);
    const scoped = await requireTarget(actor, RULES.PATCH, target);
    if (!scoped.ok) return scoped.response;
    const moved = articleScope({ language: updates.language ?? current.row.language, category: updates.category ?? current.row.category });
    if (moved.language !== target.language || moved.section !== target.section) {
      const into = await requireTarget(actor, RULES.PATCH, moved);
      if (!into.ok) return into.response;
    }

    const fields = Object.keys(updates) as Array<keyof ArticleUpdateFields>;
    const entry = {
      action: "article.edit",
      entityType: "article",
      entityId: articleId,
      target,
      before: Object.fromEntries(fields.map((f) => [f, current.row[f]])),
      after: { ...updates },
    };
    const attempt = await beginAudit(actor, entry);
    if (!attempt) return auditUnavailable();

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
      await finishAudit(actor, attempt, "failed", { ...entry, reason: error.message });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await finishAudit(actor, attempt, "succeeded", entry);

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
