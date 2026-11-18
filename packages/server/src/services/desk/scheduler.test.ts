/**
 * @jest-environment node
 *
 * The worker's publish-scheduled job (Panel 2 design §6): every due story goes live on behalf of the
 * editor who scheduled it, while they still may; audited as system:scheduler, attempt first; and a
 * story that moved meanwhile, or that failed, does not hold up the others. The store is mocked.
 */

jest.mock("../../repositories/stories", () => {
  const actual = jest.requireActual("../../repositories/stories");
  return { DeskStoreError: actual.DeskStoreError, listDueScheduled: jest.fn(), listHistory: jest.fn(), transition: jest.fn(), getRevision: jest.fn() };
});
jest.mock("./storyImages", () => ({ checklistImages: jest.fn() }));
jest.mock("../../repositories/staff", () => ({ loadStaffRecord: jest.fn() }));
jest.mock("../../repositories/auditLog", () => ({ recordAudit: jest.fn(), recordSystemAudit: jest.fn() }));

import type { StaffRecord } from "../../auth/decide";
import { publishDueStories, SCHEDULER_LABEL } from "./scheduler";

const stories = jest.requireMock("../../repositories/stories") as {
  DeskStoreError: new (status: number, message: string) => Error;
  listDueScheduled: jest.Mock;
  listHistory: jest.Mock;
  transition: jest.Mock;
  getRevision: jest.Mock;
};
const { checklistImages } = jest.requireMock("./storyImages") as { checklistImages: jest.Mock };
const { loadStaffRecord } = jest.requireMock("../../repositories/staff") as { loadStaffRecord: jest.Mock };
const audit = jest.requireMock("../../repositories/auditLog") as { recordAudit: jest.Mock; recordSystemAudit: jest.Mock };

const NOW = new Date("2026-11-17T10:00:00.000Z");
const SCHEDULER = "11111111-1111-4111-8111-111111111111";

const story = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  public_id: 7,
  language: "hi",
  section: "sports",
  workflow_state: "scheduled",
  created_by: "u-writer",
  current_revision_id: "r-2",
  approved_revision_id: "r-2",
  published_revision_id: null,
  scheduled_at: "2026-11-17T10:00:00.000Z",
  embargo_until: null,
  first_published_at: null,
  ...over,
});

/** A Desk Editor for Hindi sports, or with `over` changing their record. */
function editor(over: Partial<StaffRecord> = {}, grantAccess = "S"): StaffRecord {
  return {
    userId: SCHEDULER,
    displayName: "Asha",
    status: "active",
    mfaRequired: true,
    assignments: [
      {
        id: "a-1",
        role: "desk_editor",
        language: "hi",
        section: null,
        isBreakGlass: false,
        expiresAt: "2027-05-16T00:00:00Z",
        revokedAt: null,
        requiresAal2: true,
        grants: [{ permission: "article.publish", access: grantAccess as "S", breakGlassOnly: false }],
      },
    ],
    ...over,
  } as StaffRecord;
}

const history = [
  { action: "create", actor_id: "u-writer" },
  { action: "schedule", actor_id: "u-earlier" },
  { action: "unschedule", actor_id: "u-earlier" },
  { action: "schedule", actor_id: SCHEDULER },
];

beforeEach(() => {
  jest.resetAllMocks();
  stories.listHistory.mockResolvedValue(history);
  stories.getRevision.mockResolvedValue({ id: "r-2", body: { type: "doc", content: [] } });
  checklistImages.mockResolvedValue([]);
  loadStaffRecord.mockResolvedValue(editor());
  audit.recordAudit.mockResolvedValue("attempt-1");
  stories.transition.mockImplementation(async (input: { to: string; fields: { published_revision_id?: string } }) => ({
    workflow_state: input.to,
    published_revision_id: input.fields.published_revision_id ?? null,
  }));
});

