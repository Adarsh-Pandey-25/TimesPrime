import { NextRequest, NextResponse } from "next/server";

/**
 * RSS CRON — DISABLED FOR COMMERCIAL COMPLIANCE
 * Re-enable only after obtaining publisher RSS licenses.
 * See src/lib/rssParser.ts for details.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const bearerToken = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!cronSecret || bearerToken !== cronSecret) {
    return NextResponse.json(
      { error: "Unauthorized: valid cron secret required." },
      { status: 401 }
    );
  }

  return NextResponse.json(
    {
      status: "disabled",
      reason: "RSS integration disabled for commercial compliance.",
      message: "Re-enable after obtaining publisher syndication licenses.",
      contactUs: "See src/lib/rssParser.ts for publisher contact details.",
      timestamp: new Date().toISOString(),
    },
    { status: 503 }
  );
}
