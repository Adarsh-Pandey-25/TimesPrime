import "server-only";

import { decide, type DenyCode } from "../../auth/decide";
import { recordAudit, recordSystemAudit, type AuditRow } from "../../repositories/auditLog";
import { loadStaffRecord } from "../../repositories/staff";
import { imageChecklist } from "@timesprime/shared/config/desk";
import { DeskStoreError, getRevision, listDueScheduled, listHistory, transition, type StoryRow } from "../../repositories/stories";
import { publishFields, publishRefusal, storyTarget } from "./publish";
import { checklistImages } from "./storyImages";

/**
 * The worker's publish-scheduled job (Panel 2 design §6, owner decision 3: every 5 minutes): every
 * scheduled story whose time has come goes live, by the Publish route's own rules (publish.ts).
 *
 * - **On behalf of the editor who scheduled it.** The history names them; the story records them
 *   as its publisher, and the audit log's actor is `system:scheduler`, with them as `on_behalf_of`.
 * - **Only while they still may.** Their access is decided again now, as if they pressed Publish:
 *   active, holding `article.publish` in the story's desk, on an assignment neither expired nor
 *   revoked. Their second factor was checked when they scheduled. If they no longer may, the story
 *   goes back to approved, with the reason in its history, for an editor who may to schedule or
 *   publish it: it never goes live on the word of someone who has lost the right.
 * - **Audited like a person's change:** the attempt first, refused if it cannot be written (Panel 0,
 *   Q2), then the outcome.
 * - **Never twice.** The move names the state it starts from, so a story someone published or
 *   unscheduled meanwhile is refused by the database and counted as moved, not as a failure.
 */

export const SCHEDULER_LABEL = "system:scheduler";

export interface ScheduledRun {
  /** Due stories read this run (at most DUE_BATCH; the rest wait for the next run). */
  due: number;
  published: string[];
  /** Still under embargo: published by a later run. */
  waiting: string[];
  /** Sent back to approved: the editor who scheduled them may no longer publish them. */
  unscheduled: string[];
  /** Published or unscheduled by someone else meanwhile. */
  moved: string[];
  failed: Array<{ id: string; error: string }>;
}

const DENIALS: Record<DenyCode, string> = {
  not_staff: "is no longer a staff member",
  suspended: "is suspended",
  mfa_required: "has not set up a second factor",
  needs_approval: "may only ask for it to be published",
  forbidden: "no longer holds article.publish for this desk",
};

const systemRow = (story: StoryRow, action: string): Pick<AuditRow, "actor_type" | "actor_id" | "actor_label" | "action" | "entity_type" | "entity_id" | "language" | "section"> => ({
  actor_type: "system",
  actor_id: null,
  actor_label: SCHEDULER_LABEL,
  action,
  entity_type: "story",
  entity_id: story.id,
  language: story.language,
  section: story.section,
});

/** One audited change by the scheduler: the attempt (or nothing happens), the change, the outcome. */
async function audited<T>(
  story: StoryRow,
  action: string,
  entry: { before: Record<string, unknown>; reason: string | null },
  change: () => Promise<T>,
  after: (value: T) => Record<string, unknown>
): Promise<T> {
  const attemptId = await recordAudit({ ...systemRow(story, action), outcome: "attempted", before: entry.before, reason: entry.reason });
  try {
    const value = await change();
    await recordSystemAudit({ ...systemRow(story, action), outcome: "succeeded", attempt_id: attemptId, after: after(value), reason: entry.reason });
    return value;
  } catch (err) {
    await recordSystemAudit({ ...systemRow(story, action), outcome: "failed", attempt_id: attemptId, reason: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

async function publishOne(story: StoryRow, now: Date, run: ScheduledRun): Promise<void> {
  const refusal = publishRefusal(story, now);
  if (refusal?.code === "embargo") {
    run.waiting.push(story.id);
    return;
  }
  // A scheduled story always has an approved revision (the database's CHECK); this says if not.
  if (refusal) throw new Error(refusal.message);

  const history = await listHistory(story.id);
  const scheduler = [...history].reverse().find((h) => h.action === "schedule")?.actor_id ?? null;
  if (!scheduler) throw new Error("The history names no one who scheduled this story.");
  const before = { state: story.workflow_state, revision: story.current_revision_id, scheduled_at: story.scheduled_at, on_behalf_of: scheduler };

  const staff = await loadStaffRecord(scheduler, now);
  const decision = decide({ staff, aal: "aal2", permission: "article.publish", mode: "act", target: storyTarget(story), now });
  // Its images are checked again (design §7): one may have been retired, lost its clearance or come
  // to the end of its licence since the story was approved.
  const approved = await getRevision(story.approved_revision_id as string);
  const imageProblems = imageChecklist(await checklistImages(approved?.body), story.language, now);
  if (!decision.allowed || imageProblems.length > 0) {
    const reason = !decision.allowed
      ? `Not published at its scheduled time: the editor who scheduled it ${DENIALS[decision.code]}.`
      : `Not published at its scheduled time: an image it uses is no longer ready (${imageProblems.join(", ")}).`;
    await audited(
      story,
      "story.unschedule",
      { before, reason },
      () => transition({ storyId: story.id, action: "unschedule", from: "scheduled", to: "approved", actorId: null, actorLabel: SCHEDULER_LABEL, reason, fields: { scheduled_at: null } }),
      (updated) => ({ state: updated.workflow_state })
    );
    run.unscheduled.push(story.id);
    return;
  }

  await audited(
    story,
    "story.publish",
    { before, reason: `Scheduled for ${story.scheduled_at}.` },
    () =>
      transition({
        storyId: story.id,
        action: "publish",
        from: "scheduled",
        to: "published",
        actorId: scheduler,
        actorLabel: SCHEDULER_LABEL,
        reason: null,
        fields: publishFields(story, scheduler, now),
      }),
    (updated) => ({ state: updated.workflow_state, published_revision: updated.published_revision_id, on_behalf_of: scheduler })
  );
  run.published.push(story.id);
}

/** One run: every due story, each on its own, so one that fails does not hold up the others. */
export async function publishDueStories(now: Date = new Date()): Promise<ScheduledRun> {
  const run: ScheduledRun = { due: 0, published: [], waiting: [], unscheduled: [], moved: [], failed: [] };
  const stories = await listDueScheduled(now);
  run.due = stories.length;
  for (const story of stories) {
    try {
      await publishOne(story, now, run);
    } catch (err) {
      if (err instanceof DeskStoreError && err.status === 409) run.moved.push(story.id);
      else run.failed.push({ id: story.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return run;
}
