import "server-only";

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getPublishedStory } from "@timesprime/server/repositories/stories";
import { cachedLiveFeed, liveFeed } from "@timesprime/server/services/front/live";
import { LIVE_EDGE_SECONDS, LIVE_EDGE_STALE_SECONDS, type LiveFeed } from "@timesprime/shared/config/liveBlog";

// A live blog's feed as JSON (Panel 3 design §5, M3): its newest updates, for the page's check every
// 15 seconds. Public. One address per blog, with no per-reader query string, so the edge can share
// one copy among every reader: 10 seconds fresh, 20 more while it fetches a new one (decision 9).
// Behind it, a 5-second Redis entry the back office deletes on every change.

const NO_STORE = { "Cache-Control": "no-store" };
const shared = (feed: LiveFeed) =>
  NextResponse.json(feed, { headers: { "Cache-Control": `public, s-maxage=${LIVE_EDGE_SECONDS}, stale-while-revalidate=${LIVE_EDGE_STALE_SECONDS}` } });

export async function GET(_request: NextRequest, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId: segment } = await params;
  const publicId = /^[1-9][0-9]{0,14}$/.test(segment) ? Number(segment) : null;
  if (publicId === null) return NextResponse.json({ error: "No live blog here." }, { status: 404, headers: NO_STORE });
  try {
    const cached = await cachedLiveFeed(publicId);
    if (cached) return shared(cached);
    // The same checks as the story's page: published, past its embargo; and a live blog.
    const story = await getPublishedStory(publicId);
    if (!story || story.format !== "live_blog") return NextResponse.json({ error: "No live blog here." }, { status: 404, headers: NO_STORE });
    return shared(await liveFeed(story));
  } catch (err) {
    console.error("Live feed read failed:", err);
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "liveFeed", publicId } });
    return NextResponse.json({ error: "The live updates could not be read." }, { status: 503, headers: NO_STORE });
  }
}
