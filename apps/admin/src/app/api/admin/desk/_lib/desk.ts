import "server-only";

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { ANY_SCOPE } from "@timesprime/server/auth/decide";
import type { RouteRule } from "@timesprime/server/auth/adminRoutePolicy";
import { auditUnavailable, beginAudit, finishAudit, requirePermission, requireTarget, type Actor, type AuditEntry } from "@timesprime/server/auth/requirePermission";
import { mayApprove, mayReviewPostHoc } from "@timesprime/server/services/desk/fourEyes";
import { publishFields, publishRefusal, storyTarget } from "@timesprime/server/services/desk/publish";
import { checklistImages } from "@timesprime/server/services/desk/storyImages";
import { forgetLive } from "@timesprime/server/services/front/live";
import { forgetStoryPins } from "@timesprime/server/services/front/pins";
import {
  DeskStoreError,
  getRevision,
  getStory,
  hasCounterpart,
  listHistory,
  transition,
  type DeskScope,
  type MoveFields,
  type StoryRow,
} from "@timesprime/server/repositories/stories";
import { checklist, embargoed, move, TAKEDOWN_REASONS, type DeskAction } from "@timesprime/shared/config/desk";
import type { AccessCode, PermissionKey } from "@timesprime/shared/config/permissions";

// The Desk's routes (Panel 2 design §3 and §4) share these steps: the gate (requirePermission, with
// a named staff member's session), the story, its scope (language, section, and
// its creator for the matrix's Own), the workflow's own checks, and the audit: attempted, the change,
// then the outcome (Panel 0, Q2). HTTP answers stay here, in the app; the rules are in packages/.

export type Params = { params: Promise<Record<string, string>> };

/** A story as a permission target: its desk, and its creator for Own (shared with the worker). */
export { storyTarget };

/**
 * The desks in which the caller holds a permission at one of the codes: the scope of each live
 * assignment (not revoked, not expired) whose role grants it, break-glass grants only on a
 * break-glass assignment. What a list keeps to.
 */
export function scopesFor(actor: Actor, permission: PermissionKey, codes: readonly AccessCode[], now: Date): DeskScope[] {
  return (actor.record?.assignments ?? [])
    .filter((a) => a.revokedAt === null && Date.parse(a.expiresAt) > now.getTime())
    .filter((a) => a.grants.some((g) => g.permission === permission && codes.includes(g.access) && (!g.breakGlassOnly || a.isBreakGlass)))
    .map((a) => ({ language: a.language, section: a.section }));
}

/** The history label of a staff member, as the database functions write it. */
export const staffLabel = (actor: Actor) => `staff:${actor.userId}`;

/** A store failure as an answer: its own status for 404, 409 and 422; 500 (and Sentry) otherwise. */
export function deskFailure(err: unknown, operation: string): NextResponse {
  if (err instanceof DeskStoreError && err.status !== 500) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(`Desk ${operation} failed:`, err);
  Sentry.captureException(err, { tags: { source: "supabase" }, extra: { operation } });
  return NextResponse.json({ error: "The Desk could not do this. Nothing was changed." }, { status: 500 });
}

/** The request's JSON object, {} for an empty body, or null when it is not a JSON object. */
export async function readBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const badRequest = (error: string, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status: 400 });

type Gated = { ok: true; actor: Actor; story: StoryRow } | { ok: false; response: NextResponse };

/**
 * The gate for a route on one story: the permission in some scope first (so a caller with none
 * learns nothing, not even whether the story exists), then the story, then its own scope.
 */
export async function gateStory(request: NextRequest, rule: RouteRule, id: string | undefined): Promise<Gated> {
  const gate = await requirePermission(request, rule, ANY_SCOPE);
  if (!gate.ok) return gate;
  let story: StoryRow | null;
  try {
    story = id ? await getStory(id) : null;
  } catch (err) {
    return { ok: false, response: deskFailure(err, "getStory") };
  }
  if (!story) return { ok: false, response: NextResponse.json({ error: "Story not found." }, { status: 404 }) };
  const scoped = await requireTarget(gate.actor, rule, storyTarget(story));
  if (!scoped.ok) return scoped;
  return { ok: true, actor: gate.actor, story };
}

export interface DeskEntry {
  action: string;
  story: Pick<StoryRow, "id" | "language" | "section" | "created_by" | "workflow_state" | "current_revision_id">;
  reason?: string | null;
}

