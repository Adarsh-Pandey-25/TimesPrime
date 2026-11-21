import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { addLegalOrderAction } from "@timesprime/server/repositories/legalOrders";
import { LEGAL_ORDER_LIMITS } from "@timesprime/shared/config/legalOrders";
import { badRequest, readBody, type Params } from "../../../../desk/_lib/desk";
import { audited } from "../../../_lib/grievances";
import { gateOrder, orderAudit } from "../../../_lib/legalOrders";

// What was done about a legal order (Panel 7 design §2, M4): an append-only list, at any time, also
// after the order is closed (a later hearing, a filing). Its text is not in the audit row. Body: { body }.
const RULE = ADMIN_ROUTE_RULES["/api/admin/compliance/legal-orders/[id]/actions"].POST;

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const gated = await gateOrder(request, RULE, id);
  if (!gated.ok) return gated.response;
  const { actor, order } = gated;
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text || text.length > LEGAL_ORDER_LIMITS.action) return badRequest(`An action is 1 to ${LEGAL_ORDER_LIMITS.action} characters.`);

  const done = await audited(actor, orderAudit("legal_order.action", order), () => addLegalOrderAction(order.id, text, actor.userId as string), (action) => ({
    order: order.id,
    action: action.id,
  }));
  if (!done.ok) return done.response;
  return NextResponse.json({ action: { ...done.value, author_name: actor.label } }, { status: 201 });
}
