import "server-only";

import type { NextRequest } from "next/server";
import { rssFeedFrom } from "@timesprime/shared/config/rss";
import { serveFeed } from "../../_lib/serve";

// A section's RSS feed in one language (Panel 3, M4): /rss/en/sports.xml, /rss/hi/sports.xml.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ language: string; section: string }> }) {
  const { language, section } = await params;
  return serveFeed(rssFeedFrom(language, section));
}
