import { NextRequest, NextResponse } from "next/server";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// Auth is handled upstream by src/proxy.ts (matcher covers /api/admin/:path*),
// so by the time a request reaches this handler it has already been validated.

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
      return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ status: "success", article: data });
  } catch (error: any) {
    console.error("Publish article error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to publish article." },
      { status: 500 }
    );
  }
}
