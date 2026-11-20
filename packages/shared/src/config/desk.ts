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

/** The formats the Desk accepts: sponsored waits for Panel 9. Live blogs since Panel 3, M3. */
export const DESK_FORMATS: readonly StoryFormat[] = STORY_FORMATS.filter((f) => f !== "sponsored");

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

/**
 * The kinds of author the Desk records (design §7). The database also allows "agency"; agency
 * bylines (PTI, ANI and others) wait for a wire licence (Phase K), so the Desk does not offer it.
 */
export const AUTHOR_KINDS = ["staff", "columnist", "freelancer"] as const;
export type AuthorKind = (typeof AUTHOR_KINDS)[number];

/** A story's credits, in the order the reader's page shows them (design §2, story_authors.role). */
export const CREDIT_ROLES = ["byline", "additional_reporting", "translated_by"] as const;
export type CreditRole = (typeof CREDIT_ROLES)[number];

/** The most credits a story carries (desk_set_credits refuses more). */
export const CREDITS_MAX = 20;

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

interface Step {
  to: StoryState;
  permission: PermissionKey;
  /**
   * A step of the desk's review (design §3): the permission must be held for the story's desk (S or
   * F). A Writer's Own is not enough, even on their own story (the owner's decision, 18 Nov 2026).
   */
  deskOnly?: boolean;
}

interface Move {
  /** The states the action may start from, each with the state it leads to and the permission it needs. */
  from: Partial<Record<StoryState, Step>>;
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
    from: { ...each(["pitch", "assigned", "draft"], "in_review", "article.submit"), in_review: { to: "desk_review", permission: "article.submit", deskOnly: true } },
    reason: false,
  },
  send_back: {
    from: { in_review: { to: "draft", permission: "article.submit", deskOnly: true }, desk_review: { to: "draft", permission: "article.approve" } },
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
export function move(action: DeskAction, from: StoryState): { to: StoryState; permission: PermissionKey; reason: boolean; deskOnly: boolean } | null {
  const step = MOVES[action].from[from];
  return step ? { to: step.to, permission: step.permission, reason: MOVES[action].reason, deskOnly: step.deskOnly === true } : null;
}

/** The roles whose `article.submit` covers a desk (the matrix's S or F): the review steps are theirs. */
export const DESK_REVIEW_ROLES = ["sub_editor", "desk_editor", "managing_editor"] as const;

/** Whether a person may be offered a desk-only step: they hold one of DESK_REVIEW_ROLES (the server still decides). */
export function holdsDeskReview(roles: ReadonlyArray<{ role: string }>): boolean {
  return roles.some((r) => (DESK_REVIEW_ROLES as readonly string[]).includes(r.role));
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
  /**
   * The library's images the revision uses, as their records say (null for one the library does not
   * have), and the story's language, whose alt text and caption they need (design §7). Left out
   * where nobody has read them yet (the story screen); the server always reads them.
   */
  images?: ReadonlyArray<ChecklistImage | null>;
  language?: "en" | "hi";
  now?: Date;
}

export type ChecklistProblem =
  | "headline_missing"
  | "headline_too_long"
  | "dek_missing"
  | "seo_title_missing"
  | "seo_title_too_long"
  | "slug_missing"
  | "legal_review_pending"
  | "translation_missing"
  | "image_unavailable"
  | "image_rights_missing"
  | "image_text_missing";

/** What the checklist reads of an image's record. */
export interface ChecklistImage {
  active: boolean;
  credit: string | null;
  source: string | null;
  licence: string | null;
  licence_expires_at: string | null;
  rights_cleared_at: string | null;
  alt_en: string | null;
  alt_hi: string | null;
  caption_en: string | null;
  caption_hi: string | null;
}

/**
 * The pre-publish checklist (design §3 and §7). Every image a story uses must be in the library,
 * not retired, its licence not ended; carry a credit, a source, a licence and cleared rights; and
 * have alt text and a caption in the story's language. Empty: it passes.
 */
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
  problems.push(...imageChecklist(input.images ?? [], input.language ?? "en", input.now ?? new Date()));
  return problems;
}

/**
 * The checklist's image rules (design §7), alone: also what the worker checks again at a scheduled
 * story's time, as an image's rights or licence may have changed since the story was approved.
 */
export function imageChecklist(images: ReadonlyArray<ChecklistImage | null>, language: "en" | "hi", now: Date): ChecklistProblem[] {
  const problems: ChecklistProblem[] = [];
  if (images.some((m) => !m || !m.active || (m.licence_expires_at !== null && Date.parse(m.licence_expires_at) <= now.getTime()))) {
    problems.push("image_unavailable");
  }
  if (images.some((m) => m && (!m.credit || !m.source || !m.licence || !m.rights_cleared_at))) problems.push("image_rights_missing");
  if (images.some((m) => m && (!(language === "hi" ? m.alt_hi : m.alt_en) || !(language === "hi" ? m.caption_hi : m.caption_en)))) {
    problems.push("image_text_missing");
  }
  return problems;
}

/** Whether an embargo still holds at `now`: nothing may publish before it (design §6). */
export function embargoed(embargoUntil: string | null, now: Date): boolean {
  if (!embargoUntil) return false;
  const until = Date.parse(embargoUntil);
  return !Number.isFinite(until) || until > now.getTime();
}
