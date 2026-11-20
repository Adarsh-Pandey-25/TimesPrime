import "server-only";

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { pinnedStories } from "@timesprime/server/services/front/pins";
import { frontPageFrom } from "@timesprime/shared/config/frontPage";

// The front page's pinned row as JSON (Panel 3 design §4 and §5), for a Hindi reader's browser: the
// server renders the English pins in the page itself, and the row loads these when the reader's
// language is Hindi. Public. ?language=en|hi (en if absent) &section=<key> (none: the home page).
// The read goes through the pins' 60-second cache entry.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = frontPageFrom(params.get("language") ?? "en", params.get("section"));
  if (!page) return NextResponse.json({ error: "language must be en or hi, and section one of the site's sections.", pins: [] }, { status: 400 });
  try {
    return NextResponse.json({ pins: await pinnedStories(page) });
  } catch (err) {
    // The row shows nothing rather than an error: the rest of the page is unaffected.
    console.error("Pinned stories read failed:", err);
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "pinnedStories", page } });
    return NextResponse.json({ error: "The pinned stories could not be read.", pins: [] }, { status: 503 });
  }
}
