import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { supabase, isSupabaseConfigured } from "@/backend/lib/supabase";
import { logAdminAction } from "@/server/auditLog";

// Auth is handled upstream by proxy.ts (matcher covers /api/admin/:path*),
// so by the time a request reaches this handler it has already been validated.

const MAX_BULK_DELETE = 100;

/**
 * Deletes multiple articles by article_id in one request. Body:
 * { article_ids: string[] }, capped at MAX_BULK_DELETE per call. Returns
 * { success: true, deleted: number }.
 */
export async function DELETE(request: NextRequest) {
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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const deletedIds = (data ?? []).map((row) => row.article_id);

    await logAdminAction("articles_bulk_deleted", `Bulk deleted ${deletedIds.length} articles`, {
      count: deletedIds.length,
      article_ids: deletedIds,
    });

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
