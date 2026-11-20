import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { isBannerLanguage } from "@timesprime/shared/config/breakingNews";
import { listActiveBreakingNews } from "@timesprime/server/services/news/breakingNews";

// The homepage banner's read (CR-08). Public, and served by the reader site itself, so a
// reader's browser never calls the admin app. `?language=en|hi` (Panel 3, M1): that language's
// items and those for both; without it, or with anything else, every item.
export async function GET(request: NextRequest) {
  const language = request.nextUrl.searchParams.get("language");
  const { status, body } = await listActiveBreakingNews(isBannerLanguage(language) ? language : undefined);
  return NextResponse.json(body, { status });
}
