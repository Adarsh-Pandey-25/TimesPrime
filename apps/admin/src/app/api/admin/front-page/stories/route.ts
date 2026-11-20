import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { requirePermission } from "@timesprime/server/auth/requirePermission";
import { listPinnable } from "@timesprime/server/repositories/frontPage";
import { badRequest, deskFailure } from "../../desk/_lib/desk";
import { mayPin, PAGE_ERROR, pageFromQuery } from "../_lib/front";

// The Front page screen's picker (Panel 3 design §4): ?language=&section=&q= lists the published
// Desk stories the page can take (decision 1), newest first. For a page the caller may not pin,
// nothing: what a caller cannot pin is not offered.
const RULE = ADMIN_ROUTE_RULES["/api/admin/front-page/stories"].GET;

const Q_MAX = 100;

export async function GET(request: NextRequest) {
  const gate = await requirePermission(request, RULE);
  if (!gate.ok) return gate.response;
  const url = new URL(request.url);
  const page = pageFromQuery(url);
  if (!page) return badRequest(PAGE_ERROR);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, Q_MAX);
  const now = new Date();
  if (!mayPin(gate.actor, page, now)) return NextResponse.json({ stories: [], may_pin: false });
  try {
    return NextResponse.json({ stories: await listPinnable(page, q, now), may_pin: true });
  } catch (err) {
    return deskFailure(err, "listPinnable");
  }
}
