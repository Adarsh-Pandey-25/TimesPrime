import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { getDBStats, purgeOldArticles } from "@/backend/services/news";
import { ADMIN_ROUTE_RULES } from "@/backend/auth/adminRoutePolicy";
import { SITE_WIDE } from "@/backend/auth/scope";
import { auditUnavailable, beginAudit, finishAudit, requirePermission } from "@/backend/auth/requirePermission";

// Gated by requirePermission, the only gate on this path (service_role bypasses RLS; Panel 0).
// GET needs stats.view in any scope.
//
// POST, the manual purge, needs content.purge. Every holder's cell in the matrix is A (two people:
// "Bulk purge needs two people"), and the approval flow arrives with Panel 4, so until then the gate
// refuses it for everyone with needs_approval (owner decision Q5). The cron's own 7-day purge is
// separate and continues (BL-033). The code after the gate is kept, audited, for when approval
// exists.
const RULES = ADMIN_ROUTE_RULES["/api/admin/db-stats"];

export async function GET(request: NextRequest) {
  const gate = await requirePermission(request, RULES.GET);
  if (!gate.ok) return gate.response;

  try {
    const stats = await getDBStats();
    return NextResponse.json({
      status: "success",
      stats,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { status: "error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const gate = await requirePermission(request, RULES.POST, SITE_WIDE);
  if (!gate.ok) return gate.response;
  const actor = gate.actor;

  const entry = { action: "content.purge", entityType: "articles", entityId: "older-than-7-days" };
  const attempt = await beginAudit(actor, entry);
  if (!attempt) return auditUnavailable();

  try {
    const removedCount = await purgeOldArticles();
    const stats = await getDBStats();

    await finishAudit(actor, attempt, "succeeded", { ...entry, after: { deleted_count: removedCount } });

    return NextResponse.json({
      status: "success",
      message: `Supabase database purged successfully. Removed ${removedCount} articles older than 7 days.`,
      purgedCount: removedCount,
      stats,
    });
  } catch (err: unknown) {
    await finishAudit(actor, attempt, "failed", { ...entry, reason: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { status: "error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
