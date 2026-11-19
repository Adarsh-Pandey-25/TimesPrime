import "server-only";

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { supabase, isSupabaseConfigured } from "@timesprime/server/lib/supabase";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { ANY_SCOPE } from "@timesprime/server/auth/decide";
import { SITE_WIDE, type Target } from "@timesprime/server/auth/scope";
import { auditUnavailable, beginAudit, finishAudit, requirePermission, requireTarget } from "@timesprime/server/auth/requirePermission";
import { listActiveBreakingNews, type BreakingNewsItem } from "@timesprime/server/services/news/breakingNews";
import { isBannerLanguage, type BannerLanguage } from "@timesprime/shared/config/breakingNews";

// The breaking_news table and its RLS policies: database/schema.sql and database/policies.sql (F-008);
// its language: database/migrations/2026-11-19-front-1-banner-language.sql (Panel 3, M1).

// Every method passes requirePermission, the only gate on this path (service_role bypasses RLS;
// Panel 0). GET is the banner manager's list and needs breaking_banner.manage in any scope; the
// homepage banner's public read is on the reader site (apps/web, GET /api/news/breaking-news).
// POST and DELETE need breaking_banner.manage in the item's language (Panel 3 design §3): a Desk
// Editor sets and removes their own language's items; an item for both languages is site-wide, so
// only an unscoped grant covers it (question 4). The gate first asks for the permission in any
// scope, then again for the item's own scope once it is known.
const RULES = ADMIN_ROUTE_RULES["/api/admin/breaking-news"];

const MAX_TEXT_LENGTH = 500;

/** The scope an item is decided in: its language and every section, or the whole site for both. */
const bannerScope = (language: BannerLanguage | null): Target => (language ? { language, section: null } : SITE_WIDE);

/** Active, unexpired breaking news items, newest first, in every language. Returns { items }. */
export async function GET(request: NextRequest) {
  const gate = await requirePermission(request, RULES.GET);
  if (!gate.ok) return gate.response;

  const { status, body } = await listActiveBreakingNews();
  return NextResponse.json(body, { status });
}

interface PostBreakingNewsBody {
  text?: unknown;
  expires_in_hours?: unknown;
  language?: unknown;
}

/**
 * Admin: creates a new active breaking news item. Body:
 * { text: string, expires_in_hours: number | null, language: "en" | "hi" | null }. A missing
 * language is null: both languages. Returns { success: true, item }.
 */
export async function POST(request: NextRequest) {
  const gate = await requirePermission(request, RULES.POST, ANY_SCOPE);
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

    if (body.language !== undefined && body.language !== null && !isBannerLanguage(body.language)) {
      return NextResponse.json({ error: 'language must be "en", "hi" or null (both languages).' }, { status: 400 });
    }
    const language: BannerLanguage | null = isBannerLanguage(body.language) ? body.language : null;

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

    const target = bannerScope(language);
    const scoped = await requireTarget(actor, RULES.POST, target);
    if (!scoped.ok) return scoped.response;

    const entry = {
      action: "breaking_banner.set",
      entityType: "breaking_news",
      entityId: "new",
      target,
      after: { text, expires_at: expiresAt, language },
    };
    const attempt = await beginAudit(actor, entry);
    if (!attempt) return auditUnavailable();

    // An item for both languages leaves the column out, so it can still be set before the owner
    // applies front-1; one language needs the column.
    const { data, error } = await supabase
      .from("breaking_news")
      .insert([{ text, is_active: true, expires_at: expiresAt, ...(language ? { language } : {}) }])
      .select(language ? "id, text, is_active, expires_at, created_at, language" : "id, text, is_active, expires_at, created_at")
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

    const item = { ...(data as unknown as BreakingNewsItem), language };
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
 * Admin: soft-deletes a breaking news item (sets is_active = false, never hard-deletes), in the
 * item's own scope. Body: { id: string }. An unknown id is 404: there is no scope to check it
 * against. Returns { success: true }.
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

    // The item's language decides who may remove it. Before front-1 there is no column: every item
    // is for both languages.
    let found = await supabase.from("breaking_news").select("id, text, language").eq("id", id).maybeSingle();
    if (found.error && (found.error as { code?: string }).code === "42703") {
      found = (await supabase.from("breaking_news").select("id, text").eq("id", id).maybeSingle()) as typeof found;
    }
    if (found.error) {
      Sentry.captureMessage(`Breaking news read error: ${found.error.message}`, { tags: { source: "supabase" }, extra: { operation: "removeBreakingNews", id } });
      return NextResponse.json({ error: found.error.message }, { status: 500 });
    }
    if (!found.data) {
      return NextResponse.json({ error: "Breaking news item not found." }, { status: 404 });
    }
    const current = found.data as { id: string; text: string; language?: string | null };
    const language = isBannerLanguage(current.language) ? current.language : null;

    const target = bannerScope(language);
    const scoped = await requireTarget(actor, RULES.DELETE, target);
    if (!scoped.ok) return scoped.response;

    const entry = {
      action: "breaking_banner.remove",
      entityType: "breaking_news",
      entityId: id,
      target,
      before: { text: current.text, language },
      after: { is_active: false },
    };
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
