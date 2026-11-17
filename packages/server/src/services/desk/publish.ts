import "server-only";

import { embargoed } from "@timesprime/shared/config/desk";
import type { Target } from "../../auth/scope";
import type { MoveFields, StoryRow } from "../../repositories/stories";

/**
 * Publishing a story (Panel 2 design §3 and §6): what the Desk's Publish route and the worker's
 * publish-scheduled job share, so a story goes live by the same rules whoever presses the button.
 */

/** A story as a permission target: its desk (language and section) and its creator, for Own. */
export function storyTarget(story: Pick<StoryRow, "language" | "section" | "created_by">): Target {
  return { language: story.language, section: story.section, ownerId: story.created_by };
}

export interface PublishRefusal {
  code: "embargo" | "not_approved";
  message: string;
}

/**
 * Why the story cannot go live now, or null. Publish Guard: only an approved revision that is not
 * already live, and never before the embargo.
 */
export function publishRefusal(
  story: Pick<StoryRow, "embargo_until" | "approved_revision_id" | "published_revision_id">,
  now: Date
): PublishRefusal | null {
  if (embargoed(story.embargo_until, now)) return { code: "embargo", message: `The story is under embargo until ${story.embargo_until}.` };
  if (!story.approved_revision_id || story.approved_revision_id === story.published_revision_id) {
    return { code: "not_approved", message: "Only an approved revision can be published." };
  }
  return null;
}

/** What publishing sets: the approved revision goes live, and the first publication's time stays. */
export function publishFields(story: Pick<StoryRow, "approved_revision_id" | "first_published_at">, publishedBy: string, now: Date): MoveFields {
  const at = now.toISOString();
  return {
    published_by: publishedBy,
    published_revision_id: story.approved_revision_id,
    published_at: at,
    first_published_at: story.first_published_at ?? at,
    scheduled_at: null,
  };
}
