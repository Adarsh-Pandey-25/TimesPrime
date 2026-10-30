import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { supabase, isSupabaseConfigured } from "@/server/supabase";
import { logAdminAction } from "@/server/auditLog";

// ---------------------------------------------------------------------
// SETUP REQUIRED — this file does not create the table itself. Run this
// once in the Supabase SQL editor before this route will work:
//
// CREATE TABLE IF NOT EXISTS public.breaking_news (
//   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//   text TEXT NOT NULL,
//   is_active BOOLEAN DEFAULT true,
//   expires_at TIMESTAMP WITH TIME ZONE,
//   created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
// );
//
// ALTER TABLE public.breaking_news ENABLE ROW LEVEL SECURITY;
//
// CREATE POLICY "Public read access" ON public.breaking_news
//   FOR SELECT TO anon, authenticated USING (true);
// CREATE POLICY "Service role full access" ON public.breaking_news
//   FOR ALL TO service_role USING (true) WITH CHECK (true);
//
// GRANT SELECT ON public.breaking_news TO anon, authenticated;
// GRANT ALL ON public.breaking_news TO service_role;
// ---------------------------------------------------------------------

// GET is deliberately public — proxy.ts special-cases this exact path
// for the GET method only, since the homepage banner has no admin session.
// POST/DELETE stay behind the normal admin session gate like every other
// /api/admin/* route (no per-route check needed here, same convention as
// db-stats/seed-supabase/publish-article/articles).

const MAX_TEXT_LENGTH = 500;

interface BreakingNewsItem {
  id: string;
  text: string;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

/**
 * Public: active, unexpired breaking news items, newest first. Returns
 * { items: BreakingNewsItem[] }.
 */
export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Supabase is not configured on the server." },
        { status: 503 }
      );
    }

    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("breaking_news")
      .select("id, text, is_active, expires_at, created_at")
      .eq("is_active", true)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Breaking news list error:", error.message);
      Sentry.captureMessage(`Breaking news list error: ${error.message}`, {
        tags: { source: "supabase" },
        extra: { operation: "listBreakingNews" },
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: (data ?? []) as BreakingNewsItem[] });
  } catch (err) {
    console.error("Breaking news list error:", err);
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "listBreakingNews" } });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch breaking news." },
      { status: 500 }
    );
  }
}

interface PostBreakingNewsBody {
  text?: unknown;
  expires_in_hours?: unknown;
}

/**
 * Admin: creates a new active breaking news item. Body:
 * { text: string, expires_in_hours: number | null }. Returns
 * { success: true, item }.
 */
export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Supabase is not configured on the server." },
        { status: 503 }
      );
    }

    let body: PostBreakingNewsBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
      return NextResponse.json({ error: "text is required." }, { status: 400 });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `text must be ${MAX_TEXT_LENGTH} characters or fewer.` },
        { status: 400 }
      );
    }

    let expiresAt: string | null = null;
    const expiresInHours = body.expires_in_hours;
    if (expiresInHours !== null && expiresInHours !== undefined) {
      const hours = Number(expiresInHours);
      if (!Number.isFinite(hours) || hours <= 0) {
        return NextResponse.json(
          { error: "expires_in_hours must be a positive number or null." },
          { status: 400 }
        );
      }
      expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    }

    const { data, error } = await supabase
      .from("breaking_news")
      .insert([{ text, is_active: true, expires_at: expiresAt }])
      .select("id, text, is_active, expires_at, created_at")
      .single();

    if (error) {
      console.error("Breaking news create error:", error.message);
      Sentry.captureMessage(`Breaking news create error: ${error.message}`, {
        tags: { source: "supabase" },
        extra: { operation: "createBreakingNews" },
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logAdminAction("breaking_news_set", `Set breaking news: ${text.slice(0, 50)}`, { expires_at: expiresAt });

    return NextResponse.json({ success: true, item: data as BreakingNewsItem });
  } catch (err) {
    console.error("Breaking news create error:", err);
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "createBreakingNews" } });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create breaking news." },
      { status: 500 }
    );
  }
}

/**
 * Admin: soft-deletes a breaking news item (sets is_active = false, never
 * hard-deletes). Body: { id: string }. Returns { success: true }.
 */
export async function DELETE(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Supabase is not configured on the server." },
        { status: 503 }
      );
    }

    let id: unknown;
    try {
      const body = await request.json();
      id = body?.id;
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    if (typeof id !== "string" || !id.trim()) {
      return NextResponse.json({ error: "id is required." }, { status: 400 });
    }

    const { error } = await supabase.from("breaking_news").update({ is_active: false }).eq("id", id);

    if (error) {
      console.error("Breaking news remove error:", error.message);
      Sentry.captureMessage(`Breaking news remove error: ${error.message}`, {
        tags: { source: "supabase" },
        extra: { operation: "removeBreakingNews", id },
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logAdminAction("breaking_news_removed", `Removed breaking news: ${id}`, { id });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Breaking news remove error:", err);
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "removeBreakingNews" } });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove breaking news." },
      { status: 500 }
    );
  }
}
