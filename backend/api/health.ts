import { NextResponse } from "next/server";
import { getHealth } from "@/backend/services/health/health";

// Public health check for uptime monitors (owner decision D4): the overall
// status and nothing else — no dependency names, error codes, hosts or keys.
// Per-dependency detail is at /api/admin/health, behind the admin session.
// This path is deliberately outside the proxy matcher (/admin/:path*,
// /api/admin/:path*), so it needs no session.
export async function GET() {
  const { status } = await getHealth();
  return NextResponse.json(
    { status },
    { status: status === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
