import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { ANY_SCOPE } from "@timesprime/server/auth/decide";
import { auditUnavailable, beginAudit, finishAudit, requirePermission, requireTarget } from "@timesprime/server/auth/requirePermission";
import { describePins, listPagePins, pinStory, pinUntil, type PinRow } from "@timesprime/server/repositories/frontPage";
import { getStory, type StoryRow } from "@timesprime/server/repositories/stories";
import { forgetPins } from "@timesprime/server/services/front/pins";
import { embargoed } from "@timesprime/shared/config/desk";
import { DEFAULT_PIN_HOURS, frontPageFrom, isPinHours, PIN_START_AHEAD_DAYS, slotsOf } from "@timesprime/shared/config/frontPage";
import { badRequest, deskFailure, readBody } from "../../desk/_lib/desk";
import { conflict, mayPin, PAGE_ERROR, pageFromQuery, pageTarget, pinRecord } from "../_lib/front";

// A front page's pins (Panel 3 design §4): the list for the Front page screen, and pinning a story.
// Pinning needs homepage.curate in the page's own scope: its language, and its section, which for
// the home page is NULL, so only a grant with no section covers it (design §3). The checks run
// before anything is written; the database's front_pin repeats them in one transaction.
const RULES = ADMIN_ROUTE_RULES["/api/admin/front-page/pins"];

/** ?language=en|hi&section=<key>: the page's pins that have not run out, and whether the caller may pin there. */
export async function GET(request: NextRequest) {
  const gate = await requirePermission(request, RULES.GET);
  if (!gate.ok) return gate.response;
  const page = pageFromQuery(new URL(request.url));
  if (!page) return badRequest(PAGE_ERROR);
  const now = new Date();
  try {
    const pins = await describePins(await listPagePins(page, now));
    return NextResponse.json({ page, slots: slotsOf(page.section), pins, may_pin: mayPin(gate.actor, page, now) });
  } catch (err) {
    return deskFailure(err, "listPagePins");
  }
}

const HOUR = 3_600_000;

/**
 * Pins a story. Body: { language, section (null or absent for the home page), slot, story_id,
 * starts_at (null or absent for now), hours (6, 24, 72 or 168; 24 if absent) }. A pin of the slot
 * whose time overlaps is ended. Returns { pin, replaced }.
 */
export async function POST(request: NextRequest) {
  const gate = await requirePermission(request, RULES.POST, ANY_SCOPE);
  if (!gate.ok) return gate.response;
  const actor = gate.actor;

  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  const page = frontPageFrom(body.language, body.section);
  if (!page) return badRequest(PAGE_ERROR);
  const slot = body.slot;
  if (typeof slot !== "number" || !Number.isInteger(slot)) return badRequest("slot must be a whole number.");
  const storyId = typeof body.story_id === "string" ? body.story_id.trim() : "";
  if (!storyId) return badRequest("story_id is required.");
  const hours = body.hours ?? DEFAULT_PIN_HOURS;
  if (!isPinHours(hours)) return badRequest("hours must be 6, 24, 72 or 168 (7 days).");
  const now = new Date();
  let startsAt: string | null = null;
  if (body.starts_at !== undefined && body.starts_at !== null) {
    const at = typeof body.starts_at === "string" ? Date.parse(body.starts_at) : NaN;
    if (!Number.isFinite(at)) return badRequest("starts_at must be a time, or null for now.");
    if (at > now.getTime() + PIN_START_AHEAD_DAYS * 24 * HOUR) return badRequest(`starts_at must be within ${PIN_START_AHEAD_DAYS} days.`);
    // A time already past means now, as the database has it.
    startsAt = at > now.getTime() ? new Date(at).toISOString() : null;
  }

  const target = pageTarget(page);
  const scoped = await requireTarget(actor, RULES.POST, target);
  if (!scoped.ok) return scoped.response;

  const slots = slotsOf(page.section);
  if (slot < 1 || slot > slots) return conflict(`This page has ${slots} slots: 1 to ${slots}.`, "no_slot");

  let story: StoryRow | null;
  let current: PinRow[];
  try {
    [story, current] = await Promise.all([getStory(storyId), listPagePins(page, now)]);
  } catch (err) {
    return deskFailure(err, "pin: read");
  }
  if (!story) return NextResponse.json({ error: "Story not found." }, { status: 404 });
  // Decision 1: the newsroom's own stories, live.
  if (story.workflow_state !== "published" || embargoed(story.embargo_until, now)) {
    return conflict("Only a published story can be pinned.", "not_published");
  }
  if (story.language !== page.language || (page.section !== null && story.section !== page.section)) {
    return NextResponse.json({ error: "The story is not of this page: it is in another language or section.", code: "wrong_page" }, { status: 422 });
  }
  const pinned = story.id;
  const start = startsAt ? Date.parse(startsAt) : now.getTime();
  const end = start + hours * HOUR;
  const overlaps = (pin: PinRow) => Date.parse(pin.starts_at) < end && Date.parse(pinUntil(pin)) > start;
  if (current.some((pin) => pin.slot !== slot && pin.story_id === pinned && overlaps(pin))) {
    return conflict("The story is already pinned on this page. Unpin it there first.", "already_pinned");
  }

  const holders = current.filter((pin) => pin.slot === slot && overlaps(pin));
  const entry = {
    action: "homepage.pin",
    entityType: "front_page_pin",
    entityId: "new",
    target,
    before: holders.length > 0 ? { pins: holders.map(pinRecord) } : null,
    reason: null,
  };
  const attempt = await beginAudit(actor, entry);
  if (!attempt) return auditUnavailable();
  try {
    const result = await pinStory({ actorId: actor.userId as string, page, slot, storyId: pinned, startsAt, hours });
    await finishAudit(actor, attempt, "succeeded", { ...entry, entityId: result.pin.id, after: { ...pinRecord(result.pin), replaced: result.replaced } });
    await forgetPins(page);
    return NextResponse.json(result);
  } catch (err) {
    await finishAudit(actor, attempt, "failed", { ...entry, reason: err instanceof Error ? err.message : String(err) });
    return deskFailure(err, "pinStory");
  }
}
