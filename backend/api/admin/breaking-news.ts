import "server-only";

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { supabase, isSupabaseConfigured } from "@/backend/lib/supabase";
import { ADMIN_ROUTE_RULES } from "@/backend/auth/adminRoutePolicy";
import { SITE_WIDE } from "@/backend/auth/scope";
import { auditUnavailable, beginAudit, finishAudit, requirePermission } from "@/backend/auth/requirePermission";

// The breaking_news table and its RLS policies: database/schema.sql and database/policies.sql (F-008).

// GET is deliberately public: the homepage banner has no admin session (CR-08), and it is on the
// public allowlist (PUBLIC_ADMIN_ROUTES, D10) that proxy.ts reads. POST and DELETE pass
// requirePermission, the only gate on this path (service_role bypasses RLS; Panel 0): they need
// breaking_banner.manage for the whole site, which only an unscoped grant covers.
const RULES = ADMIN_ROUTE_RULES["/api/admin/breaking-news"];

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
  const gate = await requirePermission(request, RULES.POST, SITE_WIDE);
  if (!gate.ok) return gate.response;
  const actor = gate.actor;

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

    const entry = { action: "breaking_banner.set", entityType: "breaking_news", entityId: "new", after: { text, expires_at: expiresAt } };
    const attempt = await beginAudit(actor, entry);
    if (!attempt) return auditUnavailable();

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
      await finishAudit(actor, attempt, "failed", { ...entry, reason: error.message });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const item = data as BreakingNewsItem;
    await finishAudit(actor, attempt, "succeeded", { ...entry, entityId: item.id });

    return NextResponse.json({ success: true, item });
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
  const gate = await requirePermission(request, RULES.DELETE, SITE_WIDE);
  if (!gate.ok) return gate.response;
  const actor = gate.actor;

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

    const entry = { action: "breaking_banner.remove", entityType: "breaking_news", entityId: id, after: { is_active: false } };
    const attempt = await beginAudit(actor, entry);
    if (!attempt) return auditUnavailable();

    const { error } = await supabase.from("breaking_news").update({ is_active: false }).eq("id", id);

    if (error) {
      console.error("Breaking news remove error:", error.message);
      Sentry.captureMessage(`Breaking news remove error: ${error.message}`, {
        tags: { source: "supabase" },
        extra: { operation: "removeBreakingNews", id },
      });
      await finishAudit(actor, attempt, "failed", { ...entry, reason: error.message });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await finishAudit(actor, attempt, "succeeded", entry);

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