test("a due story goes live, on behalf of the editor who last scheduled it", async () => {
  stories.listDueScheduled.mockResolvedValue([story("s-1")]);
  const run = await publishDueStories(NOW);

  expect(run).toEqual({ due: 1, published: ["s-1"], waiting: [], unscheduled: [], moved: [], failed: [] });
  expect(stories.listDueScheduled).toHaveBeenCalledWith(NOW);
  expect(loadStaffRecord).toHaveBeenCalledWith(SCHEDULER, NOW);
  expect(stories.transition).toHaveBeenCalledWith({
    storyId: "s-1",
    action: "publish",
    from: "scheduled",
    to: "published",
    actorId: SCHEDULER,
    actorLabel: SCHEDULER_LABEL,
    reason: null,
    fields: {
      published_by: SCHEDULER,
      published_revision_id: "r-2",
      published_at: NOW.toISOString(),
      first_published_at: NOW.toISOString(),
      scheduled_at: null,
    },
  });
});

test("audited as system:scheduler: the attempt before the change, then the outcome", async () => {
  stories.listDueScheduled.mockResolvedValue([story("s-1")]);
  await publishDueStories(NOW);

  const attempt = audit.recordAudit.mock.calls[0][0];
  expect(attempt).toMatchObject({
    actor_type: "system",
    actor_id: null,
    actor_label: "system:scheduler",
    action: "story.publish",
    outcome: "attempted",
    entity_type: "story",
    entity_id: "s-1",
    language: "hi",
    section: "sports",
    before: { state: "scheduled", on_behalf_of: SCHEDULER },
  });
  expect(audit.recordAudit.mock.invocationCallOrder[0]).toBeLessThan(stories.transition.mock.invocationCallOrder[0]);
  expect(audit.recordSystemAudit.mock.calls[0][0]).toMatchObject({
    action: "story.publish",
    outcome: "succeeded",
    attempt_id: "attempt-1",
    after: { state: "published", published_revision: "r-2", on_behalf_of: SCHEDULER },
  });
});

test("when the attempt cannot be written, nothing is published (fail closed)", async () => {
  stories.listDueScheduled.mockResolvedValue([story("s-1")]);
  audit.recordAudit.mockRejectedValue(new Error("audit_log unavailable"));
  const run = await publishDueStories(NOW);

  expect(stories.transition).not.toHaveBeenCalled();
  expect(run.failed).toEqual([{ id: "s-1", error: "audit_log unavailable" }]);
});

test("a story still under embargo waits for a later run, untouched", async () => {
  stories.listDueScheduled.mockResolvedValue([story("s-1", { embargo_until: "2026-11-17T10:30:00Z" })]);
  const run = await publishDueStories(NOW);

  expect(run.waiting).toEqual(["s-1"]);
  expect(stories.transition).not.toHaveBeenCalled();
  expect(audit.recordAudit).not.toHaveBeenCalled();
});

describe("an editor who may no longer publish it: the story goes back to approved, never live", () => {
  test.each([
    ["their assignment was revoked", editor({ assignments: [{ ...editor().assignments[0], revokedAt: "2026-11-17T09:00:00Z" }] }), "no longer holds article.publish"],
    ["their assignment expired", editor({ assignments: [{ ...editor().assignments[0], expiresAt: "2026-11-17T09:59:00Z" }] }), "no longer holds article.publish"],
    ["they were suspended", editor({ status: "suspended" }), "is suspended"],
    ["they are no longer staff", null, "is no longer a staff member"],
    ["their desk does not cover the story", editor({ assignments: [{ ...editor().assignments[0], language: "en" }] }), "no longer holds article.publish"],
  ])("%s", async (_case, record, why) => {
    stories.listDueScheduled.mockResolvedValue([story("s-1")]);
    loadStaffRecord.mockResolvedValue(record);
    const run = await publishDueStories(NOW);

    expect(run.unscheduled).toEqual(["s-1"]);
    expect(run.published).toEqual([]);
    expect(stories.transition).toHaveBeenCalledTimes(1);
    const move = stories.transition.mock.calls[0][0];
    expect(move).toMatchObject({ action: "unschedule", from: "scheduled", to: "approved", actorId: null, actorLabel: SCHEDULER_LABEL, fields: { scheduled_at: null } });
    expect(move.reason).toContain(why);
    expect(audit.recordAudit.mock.calls[0][0]).toMatchObject({ action: "story.unschedule", outcome: "attempted", actor_type: "system" });
  });
});