/** Runs one audited change: the attempt row first (refused with 503 if it cannot be written). */
export async function audited<T>(
  actor: Actor,
  entry: DeskEntry,
  change: () => Promise<T>,
  after: (value: T) => Record<string, unknown>
): Promise<{ ok: true; value: T } | { ok: false; response: NextResponse }> {
  return auditedRecord(
    actor,
    {
      action: entry.action,
      entityType: "story",
      entityId: entry.story.id,
      target: storyTarget(entry.story),
      before: { state: entry.story.workflow_state, revision: entry.story.current_revision_id },
      reason: entry.reason ?? null,
    },
    change,
    after
  );
}

/** The same, for a record that is not a story (an author): it names its own type, id and before. */
export async function auditedRecord<T>(
  actor: Actor,
  row: AuditEntry,
  change: () => Promise<T>,
  after: (value: T) => Record<string, unknown>
): Promise<{ ok: true; value: T } | { ok: false; response: NextResponse }> {
  const attempt = await beginAudit(actor, row);
  if (!attempt) return { ok: false, response: auditUnavailable() };
  try {
    const value = await change();
    await finishAudit(actor, attempt, "succeeded", { ...row, after: after(value) });
    return { ok: true, value };
  } catch (err) {
    await finishAudit(actor, attempt, "failed", { ...row, reason: err instanceof Error ? err.message : String(err) });
    return { ok: false, response: deskFailure(err, row.action) };
  }
}

const conflict = (error: string, code: string, extra: Record<string, unknown> = {}) => NextResponse.json({ error, code, ...extra }, { status: 409 });

/** The pre-publish checklist for the story's current revision (design §3); null when it passes. */
async function checklistFailure(story: StoryRow): Promise<NextResponse | null> {
  const revision = story.current_revision_id ? await getRevision(story.current_revision_id) : null;
  if (!revision) return conflict("The story has no revision to check.", "no_revision");
  const problems = checklist({
    headline: revision.headline,
    dek: revision.dek,
    seoTitle: revision.seo_title,
    slug: story.slug,
    legalReviewRequired: story.legal_review_required,
    counterpartMissing: !(await hasCounterpart(story)),
    // Every library image the revision uses, as its record says now (design §7).
    images: await checklistImages(revision.body),
    language: story.language,
  });
  return problems.length > 0
    ? NextResponse.json({ error: "The pre-publish checklist is not complete.", code: "checklist", problems }, { status: 422 })
    : null;
}

const embargoHolds = (story: StoryRow, now: Date) =>
  embargoed(story.embargo_until, now) ? conflict(`The story is under embargo until ${story.embargo_until}.`, "embargo") : null;

/**
 * What each move checks beyond its permission, and the fields it sets: a response ends the request.
 * Every check reads the database's state, never the request's account of it.
 */
