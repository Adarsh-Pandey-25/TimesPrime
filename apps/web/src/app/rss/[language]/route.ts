import "server-only";

import type { NextRequest } from "next/server";
import { rssFeedFrom } from "@timesprime/shared/config/rss";
import { serveFeed } from "../_lib/serve";

// A language's RSS feed (Panel 3, M4): /rss/en.xml and /rss/hi.xml, the newsroom's last 50 stories.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ language: string }> }) {
  const { language } = await params;
  return serveFeed(rssFeedFrom(language));
}
