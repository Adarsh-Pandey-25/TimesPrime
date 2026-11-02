import "server-only";

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { supabase, isSupabaseConfigured } from "@/backend/lib/supabase";
import { ADMIN_ROUTE_RULES } from "@/backend/auth/adminRoutePolicy";
import { ANY_SCOPE } from "@/backend/auth/decide";
import { articleScope } from "@/backend/auth/scope";
import { auditUnavailable, beginAudit, finishAudit, requirePermission, requireTarget } from "@/backend/auth/requirePermission";

// Gated by requirePermission, the only gate on this path (service_role bypasses RLS; Panel 0).
// Needs article.bulk_action and article.unpublish, both in the scope of EVERY article named: one
// article outside the caller's scope refuses the whole request, so a bulk delete cannot reach
// further than single deletes would.
const RULE = ADMIN_ROUTE_RULES["/api/admin/articles/bulk"].DELETE;

const MAX_BULK_DELETE = 100;

/**
 * Deletes multiple articles by article_id in one request. Body:
 * { article_ids: string[] }, capped at MAX_BULK_DELETE per call. Returns
 * { success: true, deleted: number }.
 */
export async function DELETE(request: NextRequest) {
  const gate = await requirePermission(request, RULE, ANY_SCOPE);
  if (!gate.ok) return gate.response;
  const actor = gate.actor;

  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Supabase is not configured on the server." },
        { status: 503 }
      );
    }

    let articleIds: unknown;
    try {
      const body = await request.json();
      articleIds = body?.article_ids;
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    if (!Array.isArray(articleIds) || articleIds.length === 0) {
      return NextResponse.json({ error: "article_ids must be a non-empty array." }, { status: 400 });
    }

    if (articleIds.length > MAX_BULK_DELETE) {
      return NextResponse.json(
        { error: `Cannot delete more than ${MAX_BULK_DELETE} articles at once.` },
        { status: 400 }
      );
    }

    if (!articleIds.every((id): id is string => typeof id === "string" && id.trim().length > 0)) {
      return NextResponse.json({ error: "article_ids must all be non-empty strings." }, { status: 400 });
    }

    // Every named article that exists is checked against the caller's scope. Unknown ids are left
    // alone, as before: the delete simply matches nothing for them.
    const found = await supabase.from("articles").select("article_id, title, language, category").in("article_id", articleIds);
    if (found.error) {
      console.error("Admin bulk article read error:", found.error.message);
      return NextResponse.json({ error: found.error.message }, { status: 500 });
    }
    const rows = (found.data ?? []) as Array<{ article_id: string; title: string; language: string | null; category: string[] | null }>;
    for (const row of rows) {
      const scoped = await requireTarget(actor, RULE, articleScope(row));
      if (!scoped.ok) return scoped.response;
    }

    // One audit pair for the request, naming every article: a hundred rows each way would hold the
    // chain's lock for seconds.
    const entry = {
      action: "article.bulk_action",
      entityType: "articles",
      entityId: `${rows.length} articles`,
      before: { article_ids: rows.map((r) => r.article_id), titles: rows.map((r) => r.title) },
    };
    const attempt = await beginAudit(actor, entry);
    if (!attempt) return auditUnavailable();

    const { data, error } = await supabase
      .from("articles")
      .delete()
      .in("article_id", articleIds)
      .select("article_id");

    if (error) {
      console.error("Admin bulk article delete error:", error.message);
      Sentry.captureMessage(`Admin bulk article delete error: ${error.message}`, {
        tags: { source: "supabase" },
        extra: { operation: "bulkDeleteArticles", requestedCount: articleIds.length },
      });
      await finishAudit(actor, attempt, "failed", { ...entry, reason: error.message });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const deletedIds = (data ?? []).map((row) => row.article_id);

    await finishAudit(actor, attempt, "succeeded", { ...entry, after: { deleted: deletedIds } });

    return NextResponse.json({ success: true, deleted: deletedIds.length });
  } catch (err) {
    console.error("Admin bulk article delete error:", err);
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "bulkDeleteArticles" } });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete selected articles." },
      { status: 500 }
    );
  }
}
