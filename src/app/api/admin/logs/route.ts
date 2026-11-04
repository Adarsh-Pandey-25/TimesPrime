import "server-only";

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { supabase, isSupabaseConfigured } from "@/server/lib/supabase";
import { ADMIN_ROUTE_RULES } from "@/server/auth/adminRoutePolicy";
import { requirePermission, type Actor } from "@/server/auth/requirePermission";
import type { AdminLog } from "@/types";

// The activity log, read from the append-only audit_log (Panel 0; database/migrations/2026-11-02-
// access-1-foundation.sql). Gated by requirePermission, the only gate on this path (service_role
// bypasses RLS): audit.read. The shared password holds no audit permission (Q3).
//
// ?source=legacy reads the frozen admin_logs instead: the shared-password era's history, kept
// readable and never written again (Q7). There is no DELETE: an append-only log cannot be cleared
// (Q6). Before Panel 0 a DELETE here emptied admin_logs.
const RULE = ADMIN_ROUTE_RULES["/api/admin/logs"].GET;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const SCOPE_VALUE = /^[a-z_]+$/;

/**
 * The PostgREST filter that limits rows to the scopes that granted audit.read, or null when one of
 * them is unscoped (then every row). Managing Editor's cell is "S (own desk)". A row with no
 * language or section matches only an unscoped grant, the same rule as everywhere else.
 */
function scopeFilter(actor: Actor): string | null {
  const granting = (actor.record?.assignments ?? []).filter((a) => actor.via.includes(a.id));
  if (granting.length === 0 || granting.some((a) => a.language === null && a.section === null)) return null;
  const clauses = granting.map((a) => {
    const parts = [
      a.language !== null && SCOPE_VALUE.test(a.language) ? `language.eq.${a.language}` : null,
      a.section !== null && SCOPE_VALUE.test(a.section) ? `section.eq.${a.section}` : null,
    ].filter((p): p is string => p !== null);
    // An unreadable scope value grants nothing rather than everything.
    if (parts.length === 0) return "id.is.null";
    return parts.length === 1 ? parts[0] : `and(${parts.join(",")})`;
  });
  return clauses.join(",");
}

interface AuditLogRow {
  id: string;
  seq: number;
  at: string;
  actor_type: string;
  actor_label: string;
  action: string;
  outcome: string;
  attempt_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  language: string | null;
  section: string | null;
  reason: string | null;
}

/** An audit_log row in the activity log's existing shape (AdminLog), with the new fields in metadata. */
function toAdminLog(r: AuditLogRow): AdminLog {
  const target = r.entity_id ? ` ${r.entity_type ?? ""} ${r.entity_id}`.trimEnd() : "";
  return {
    id: r.id,
    action: r.action as AdminLog["action"],
    details: `${r.actor_label}: ${r.action} ${r.outcome}${target}`,
    metadata: {
      seq: r.seq,
      actor_type: r.actor_type,
      actor_label: r.actor_label,
      outcome: r.outcome,
      attempt_id: r.attempt_id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      language: r.language,
      section: r.section,
      reason: r.reason,
    },
    created_at: r.at,
  };
}

/**
 * Paginated activity log, newest first. Query params: page (default 1), limit (default 20, capped
 * at 100), source ("legacy" for admin_logs). Returns { logs, total, page, totalPages, source }.
 */
export async function GET(request: NextRequest) {
  const gate = await requirePermission(request, RULE);
  if (!gate.ok) return gate.response;

  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Supabase is not configured on the server." },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(searchParams.get("limit")) || DEFAULT_LIMIT));
    const legacy = searchParams.get("source") === "legacy";

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let logs: AdminLog[];
    let count: number | null;
    if (legacy) {
      const result = await supabase
        .from("admin_logs")
        .select("id, action, details, metadata, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);
      if (result.error) throw new Error(result.error.message);
      logs = (result.data ?? []) as AdminLog[];
      count = result.count;
    } else {
      let query = supabase
        .from("audit_log")
        .select("id, seq, at, actor_type, actor_label, action, outcome, attempt_id, entity_type, entity_id, language, section, reason", { count: "exact" })
        .order("seq", { ascending: false });
      const filter = scopeFilter(gate.actor);
      if (filter) query = query.or(filter);
      const result = await query.range(from, to);
      if (result.error) throw new Error(result.error.message);
      logs = ((result.data ?? []) as AuditLogRow[]).map(toAdminLog);
      count = result.count;
    }

    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return NextResponse.json({ logs, total, page, totalPages, source: legacy ? "legacy" : "audit" });
  } catch (err) {
    console.error("Admin logs list error:", err);
    Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation: "listAdminLogs" } });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch activity logs." },
      { status: 500 }
    );
  }
}
