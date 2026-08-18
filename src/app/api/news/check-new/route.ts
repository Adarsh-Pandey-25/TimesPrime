import { NextRequest, NextResponse } from "next/server";
import { countArticlesSince } from "@/lib/db";
import { mapCategory } from "@/lib/newsConfig";

/**
 * Lightweight poll target for the "new stories available" banner.
 *
 * Supabase-only by design: never calls NewsData.io and is never cached, so
 * a client can poll it every couple of minutes cheaply and always see the
 * current state of the DB.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryParam = searchParams.get("category") || "general";
    const language = searchParams.get("language") || "en";
    const since = searchParams.get("since");

    if (!since) {
      return NextResponse.json(
        { error: "Missing required query parameter: since" },
        { status: 400 }
      );
    }

    // Reject unparseable timestamps rather than passing them to Postgres,
    // where an invalid value would error the whole query.
    if (Number.isNaN(new Date(since).getTime())) {
      return NextResponse.json(
        { error: "Invalid `since` timestamp — expected an ISO date string." },
        { status: 400 }
      );
    }

    // Same alias mapping the feed uses ("tech" -> "technology"), so the
    // count describes the same rows the feed would serve.
    const category = mapCategory(categoryParam);

    const { newCount, latestTimestamp } = await countArticlesSince(
      since,
      category,
      language
    );

    return NextResponse.json({ newCount, latestTimestamp });
  } catch {
    // Degrade to "nothing new" — a failed poll must never surface an error
    // banner or break the feed the user is already reading.
    return NextResponse.json({ newCount: 0, latestTimestamp: null });
  }
}
