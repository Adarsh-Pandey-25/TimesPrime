import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { getHealth } from "@/backend/services/health/health";
import { ADMIN_ROUTE_RULES } from "@/backend/auth/adminRoutePolicy";
import { requirePermission } from "@/backend/auth/requirePermission";

// Per-dependency health detail (owner decision D4). Gated by requirePermission, the only gate on
// this path (Panel 0): health.view, which the matrix gives Super Admin and Security Lead (F) and
// Managing Editor and Ingestion Ops (R). The shared password holds no settings permission, so it no
// longer sees this (Q3). The public /api/health returns the overall status only.
const RULE = ADMIN_ROUTE_RULES["/api/admin/health"].GET;

export async function GET(request: NextRequest) {
  const gate = await requirePermission(request, RULE);
  if (!gate.ok) return gate.response;

  const report = await getHealth();
  return NextResponse.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
