import "server-only";

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { supabase, isSupabaseConfigured } from "@/backend/lib/supabase";

// Auth is handled upstream by proxy.ts (matcher covers /api/admin/:path*),
// so by the time a request reaches this handler it has already been validated.

// Supabase caps a single .select() at 1000 rows regardless of an explicit
// range, so a full-table scan for the category/language breakdown has to
// page through in chunks rather than trust one request to return everything.
const SCAN_PAGE_SIZE = 1000;

const TOP_COUNTRIES_LIMIT = 5;

interface BreakdownRow {
  category: string[] | null;
  language: string | null;
  country: string[] | null;
}

interface CategoryBreakdownEntry {
  category: string;
  count: number;
}

interface LanguageBreakdownEntry {
  language: string;
  count: number;
}

interface CountryBreakdownEntry {
  country: string;
  count: number;
}

async function fetchAllCategoryLanguageCountry(): Promise<BreakdownRow[]> {
  const rows: BreakdownRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("articles")
      .select("category, language, country")
      .range(from, from + SCAN_PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...(data as BreakdownRow[]));
    if (data.length < SCAN_PAGE_SIZE) break;
    from += SCAN_PAGE_SIZE;
  }

  return rows;
}

/**
 * Dashboard stats for the admin panel: total/today article counts, the
 * newest article's created_at (used as a "last sync" proxy), and raw
 * per-value category/language/country breakdowns. Category and country
 * counts are keyed by each individual tag (both are TEXT[] columns, so an
 * article can carry more than one — these counts don't sum to
 * totalArticles) — language counts are keyed by the exact stored string,
 * including any spelling variants, since bucketing those is a
 * presentation concern for the caller, not something to hide here.
 * countryBreakdown is capped to the top TOP_COUNTRIES_LIMIT by count.
 */
export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Supabase is not configured on the server." },
        { status: 503 }
      );
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    const [totalRes, todayRes, latestRes] = await Promise.all([
      supabase.from("articles").select("*", { count: "exact", head: true }),
      supabase.from("articles").select("*", { count: "exact", head: true }).gte("created_at", todayIso),
      supabase
        .from("articles")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (totalRes.error) {
      console.error("Admin stats total-count error:", totalRes.error.message);
      Sentry.captureMessage(`Admin stats total-count error: ${totalRes.error.message}`, {
        tags: { source: "supabase" },
        extra: { operation: "adminStats", part: "totalArticles" },
      });
      return NextResponse.json({ error: totalRes.error.message }, { status: 500 });
    }
    if (todayRes.error) {
      console.error("Admin stats today-count error:", todayRes.error.message);
      Sentry.captureMessage(`Admin stats today-count error: ${todayRes.error.message}`, {
        tags: { source: "supabase" },
        extra: { operation: "adminStats", part: "todayArticles" },
      });
      return NextResponse.json({ error: todayRes.error.message }, { status: 500 });
    }
    if (latestRes.error) {
      console.error("Admin stats last-sync error:", latestRes.error.message);
      Sentry.captureMessage(`Admin stats last-sync error: ${latestRes.error.message}`, {
        tags: { source: "supabase" },
        extra: { operation: "adminStats", part: "lastSyncAt" },
      });
      return NextResponse.json({ error: latestRes.error.message }, { status: 500 });
    }

    const breakdownRows = await fetchAllCategoryLanguageCountry();

    const categoryCounts = new Map<string, number>();
    const languageCounts = new Map<string, number>();
    const countryCounts = new Map<string, number>();

    for (const row of breakdownRows) {
      for (const c of row.category ?? []) {
        categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1);
      }
      const lang = row.language || "unknown";
      languageCounts.set(lang, (languageCounts.get(lang) ?? 0) + 1);
      for (const c of row.country ?? []) {
        countryCounts.set(c, (countryCounts.get(c) ?? 0) + 1);
      }
    }

    const categoryBreakdown: CategoryBreakdownEntry[] = Array.from(categoryCounts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    const languageBreakdown: LanguageBreakdownEntry[] = Array.from(languageCounts.entries())
      .map(([language, count]) => ({ language, count }))
      .sort((a, b) => b.count - a.count);

    const countryBreakdown: CountryBreakdownEntry[] = Array.from(countryCounts.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_COUNTRIES_LIMIT);

    return NextResponse.json({
      totalArticles: totalRes.count ?? 0,
      todayArticles: todayRes.count ?? 0,
      lastSyncAt: latestRes.data?.created_at ?? null,
      categoryBreakdown,
      languageBreakdown,
      countryBreakdown,
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "adminStats" } });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch statistics." },
      { status: 500 }
    );
  }
}
