import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { supabase, isSupabaseConfigured } from "@/backend/lib/supabase";
import { ADMIN_ROUTE_RULES } from "@/backend/auth/adminRoutePolicy";
import { ANY_SCOPE } from "@/backend/auth/decide";
import { articleScope } from "@/backend/auth/scope";
import { auditUnavailable, beginAudit, finishAudit, requirePermission, requireTarget } from "@/backend/auth/requirePermission";

// Gated by requirePermission, the only gate on this path (service_role bypasses RLS; Panel 0).
// Publishing here is immediate, with no review step, so it is the matrix's direct path:
// article.publish_direct and article.create, in the new article's scope (its language and its one
// category). Panel 2 adds the reviewed path.
const RULE = ADMIN_ROUTE_RULES["/api/admin/publish-article"].POST;

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 60);
}

interface PublishRequestBody {
  title?: string;
  slug?: string;
  link?: string;
  category?: string;
  description?: string;
  image_url?: string;
  source_name?: string;
  content?: string;
}

export async function POST(request: NextRequest) {
  const gate = await requirePermission(request, RULE, ANY_SCOPE);
  if (!gate.ok) return gate.response;
  const actor = gate.actor;

  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Supabase is not configured on the server — nothing would actually be persisted." },
        { status: 503 }
      );
    }

    const body: PublishRequestBody = await request.json();
    const { title, slug, link, category, description, image_url, source_name, content } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "Title is required." }, { status: 400 });
    }
    if (!link || !link.trim()) {
      return NextResponse.json({ error: "Source link is required." }, { status: 400 });
    }
    if (!category || !category.trim()) {
      return NextResponse.json({ error: "Category is required." }, { status: 400 });
    }

    try {
      const parsed = new URL(link.trim());
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("bad protocol");
      }
    } catch {
      return NextResponse.json({ error: "Link must be a valid http(s) URL." }, { status: 400 });
    }

    const baseSlug = slug && slug.trim() ? slugify(slug) : slugify(title);
    const articleId = `admin-${baseSlug || "article"}-${Date.now()}`;

    const row = {
      article_id: articleId,
      title: title.trim(),
      link: link.trim(),
      description: description?.trim() || "",
      content: content?.trim() || description?.trim() || "",
      pub_date: new Date().toISOString(),
      image_url: image_url?.trim() || null,
      source_id: "admin-published",
      source_name: source_name?.trim() || "TimesPrime Editorial",
      category: [category.trim()],
      country: ["us"],
      language: "english",
    };

    const target = articleScope(row);
    const scoped = await requireTarget(actor, RULE, target);
    if (!scoped.ok) return scoped.response;

    const entry = {
      action: "article.publish_direct",
      entityType: "article",
      entityId: articleId,
      target,
      after: { title: row.title, link: row.link, category: row.category, language: row.language },
    };
    const attempt = await beginAudit(actor, entry);
    if (!attempt) return auditUnavailable();

    // Direct Supabase call (not saveArticlesToDB) so a real insert failure
    // is reported as an error rather than silently returning as if it saved
    // — db.ts's shared helper intentionally fails soft for the best-effort
    // news-caching pipeline, which isn't the right behavior for a manual
    // admin publish that the operator needs to know actually persisted.
    const { data, error } = await supabase
      .from("articles")
      .upsert([row], { onConflict: "article_id" })
      .select("*")
      .single();

    if (error) {
      console.error("Publish article Supabase error:", error.message);
      await finishAudit(actor, attempt, "failed", { ...entry, reason: error.message });
      return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 });
    }

    await finishAudit(actor, attempt, "succeeded", entry);

    return NextResponse.json({ status: "success", article: data });
  } catch (error: unknown) {
    console.error("Publish article error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to publish article." },
      { status: 500 }
    );
  }
}
