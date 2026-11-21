import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { staffNames } from "@timesprime/server/repositories/grievances";
import { listLegalOrderActions, orderStories, updateLegalOrder, type LegalOrderChange } from "@timesprime/server/repositories/legalOrders";
import { isOrderStatus, LEGAL_ORDER_LIMITS, storyAddresses } from "@timesprime/shared/config/legalOrders";
import { badRequest, readBody, type Params } from "../../../desk/_lib/desk";
import { audited, complianceFailure, conflict } from "../../_lib/grievances";
import { gateOrder, mayManage, orderAudit, storiesFrom } from "../../_lib/legalOrders";

// One legal order (Panel 7 design §4, M4): what it is, the stories it names, its actions; and, for
// Legal, a change of its state, deadline, stories or where the original is kept. A closed order is
// final (the database's guard too).
const RULES = ADMIN_ROUTE_RULES["/api/admin/compliance/legal-orders/[id]"];

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const gated = await gateOrder(request, RULES.GET, id);
  if (!gated.ok) return gated.response;
  const { actor, order } = gated;
  try {
    const [actions, stories] = await Promise.all([listLegalOrderActions(order.id), orderStories(order.story_ids)]);
    const names = await staffNames([order.created_by, order.updated_by, ...actions.map((a) => a.author_id)]);
    const name = (id: string | null) => (id ? (names.get(id) ?? "a staff member") : null);
    return NextResponse.json({
      order: { ...order, created_by_name: name(order.created_by), updated_by_name: name(order.updated_by) },
      actions: actions.map((a) => ({ ...a, author_name: name(a.author_id) })),
      stories,
      may_manage: mayManage(actor, new Date()),
    });
  } catch (err) {
    return complianceFailure(err, "getLegalOrder");
  }
}

/** Body: any of { status, due_at (a time or null), stories (Desk story addresses), original_kept_at }. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const gated = await gateOrder(request, RULES.PATCH, id);
  if (!gated.ok) return gated.response;
  const { actor, order } = gated;
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");

  const change: LegalOrderChange = {};
  if (body.status !== undefined) {
    if (!isOrderStatus(body.status)) return badRequest("status must be open, complied, partly_complied, challenged or closed.");
    change.status = body.status;
  }
  if (body.due_at !== undefined) {
    if (body.due_at === null || body.due_at === "") change.due_at = null;
    else {
      const at = typeof body.due_at === "string" ? Date.parse(body.due_at) : NaN;
      if (!Number.isFinite(at)) return badRequest("due_at must be a time, or null.");
      change.due_at = new Date(at).toISOString();
    }
  }
  if (body.original_kept_at !== undefined) {
    const kept = typeof body.original_kept_at === "string" ? body.original_kept_at.trim() : "";
    if (!kept || kept.length > LEGAL_ORDER_LIMITS.originalKeptAt) return badRequest(`Where the original is kept is 1 to ${LEGAL_ORDER_LIMITS.originalKeptAt} characters.`);
    change.original_kept_at = kept;
  }
  if (body.stories !== undefined) {
    const addresses = storyAddresses(body.stories);
    if (addresses === null) return badRequest(`stories: a list of at most ${LEGAL_ORDER_LIMITS.stories} story addresses.`);
    const stories = await storiesFrom(addresses);
    if (!stories.ok) return stories.response;
    change.story_ids = stories.ids;
  }
  if (Object.keys(change).length === 0) return badRequest("Nothing to change: status, due_at, stories or original_kept_at.");
  if (order.status === "closed") return conflict("This order is closed: a closed order is final.", "closed");

  const done = await audited(actor, orderAudit("legal_order.update", order), () => updateLegalOrder(order.id, change, actor.userId as string), (updated) => ({
    status: updated.status,
    due_at: updated.due_at,
    stories: updated.story_ids.length,
    changed: Object.keys(change),
  }));
  if (!done.ok) return done.response;
  return NextResponse.json({ order: done.value });
}
