import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { auditUnavailable, beginAudit, finishAudit } from "@timesprime/server/auth/requirePermission";
import { readLock, releaseLock, writeLock } from "@timesprime/server/repositories/stories";
import { LOCK_TTL_MS } from "@timesprime/shared/config/desk";
import { badRequest, deskFailure, gateStory, readBody, storyTarget, type Params } from "../../../_lib/desk";

// The soft lock (Panel 2 design §2): one editor at a time. POST takes or renews it (the editor's
// heartbeat), and with { "take_over": true } takes it from someone whose lock is still live, which is
// audited. DELETE releases the caller's own lock. A lock lapses LOCK_TTL_MS after its last heartbeat.
const RULES = ADMIN_ROUTE_RULES["/api/admin/desk/stories/[id]/lock"];

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  const gated = await gateStory(request, RULES.POST, id);
  if (!gated.ok) return gated.response;
  const { actor, story } = gated;
  const now = new Date();
  try {
    const lock = await readLock(story.id);
    const heldByOther = lock !== null && lock.holder_id !== actor.userId && now.getTime() - Date.parse(lock.heartbeat_at) < LOCK_TTL_MS;
    if (heldByOther && body.take_over !== true) {
      return NextResponse.json({ error: "Someone else is editing this story.", code: "locked", holder: lock.holder_id }, { status: 409 });
    }
    if (!heldByOther) {
      await writeLock(story.id, actor.userId as string, now);
      return NextResponse.json({ lock: { story_id: story.id, holder_id: actor.userId, heartbeat_at: now.toISOString() } });
    }
    // Taking over a live lock is audited: the other editor's unsaved work is theirs to lose.
    const entry = { action: "story.lock_take_over", entityType: "story", entityId: story.id, target: storyTarget(story), before: { holder: lock.holder_id }, reason: null };
    const attempt = await beginAudit(actor, entry);
    if (!attempt) return auditUnavailable();
    try {
      await writeLock(story.id, actor.userId as string, now);
    } catch (err) {
      await finishAudit(actor, attempt, "failed", { ...entry, reason: err instanceof Error ? err.message : String(err) });
      throw err;
    }
    await finishAudit(actor, attempt, "succeeded", { ...entry, after: { holder: actor.userId } });
    return NextResponse.json({ lock: { story_id: story.id, holder_id: actor.userId, heartbeat_at: now.toISOString() } });
  } catch (err) {
    return deskFailure(err, "lock");
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const gated = await gateStory(request, RULES.DELETE, id);
  if (!gated.ok) return gated.response;
  try {
    await releaseLock(gated.story.id, gated.actor.userId as string);
    return NextResponse.json({ released: true });
  } catch (err) {
    return deskFailure(err, "releaseLock");
  }
}
