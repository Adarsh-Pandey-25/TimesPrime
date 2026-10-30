import "server-only";

import { NextResponse } from "next/server";
import { getHealth } from "@/backend/services/health/health";

// Per-dependency health detail (owner decision D4). Auth is handled upstream
// by proxy.ts (matcher covers /api/admin/:path*), so only a request with
// a valid admin session reaches this handler. The public /api/health returns
// the overall status only.
export async function GET() {
  const report = await getHealth();
  return NextResponse.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
