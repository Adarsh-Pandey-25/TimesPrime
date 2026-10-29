import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { AdminLog } from "@/types";

// ---------------------------------------------------------------------
// SETUP REQUIRED — this file does not create the table itself. Run this
// once in the Supabase SQL editor before this route will work:
//
// CREATE TABLE IF NOT EXISTS public.admin_logs (
//   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//   action TEXT NOT NULL,
//   details TEXT,
//   metadata JSONB DEFAULT '{}',
//   created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
// );
//
// ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;
//
// CREATE POLICY "Service role full access" ON public.admin_logs
//   FOR ALL TO service_role USING (true) WITH CHECK (true);
//
// GRANT ALL ON public.admin_logs TO service_role;
// ---------------------------------------------------------------------

// Auth is handled upstream by src/proxy.ts (matcher covers /api/admin/:path*),
// so by the time a request reaches this handler it has already been validated.

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Paginated admin activity log, newest first. Query params: page (default
 * 1), limit (default 20, capped at 100). Returns
 * { logs, total, page, totalPages }.
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

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from("admin_logs")
      .select("id, action, details, metadata, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("Admin logs list error:", error.message);
      Sentry.captureMessage(`Admin logs list error: ${error.message}`, {
        tags: { source: "supabase" },
        extra: { operation: "listAdminLogs", page, limit },
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return NextResponse.json({
      logs: (data ?? []) as AdminLog[],
      total,
      page,
      totalPages,
    });
  } catch (err) {
    console.error("Admin logs list error:", err);
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "listAdminLogs" } });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch activity logs." },
      { status: 500 }
    );
  }
}

/**
 * Clears the entire activity log (hard delete — there's no soft-delete
 * concept here; the log row IS the record, not a reference to some other
 * still-existing content). Returns { success: true, deleted: number }.
 */
export async function DELETE() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Supabase is not configured on the server." },
        { status: 503 }
      );
    }

    // PostgREST requires a filter on delete even when the intent is "all
    // rows" — id is a NOT NULL primary key, so this matches every row.
    const { data, error } = await supabase.from("admin_logs").delete().not("id", "is", null).select("id");

    if (error) {
      console.error("Admin logs clear error:", error.message);
      Sentry.captureMessage(`Admin logs clear error: ${error.message}`, {
        tags: { source: "supabase" },
        extra: { operation: "clearAdminLogs" },
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deleted: (data ?? []).length });
  } catch (err) {
    console.error("Admin logs clear error:", err);
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "clearAdminLogs" } });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to clear activity logs." },
      { status: 500 }
    );
  }
}
