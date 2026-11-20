import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { ANY_SCOPE } from "@timesprime/server/auth/decide";
import { auditUnavailable, beginAudit, finishAudit, requirePermission, requireTarget } from "@timesprime/server/auth/requirePermission";
import { getPin, pinUntil, unpin, type PinRow } from "@timesprime/server/repositories/frontPage";
import { forgetPins } from "@timesprime/server/services/front/pins";
import { deskFailure, type Params } from "../../../../desk/_lib/desk";
import { conflict, pageTarget, pinRecord } from "../../../_lib/front";

// Unpins (Panel 3 design §4): the pin ends at once. One person, no reason asked: a pin only placed a
// story that was already approved (§3). Decided in the pin's page: its language and section.
const RULE = ADMIN_ROUTE_RULES["/api/admin/front-page/pins/[id]/end"].POST;

export async function POST(request: NextRequest, { params }: Params) {
  const gate = await requirePermission(request, RULE, ANY_SCOPE);
  if (!gate.ok) return gate.response;
  const actor = gate.actor;
  const { id } = await params;

  let pin: PinRow | null;
  try {
    pin = id ? await getPin(id) : null;
  } catch (err) {
    return deskFailure(err, "getPin");
  }
  if (!pin) return NextResponse.json({ error: "Pin not found." }, { status: 404 });
  const page = { language: pin.language, section: pin.section };
  const target = pageTarget(page);
  const scoped = await requireTarget(actor, RULE, target);
  if (!scoped.ok) return scoped.response;
  if (Date.parse(pinUntil(pin)) <= Date.now()) return conflict("This pin has already ended.", "ended");

  const entry = { action: "homepage.unpin", entityType: "front_page_pin", entityId: pin.id, target, before: pinRecord(pin), reason: null };
  const attempt = await beginAudit(actor, entry);
  if (!attempt) return auditUnavailable();
  try {
    const ended = await unpin(pin.id, actor.userId as string);
    await finishAudit(actor, attempt, "succeeded", { ...entry, after: { ended_at: ended.ended_at, end_reason: ended.end_reason } });
    await forgetPins(page);
    return NextResponse.json({ pin: ended });
  } catch (err) {
    await finishAudit(actor, attempt, "failed", { ...entry, reason: err instanceof Error ? err.message : String(err) });
    return deskFailure(err, "unpin");
  }
}