test("a story someone published or unscheduled meanwhile is counted as moved, not as a failure", async () => {
  stories.listDueScheduled.mockResolvedValue([story("s-1")]);
  stories.transition.mockRejectedValue(new stories.DeskStoreError(409, "The story changed since you opened it."));
  const run = await publishDueStories(NOW);

  expect(run.moved).toEqual(["s-1"]);
  expect(run.failed).toEqual([]);
  expect(audit.recordSystemAudit.mock.calls[0][0]).toMatchObject({ outcome: "failed", attempt_id: "attempt-1" });
});

test("a story with no one on record as scheduling it fails, and is not published", async () => {
  stories.listDueScheduled.mockResolvedValue([story("s-1")]);
  stories.listHistory.mockResolvedValue([{ action: "create", actor_id: "u-writer" }]);
  const run = await publishDueStories(NOW);

  expect(run.failed).toEqual([{ id: "s-1", error: "The history names no one who scheduled this story." }]);
  expect(stories.transition).not.toHaveBeenCalled();
});

test("one story's failure does not hold up the others", async () => {
  stories.listDueScheduled.mockResolvedValue([story("s-1"), story("s-2"), story("s-3")]);
  stories.transition.mockImplementation(async (input: { storyId: string; to: string }) => {
    if (input.storyId === "s-2") throw new Error("database unavailable");
    return { workflow_state: input.to, published_revision_id: "r-2" };
  });
  const run = await publishDueStories(NOW);

  expect(run.published).toEqual(["s-1", "s-3"]);
  expect(run.failed).toEqual([{ id: "s-2", error: "database unavailable" }]);
  expect(audit.recordSystemAudit).toHaveBeenCalledWith(expect.objectContaining({ entity_id: "s-2", outcome: "failed", reason: "database unavailable" }));
});

test("no due story: nothing is read beyond the list, nothing written", async () => {
  stories.listDueScheduled.mockResolvedValue([]);
  expect(await publishDueStories(NOW)).toEqual({ due: 0, published: [], waiting: [], unscheduled: [], moved: [], failed: [] });
  expect(audit.recordAudit).not.toHaveBeenCalled();
});

test("when the due stories cannot be read, the run fails", async () => {
  stories.listDueScheduled.mockRejectedValue(new Error("database unavailable"));
  await expect(publishDueStories(NOW)).rejects.toThrow("database unavailable");
});

// Design §7: an image's rights, licence or text may have changed since the story was approved.
describe("its images, checked again at its time", () => {
  const ready = {
    active: true, credit: "Photo: Asha Rao", source: "staff", licence: "Own work", licence_expires_at: null,
    rights_cleared_at: "2026-11-16T10:00:00Z", alt_en: null, alt_hi: "मैदान", caption_en: null, caption_hi: "मैच", 
  };

  test("an approved revision whose images are ready goes live", async () => {
    stories.listDueScheduled.mockResolvedValue([story("s-1")]);
    checklistImages.mockResolvedValue([ready]);
    expect((await publishDueStories(NOW)).published).toEqual(["s-1"]);
    expect(stories.getRevision).toHaveBeenCalledWith("r-2");
  });

  test.each([
    ["retired", { ...ready, active: false }, "image_unavailable"],
    ["out of licence", { ...ready, licence_expires_at: "2026-11-17T09:00:00Z" }, "image_unavailable"],
    ["clearance withdrawn", { ...ready, rights_cleared_at: null }, "image_rights_missing"],
    ["no Hindi caption on a Hindi story", { ...ready, caption_hi: null }, "image_text_missing"],
    ["gone from the library", null, "image_unavailable"],
  ])("an image %s: back to approved, the reason in its history, never live", async (_name, image, problem) => {
    stories.listDueScheduled.mockResolvedValue([story("s-1")]);
    checklistImages.mockResolvedValue([image]);
    const run = await publishDueStories(NOW);
    expect(run).toMatchObject({ published: [], unscheduled: ["s-1"] });
    const moved = stories.transition.mock.calls.map(([input]) => input);
    expect(moved).toEqual([expect.objectContaining({ action: "unschedule", from: "scheduled", to: "approved", actorId: null })]);
    expect(moved[0].reason).toContain(problem);
  });
});
