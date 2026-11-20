import "server-only";

import { NextResponse } from "next/server";
import type { LiveFields, LiveUpdateRow } from "@timesprime/server/repositories/liveUpdates";
import type { StoryRow } from "@timesprime/server/repositories/stories";
import { checklistImages } from "@timesprime/server/services/desk/storyImages";
import { liveBodyProblem } from "@timesprime/shared/lib/liveBody";
import { HEADLINE_MAX, imageChecklist } from "@timesprime/shared/config/desk";

// A live blog's routes (Panel 3 design §3 and §4, M3) share these: whether the story takes updates,
// what an update may hold, and how it is recorded in the audit log. HTTP answers stay here.

/** The longest reason for removing an update. */
export const REMOVE_REASON_MAX = 500;

const conflict = (error: string, code: string) => NextResponse.json({ error, code }, { status: 409 });

/** Null when the story takes updates now: a published live blog that has not ended; else the refusal. */
export function closedLiveBlog(story: Pick<StoryRow, "format" | "workflow_state" | "live_ended_at">): NextResponse | null {
  if (story.format !== "live_blog") return conflict("This story is not a live blog.", "not_live_blog");
  if (story.workflow_state !== "published") return conflict("A live blog takes updates once it is published.", "not_published");
  if (story.live_ended_at) return conflict("This live blog has ended: it takes no more updates.", "live_ended");
  return null;
}

/**
 * The update a request sends, or what is wrong with it. Creating needs a body; an edit sends what it
 * changes, and the rest is kept from `current`.
 */
export function liveFields(body: Record<string, unknown>, current?: LiveUpdateRow): { ok: true; fields: LiveFields } | { ok: false; error: string } {
  let headline: string | null = current?.headline ?? null;
  if ("headline" in body) {
    if (body.headline !== null && typeof body.headline !== "string") return { ok: false, error: "headline must be text, or null." };
    const text = typeof body.headline === "string" ? body.headline.trim() : "";
    if ([...text].length > HEADLINE_MAX) return { ok: false, error: `headline: at most ${HEADLINE_MAX} characters.` };
    headline = text || null;
  }
  if (!current && !("body" in body)) return { ok: false, error: "body is required: the update's text." };
  const doc = "body" in body ? body.body : current?.body;
  const problem = liveBodyProblem(doc);
  if (problem) return { ok: false, error: problem };
  for (const flag of ["is_key_event", "is_pinned"] as const) {
    if (flag in body && typeof body[flag] !== "boolean") return { ok: false, error: `${flag}: true or false.` };
  }
  return {
    ok: true,
    fields: {
      headline,
      body: doc,
      isKeyEvent: typeof body.is_key_event === "boolean" ? body.is_key_event : (current?.is_key_event ?? false),
      isPinned: typeof body.is_pinned === "boolean" ? body.is_pinned : (current?.is_pinned ?? false),
    },
  };
}

/**
 * Why an update's image cannot be shown, as a 422, or null: the same rules as a story's image before
 * publication (in the library, not retired, rights cleared, alt text and caption in the story's
 * language), as an update is live the moment it is posted.
 */
export async function imageRefusal(doc: unknown, language: "en" | "hi", now: Date): Promise<NextResponse | null> {
  const problems = imageChecklist(await checklistImages(doc), language, now);
  return problems.length > 0
    ? NextResponse.json({ error: "The update's image is not ready for readers.", code: "image", problems }, { status: 422 })
    : null;
}

/** An update as its audit rows record it: what readers see of it. */
export const liveRecord = (u: Pick<LiveUpdateRow, "headline" | "body" | "is_key_event" | "is_pinned">) => ({
  headline: u.headline,
  body: u.body,
  is_key_event: u.is_key_event,
  is_pinned: u.is_pinned,
});