async function prepare(action: DeskAction, story: StoryRow, actor: Actor, body: Record<string, unknown>, now: Date): Promise<MoveFields | NextResponse> {
  const nowIso = now.toISOString();
  switch (action) {
    case "assign": {
      const assignee = typeof body.assignee === "string" ? body.assignee.trim() : "";
      if (!assignee) return badRequest("Name the writer: assignee is required.");
      return { assigned_to: assignee };
    }
    case "approve": {
      const history = await listHistory(story.id);
      const rows = history.map((h) => ({ action: h.action, actorId: h.actor_id }));
      const live = story.workflow_state === "published";
      if (live && story.post_hoc_review_due && story.current_revision_id === story.published_revision_id) {
        // A breaking story's post-hoc review (design §3).
        if (!mayReviewPostHoc(actor.userId as string, story.created_by, rows)) {
          return NextResponse.json({ error: "A different editor reviews a story published directly.", code: "four_eyes" }, { status: 403 });
        }
        return { post_hoc_review_due: false, approved_by: actor.userId, approved_revision_id: story.current_revision_id };
      }
      if (live && (story.current_revision_id === story.published_revision_id || story.current_revision_id === story.approved_revision_id)) {
        return conflict("There is no new revision of this live story to approve.", "nothing_to_approve");
      }
      if (!mayApprove(actor.userId as string, story.created_by, rows)) {
        return NextResponse.json({ error: "You wrote or edited this version, so someone else approves it.", code: "four_eyes" }, { status: 403 });
      }
      const failed = await checklistFailure(story);
      if (failed) return failed;
      return { approved_by: actor.userId, approved_revision_id: story.current_revision_id };
    }
    case "schedule": {
      const at = typeof body.scheduled_at === "string" ? Date.parse(body.scheduled_at) : NaN;
      if (!Number.isFinite(at) || at <= now.getTime()) return badRequest("scheduled_at must be a time in the future.");
      if (story.embargo_until && at < Date.parse(story.embargo_until)) return conflict("The time is before the story's embargo.", "embargo");
      return { scheduled_at: new Date(at).toISOString() };
    }
    case "unschedule":
      return { scheduled_at: null };
    case "publish": {
      // The rules the worker's publish-scheduled job applies too (services/desk/publish.ts).
      const refusal = publishRefusal(story, now);
      if (refusal) return conflict(refusal.message, refusal.code);
      return publishFields(story, actor.userId as string, now);
    }
    case "publish_direct": {
      const embargo = embargoHolds(story, now);
      if (embargo) return embargo;
      const failed = await checklistFailure(story);
      if (failed) return failed;
      return {
        published_by: actor.userId,
        published_revision_id: story.current_revision_id,
        published_at: nowIso,
        first_published_at: story.first_published_at ?? nowIso,
        breaking: true,
        post_hoc_review_due: true,
      };
    }
    case "unpublish":
    case "retract": {
      const code = body.reason_code;
      if (typeof code !== "string" || !(TAKEDOWN_REASONS as readonly string[]).includes(code)) {
        return badRequest(`reason_code must be one of: ${TAKEDOWN_REASONS.join(", ")}.`);
      }
      return {};
    }
    default:
      return {};
  }
}

/** One workflow move on one story (design §3): the shared body of every move route. */
export async function moveStory(request: NextRequest, { params }: Params, action: DeskAction, rule: RouteRule): Promise<NextResponse> {
  const { id } = await params;
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");

  const gated = await gateStory(request, rule, id);
  if (!gated.ok) return gated.response;
  const { actor, story } = gated;

  const step = move(action, story.workflow_state);
  if (!step) return conflict(`A story that is ${story.workflow_state} cannot take this step.`, "wrong_state");
  // send_back needs a different permission from desk review than from review.
  if (!rule.permissions.includes(step.permission)) {
    const exact = await requireTarget(actor, { ...rule, permissions: [step.permission] }, storyTarget(story));
    if (!exact.ok) return exact.response;
  }
  // A desk's review step (out of review: Submit to the desk, Send back): the permission must be held
  // for the story's desk. Without the story's owner in the target, a Writer's Own does not match, even
  // on their own story (the owner's decision, 18 Nov 2026).
  if (step.deskOnly) {
    const desk = await requireTarget(actor, { ...rule, permissions: [step.permission] }, { language: story.language, section: story.section });
    if (!desk.ok) return desk.response;
  }

  const note = typeof body.reason === "string" ? body.reason.trim() : "";
  if (step.reason && !note) return badRequest("A reason is required for this step.");
  const reason = typeof body.reason_code === "string" && note ? `${body.reason_code}: ${note}` : note || null;

  let fields: MoveFields | NextResponse;
  try {
    fields = await prepare(action, story, actor, body, new Date());
  } catch (err) {
    return deskFailure(err, `prepare ${action}`);
  }
  if (fields instanceof NextResponse) return fields;

  const result = await audited(
    actor,
    { action: `story.${action}`, story, reason },
    () =>
      transition({
        storyId: story.id,
        action,
        from: story.workflow_state,
        to: step.to,
        actorId: actor.userId,
        actorLabel: staffLabel(actor),
        reason,
        fields: fields as MoveFields,
      }),
    (updated) => ({ state: updated.workflow_state, revision: updated.current_revision_id, published_revision: updated.published_revision_id })
  );
  if (!result.ok) return result.response;
  // A story taken down leaves the front page's pinned rows at once (Panel 3, M2), not when the
  // pins' 60-second cache lapses: its pin stays, and shows nothing while the story is not live.
  if (action === "unpublish" || action === "retract") {
    await forgetStoryPins(story);
    // A live blog's feed too (Panel 3, M3): its JSON answers 404 at the next read.
    if (story.format === "live_blog") await forgetLive(story.public_id);
  }
  return NextResponse.json({ story: result.value });
}
