import "server-only";

import { NextResponse } from "next/server";
import { listActiveBreakingNews } from "@timesprime/server/services/news/breakingNews";

// The homepage banner's read (CR-08). Public, and served by the reader site itself, so a
// reader's browser never calls the admin app.
export async function GET() {
  const { status, body } = await listActiveBreakingNews();
  return NextResponse.json(body, { status });
}
