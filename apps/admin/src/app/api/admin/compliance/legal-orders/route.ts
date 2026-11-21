import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { requirePermission } from "@timesprime/server/auth/requirePermission";
import { SITE_WIDE } from "@timesprime/server/auth/scope";
import { createLegalOrder, listLegalOrders } from "@timesprime/server/repositories/legalOrders";
import { legalOrderFields } from "@timesprime/shared/config/legalOrders";
import { badRequest, readBody } from "../../desk/_lib/desk";
import { audited, complianceFailure } from "../_lib/grievances";
import { mayManage, orderAudit, storiesFrom } from "../_lib/legalOrders";

// The legal-orders register (Panel 7 design §4, M4): the list, open orders by their deadline, and
// entering an order. Confidential: legal_order.manage only, Legal acting (F) and the Managing Editor
// reading (R).
const RULES = ADMIN_ROUTE_RULES["/api/admin/compliance/legal-orders"];

/** ?status=open|all (open if absent): the register, and whether the caller may act. */
export async function GET(request: NextRequest) {
  const gate = await requirePermission(request, RULES.GET);
  if (!gate.ok) return gate.response;
  const status = new URL(request.url).searchParams.get("status") ?? "open";
  if (status !== "open" && status !== "all") return badRequest("status must be open or all.");
  try {
    const orders = await listLegalOrders(status);
    return NextResponse.json({ orders: orders ?? [], applied: orders !== null, may_manage: mayManage(gate.actor, new Date()) });
  } catch (err) {
    return complianceFailure(err, "listLegalOrders");
  }
}

/**
 * Enters an order. Body: { reference, authority_type, authority, order_date?, received_at,
 * received_via, asks[], summary, due_at?, original_kept_at, stories? (Desk story addresses) }.
 */
export async function POST(request: NextRequest) {
  const gate = await requirePermission(request, RULES.POST, SITE_WIDE);
  if (!gate.ok) return gate.response;
  const actor = gate.actor;
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  const checked = legalOrderFields(body, Date.now());
  if (!checked.ok) return badRequest(checked.error);
  const stories = await storiesFrom(checked.fields.storyAddresses);
  if (!stories.ok) return stories.response;

  const done = await audited(
    actor,
    orderAudit("legal_order.create", null),
    () => createLegalOrder(checked.fields, stories.ids, actor.userId as string),
    (order) => ({ order: order.id, status: order.status, due_at: order.due_at, stories: order.story_ids.length })
  );
  if (!done.ok) return done.response;
  return NextResponse.json({ order: done.value }, { status: 201 });
}
