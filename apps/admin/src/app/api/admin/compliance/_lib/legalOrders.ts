import "server-only";

import { NextRequest, NextResponse } from "next/server";
import type { RouteRule } from "@timesprime/server/auth/adminRoutePolicy";
import { requirePermission, type Actor, type AuditEntry } from "@timesprime/server/auth/requirePermission";
import { covers, SITE_WIDE, type Scope } from "@timesprime/server/auth/scope";
import { storyIdByNumber } from "@timesprime/server/repositories/grievances";
import { getLegalOrder, type LegalOrderRow } from "@timesprime/server/repositories/legalOrders";
import { isSection } from "@timesprime/shared/config/sections";
import { deskStoryNumberFrom } from "@timesprime/shared/lib/storyUrl";
import { scopesFor } from "../../desk/_lib/desk";
import { complianceFailure } from "./grievances";

// The legal-orders routes (Panel 7 design §3 and §4, M4) share these: whether the caller may act, the
// gate for one order, the stories an order names, and its audit rows, which never carry what an order
// says (design §3: audit.read reaches more people than legal_order.manage).

/** Whether the caller enters and updates orders: legal_order.manage at F, with no scope (Legal). */
export function mayManage(actor: Actor, now: Date): boolean {
  return scopesFor(actor, "legal_order.manage", ["F"], now).some((scope) => covers(scope as Scope, SITE_WIDE));
}

/** An audit row for an order: its id, status and deadline only, site-wide. Never its text. */
export function orderAudit(action: string, order: Pick<LegalOrderRow, "id" | "status" | "due_at"> | null): AuditEntry {
  return {
    action,
    entityType: "legal_order",
    entityId: order?.id ?? "new",
    target: SITE_WIDE,
    before: order ? { status: order.status, due_at: order.due_at } : null,
    reason: null,
  };
}

/**
 * The Desk stories a list of addresses names, in any state (an order may be about one taken down), or
 * the first address that names none.
 */
export async function storiesFrom(addresses: readonly string[]): Promise<{ ok: true; ids: string[] } | { ok: false; response: NextResponse }> {
  const ids: string[] = [];
  for (const address of addresses) {
    const number = deskStoryNumberFrom(address, isSection);
    let id: string | null = null;
    try {
      id = number === null ? null : await storyIdByNumber(number, false);
    } catch (err) {
      return { ok: false, response: complianceFailure(err, "storyIdByNumber") };
    }
    if (!id) return { ok: false, response: NextResponse.json({ error: `No Desk story has the address ${address}.`, code: "unknown_story" }, { status: 422 }) };
    if (!ids.includes(id)) ids.push(id);
  }
  return { ok: true, ids };
}

type Gated = { ok: true; actor: Actor; order: LegalOrderRow } | { ok: false; response: NextResponse };

/** The gate for a route on one order: the permission first (site-wide for a change), then the order. */
export async function gateOrder(request: NextRequest, rule: RouteRule, id: string | undefined): Promise<Gated> {
  const gate = await requirePermission(request, rule, rule.mode === "act" ? SITE_WIDE : undefined);
  if (!gate.ok) return gate;
  let order: LegalOrderRow | null;
  try {
    order = id ? await getLegalOrder(id) : null;
  } catch (err) {
    return { ok: false, response: complianceFailure(err, "getLegalOrder") };
  }
  if (!order) return { ok: false, response: NextResponse.json({ error: "Order not found." }, { status: 404 }) };
  return { ok: true, actor: gate.actor, order };
}
