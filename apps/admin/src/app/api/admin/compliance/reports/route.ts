import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { requirePermission, type Actor } from "@timesprime/server/auth/requirePermission";
import { covers, SITE_WIDE, type Scope } from "@timesprime/server/auth/scope";
import { staffNames } from "@timesprime/server/repositories/grievances";
import { monthFigures, monthReports, publishReport } from "@timesprime/server/repositories/grievanceReports";
import { endedMonths, isMonth, monthEnded, monthOf, previousMonth, REPORT_NOTE_MAX, reportDueAt } from "@timesprime/shared/config/grievanceReports";
import { badRequest, readBody, scopesFor } from "../../desk/_lib/desk";
import { audited, complianceFailure } from "../_lib/grievances";

// The monthly grievance report (Panel 7 design §5, M3; Rule 18(3)). GET: a month's draft figures,
// computed now, its published versions, and when it is due. POST: publishes the month's next version,
// computed again in the database. grievance.report: the Grievance Officer and Legal publish (F,
// site-wide); the Managing Editor reads (R).
const RULES = ADMIN_ROUTE_RULES["/api/admin/compliance/reports"];
/** The months the screen offers: the last 12 that have ended. */
const MONTHS_OFFERED = 12;

const mayPublish = (actor: Actor, now: Date) => scopesFor(actor, "grievance.report", ["F"], now).some((scope) => covers(scope as Scope, SITE_WIDE));

/** ?month=YYYY-MM (last month if absent): the draft, the published versions, the due date. */
export async function GET(request: NextRequest) {
  const gate = await requirePermission(request, RULES.GET);
  if (!gate.ok) return gate.response;
  const now = new Date();
  const month = new URL(request.url).searchParams.get("month") ?? previousMonth(monthOf(now));
  if (!isMonth(month)) return badRequest("month must look like 2026-11.");
  if (!monthEnded(month, now)) return badRequest("A month's report is made once the month has ended.");
  try {
    const [draft, published] = await Promise.all([monthFigures(month), monthReports(month)]);
    const names = await staffNames((published ?? []).map((r) => r.published_by));
    const dueAt = reportDueAt(month);
    return NextResponse.json({
      month,
      months: endedMonths(now, MONTHS_OFFERED),
      applied: draft !== null && published !== null,
      draft,
      published: (published ?? []).map((r) => ({ ...r, published_by_name: names.get(r.published_by) ?? "a staff member" })),
      due_at: dueAt.toISOString(),
      overdue: (published ?? []).length === 0 && now.getTime() > dueAt.getTime(),
      may_publish: mayPublish(gate.actor, now),
    });
  } catch (err) {
    return complianceFailure(err, "monthFigures");
  }
}

/** Publishes a month's report. Body: { month, note? }. The figures are the database's, at this moment. */
export async function POST(request: NextRequest) {
  const gate = await requirePermission(request, RULES.POST, SITE_WIDE);
  if (!gate.ok) return gate.response;
  const actor = gate.actor;
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  const month = body.month;
  if (!isMonth(month)) return badRequest("month must look like 2026-11.");
  if (!monthEnded(month, new Date())) return NextResponse.json({ error: "A month's report is published once the month has ended.", code: "not_ended" }, { status: 409 });
  if (body.note !== undefined && body.note !== null && typeof body.note !== "string") return badRequest("note must be text.");
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length > REPORT_NOTE_MAX) return badRequest(`A note is at most ${REPORT_NOTE_MAX} characters.`);

  const done = await audited(
    actor,
    { action: "grievance.report_publish", entityType: "grievance_report", entityId: "new", target: SITE_WIDE, before: null, reason: null },
    () => publishReport(month, actor.userId as string, note || null),
    (r) => ({
      report: r.id,
      month,
      version: r.version,
      received: r.figures.received.total,
      decided: r.figures.decided.total,
      open: r.figures.open.total,
    })
  );
  if (!done.ok) return done.response;
  return NextResponse.json({ report: { ...done.value, published_by_name: actor.label } }, { status: 201 });
}
