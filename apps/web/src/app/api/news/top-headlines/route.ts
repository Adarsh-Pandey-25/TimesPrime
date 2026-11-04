import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getTopHeadlines } from "@timesprime/server/services/news/topHeadlines";

export async function GET(request: NextRequest) {
  const { body, source, status } = await getTopHeadlines(new URL(request.url).searchParams);
  return NextResponse.json(body, { status, headers: { "X-Data-Source": source } });
}
