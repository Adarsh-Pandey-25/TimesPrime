import "server-only";

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { rssFeed } from "@timesprime/server/services/front/rss";
import { RSS_TTL_SECONDS, type RssFeedId } from "@timesprime/shared/config/rss";

// The RSS routes' one answer (Panel 3 design §5, M4): the feed as RSS 2.0, kept 5 minutes at the
// edge and served stale for 10 more while the edge fetches a fresh one. Not a feed: 404. A failed
// read: 503. Neither is kept anywhere.

const NO_STORE = { "Cache-Control": "no-store" };

export async function serveFeed(feed: RssFeedId | null): Promise<NextResponse> {
  if (!feed) return new NextResponse("No such feed.", { status: 404, headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" } });
  try {
    return new NextResponse(await rssFeed(feed), {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": `public, s-maxage=${RSS_TTL_SECONDS}, stale-while-revalidate=${RSS_TTL_SECONDS * 2}`,
      },
    });
  } catch (err) {
    console.error("RSS feed read failed:", err);
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "rssFeed", feed } });
    return new NextResponse("The feed could not be read.", { status: 503, headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" } });
  }
}
