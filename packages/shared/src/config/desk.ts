import type { PermissionKey } from "./permissions";

/**
 * The Desk's workflow (Panel 2 design, §3, approved by the owner on 17 Nov 2026): the states, the
 * actions between them, and the one matrix permission each action needs. Pure data and pure
 * functions, so the back office's screens can show what is possible and the server (which decides)
 * uses the same table. packages/server/src/services/desk/ adds the checks that read history: four-eyes
 * and the two-person requests.
 */

export const STORY_STATES = [
  "pitch",
  "assigned",
  "draft",
  "in_review",
  "desk_review",
  "approved",
  "scheduled",
  "published",
  "unpublished",
  "retracted",
  "killed",
] as const;
export type StoryState = (typeof STORY_STATES)[number];

/** Every format the database allows (design §2). */
export const STORY_FORMATS = [
  "news",
  "opinion",
  "explainer",
  "analysis",
  "interview",
  "live_blog",
  "gallery",
  "video",
  "fact_check",
  "sponsored",
] as const;
export type StoryFormat = (typeof STORY_FORMATS)[number];

/** The formats the Desk accepts: sponsored waits for Panel 9, live blogs for Panel 3. */
export const DESK_FORMATS: readonly StoryFormat[] = STORY_FORMATS.filter((f) => f !== "sponsored" && f !== "live_blog");

export const STORY_LANGUAGES = ["en", "hi"] as const;
export type StoryLanguage = (typeof STORY_LANGUAGES)[number];

/** States in which a story is not public and not finished: it can still be saved, sent on or killed. */
export const PRE_PUBLISH_STATES: readonly StoryState[] = ["pitch", "assigned", "draft", "in_review", "desk_review", "approved"];

/** Why a story was taken down (design §3): a code, and a note in words. */
export const TAKEDOWN_REASONS = ["legal", "error", "duplicate", "other"] as const;
export type TakedownReason = (typeof TAKEDOWN_REASONS)[number];

/** The pre-publish checklist's limits (design §3). */
export const HEADLINE_MAX = 110;
export const SEO_TITLE_MAX = 65;

/** A soft lock lapses this long after its holder's last heartbeat (design §2). */
export const LOCK_TTL_MS = 2 * 60_000;

/**
 * How often the server's timer starts the worker's publish-scheduled job (owner decision 3 of the
 * Panel 2 design), in minutes: a scheduled story goes live within this long after its time. The
 * timer in deploy/systemd/timesprime-publish.timer says the same; a test keeps the two equal.
 */
export const PUBLISH_TICK_MINUTES = 5;

/** The longest public correction note a live story may carry (design §3), in characters. */
export const CORRECTION_NOTE_MAX = 600;

/** The actions that move a story, by name, as the routes and the audit log call them. */
export type DeskAction =
  | "assign"
  | "submit"
  | "send_back"
  | "approve"
  | "schedule"
  | "unschedule"
  | "publish"
  | "publish_direct"
  | "unpublish"
  | "retract"
  | "kill";

interface Move {
  /** The states the action may start from, each with the state it leads to and the permission it needs. */
  from: Partial<Record<StoryState, { to: StoryState; permission: PermissionKey }>>;
  /** True if the action needs a reason from the person taking it. */
  reason: boolean;
}

const each = (states: readonly StoryState[], to: StoryState, permission: PermissionKey) =>
  Object.fromEntries(states.map((s) => [s, { to, permission }])) as Move["from"];

/**
 * The table. A live story's next revision is approved and published without leaving `published`
 * (design §3, "Update a live story"): `approve` and `publish` therefore also start from `published`.
 */
export const MOVES: Record<DeskAction, Move> = {
  assign: { from: each(["pitch"], "assigned", "article.edit"), reason: false },
  submit: {
    from: { ...each(["pitch", "assigned", "draft"], "in_review", "article.submit"), in_review: { to: "desk_review", permission: "article.submit" } },
    reason: false,
  },
  send_back: {
    from: { in_review: { to: "draft", permission: "article.submit" }, desk_review: { to: "draft", permission: "article.approve" } },
    reason: true,
  },
  approve: { from: { desk_review: { to: "approved", permission: "article.approve" }, published: { to: "published", permission: "article.approve" } }, reason: false },
  schedule: { from: each(["approved"], "scheduled", "article.publish"), reason: false },
  unschedule: { from: each(["scheduled"], "approved", "article.publish"), reason: false },
  publish: { from: each(["approved", "scheduled", "published"], "published", "article.publish"), reason: false },
  publish_direct: { from: each(["draft", "in_review", "desk_review"], "published", "article.publish_direct"), reason: false },
  unpublish: { from: each(["published"], "unpublished", "article.unpublish"), reason: true },
  retract: { from: each(["published"], "retracted", "article.unpublish"), reason: true },
  kill: { from: each(["pitch", "assigned", "draft", "in_review", "desk_review", "approved"], "killed", "article.edit"), reason: true },
};

/** Where an action leads from a state, and what it needs; null if the action does not start there. */
export function move(action: DeskAction, from: StoryState): { to: StoryState; permission: PermissionKey; reason: boolean } | null {
  const step = MOVES[action].from[from];
  return step ? { ...step, reason: MOVES[action].reason } : null;
}

/** What the checklist reads: the revision about to be approved or published, and the story. */
export interface ChecklistInput {
  headline: string;
  dek: string | null;
  seoTitle: string | null;
  slug: string | null;
  legalReviewRequired: boolean;
  /** For a story in a translation group: whether its other-language version exists. */
  counterpartMissing: boolean;
}

export type ChecklistProblem =
  | "headline_missing"
  | "headline_too_long"
  | "dek_missing"
  | "seo_title_missing"
  | "seo_title_too_long"
  | "slug_missing"
  | "legal_review_pending"
  | "translation_missing";

/** The pre-publish checklist (design §3). Images join it with the media library (M4). Empty: it passes. */
export function checklist(input: ChecklistInput): ChecklistProblem[] {
  const problems: ChecklistProblem[] = [];
  const headline = input.headline.trim();
  if (!headline) problems.push("headline_missing");
  else if ([...headline].length > HEADLINE_MAX) problems.push("headline_too_long");
  if (!input.dek?.trim()) problems.push("dek_missing");
  const seo = input.seoTitle?.trim() ?? "";
  if (!seo) problems.push("seo_title_missing");
  else if ([...seo].length > SEO_TITLE_MAX) problems.push("seo_title_too_long");
  if (!input.slug) problems.push("slug_missing");
  if (input.legalReviewRequired) problems.push("legal_review_pending");
  if (input.counterpartMissing) problems.push("translation_missing");
  return problems;
}

/** Whether an embargo still holds at `now`: nothing may publish before it (design §6). */
export function embargoed(embargoUntil: string | null, now: Date): boolean {
  if (!embargoUntil) return false;
  const until = Date.parse(embargoUntil);
  return !Number.isFinite(until) || until > now.getTime();
}
