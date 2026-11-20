/**
 * @jest-environment node
 *
 * Grievances (Panel 7 design §2, M1): every change is one database function with its fields named,
 * the queue's order, the open counts, and the database's refusals as the statuses the routes answer.
 */

jest.mock("../lib/supabase", () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

import {
  acknowledgeGrievance,
  addGrievanceNote,
  assignGrievance,
  countOpenGrievances,
  decideGrievance,
  enterGrievance,
  grievanceError,
  GrievanceStoreError,
  listGrievanceNotes,
  listGrievances,
  staffNames,
  storyIdByNumber,
} from "./grievances";

const { supabase } = jest.requireMock("../lib/supabase") as { supabase: { from: jest.Mock; rpc: jest.Mock } };

function query(result: unknown, calls: Array<[string, unknown[]]> = []) {
  const builder: object = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve(result);
        return (...args: unknown[]) => {
          calls.push([String(prop), args]);
          return builder;
        };
      },
    }
  );
  return builder;
}

beforeEach(() => jest.resetAllMocks());

const FIELDS = { language: "en" as const, name: "Asha", email: "asha@example.com", aboutUrl: null, category: "factual_error" as const, body: "Wrong score." };

test("each change is its own database function, with the fields named", async () => {
  supabase.rpc.mockResolvedValue({ data: { id: "g-1" }, error: null });
  await enterGrievance({ actorId: "u-1", channel: "email", fields: FIELDS, storyId: "s-1", receivedAt: "2026-11-19T10:00:00.000Z", acknowledged: true });
  await acknowledgeGrievance("g-1", "u-1");
  await assignGrievance("g-1", "u-1", "u-1");
  await addGrievanceNote("g-1", "u-1", "Called the desk.");
  await decideGrievance("g-1", "u-1", "upheld", "We corrected the score.");
  expect(supabase.rpc.mock.calls).toEqual([
    [
      "grievance_enter",
      {
        p_actor: "u-1", p_channel: "email", p_language: "en", p_name: "Asha", p_email: "asha@example.com", p_about_url: null, p_story: "s-1",
        p_category: "factual_error", p_body: "Wrong score.", p_received_at: "2026-11-19T10:00:00.000Z", p_acknowledged: true,
      },
    ],
    ["grievance_acknowledge", { p_grievance: "g-1", p_actor: "u-1" }],
    ["grievance_assign", { p_grievance: "g-1", p_actor: "u-1", p_assignee: "u-1" }],
    ["grievance_note", { p_grievance: "g-1", p_actor: "u-1", p_body: "Called the desk." }],
    ["grievance_decide", { p_grievance: "g-1", p_actor: "u-1", p_outcome: "upheld", p_reply: "We corrected the score." }],
  ]);
});

test("a function that returns nothing is a failure, not a success", async () => {
  supabase.rpc.mockResolvedValue({ data: null, error: null });
  await expect(acknowledgeGrievance("g-1", "u-1")).rejects.toMatchObject({ status: 500 });
});

test.each([
  ["P0002", "grievance_decide: grievance g-1 not found", 404, "Grievance not found."],
  ["55000", "grievance_acknowledge: grievance G-2026-00001 was already acknowledged", 409, "This grievance was already acknowledged."],
  ["55000", "grievance_decide: grievance G-2026-00001 is decided", 409, /decision is final/],
  ["54000", "grievance_submit: the form takes at most 500 grievances a day", 429, /no more grievances today/],
  ["23514", "check", 422, "check"],
  ["23503", "fk", 422, "fk"],
  ["57014", "timeout", 500, "timeout"],
])("the database's %s (%s) is answered %d", (code, message, status, words) => {
  const err = grievanceError({ code, message });
  expect(err).toBeInstanceOf(GrievanceStoreError);
  expect(err.status).toBe(status);
  expect(err.message).toEqual(typeof words === "string" ? words : expect.stringMatching(words));
});

describe("the queue", () => {
  test("open: the decision due soonest first", async () => {
    const calls: Array<[string, unknown[]]> = [];
    supabase.from.mockReturnValue(query({ data: [], error: null }, calls));
    await listGrievances("open");
    expect(calls).toEqual(expect.arrayContaining([["eq", ["state", "open"]], ["order", ["decide_due_at", { ascending: true }]], ["limit", [200]]]));
  });

  test("decided: the newest decision first; all: the newest arrival first; a ticket alone", async () => {
    const decided: Array<[string, unknown[]]> = [];
    supabase.from.mockReturnValue(query({ data: [], error: null }, decided));
    await listGrievances("decided");
    expect(decided).toEqual(expect.arrayContaining([["eq", ["state", "decided"]], ["order", ["decided_at", { ascending: false }]]]));
    const all: Array<[string, unknown[]]> = [];
    supabase.from.mockReturnValue(query({ data: [], error: null }, all));
    await listGrievances("all", "G-2026-00042");
    expect(all).toEqual(expect.arrayContaining([["eq", ["ticket", "G-2026-00042"]], ["order", ["received_at", { ascending: false }]]]));
    expect(all.some(([m, a]) => m === "eq" && a[0] === "state")).toBe(false);
  });

  test("the counts: open, late against the decision, and typed-in ones not acknowledged in time", async () => {
    const calls: Array<Array<[string, unknown[]]>> = [];
    supabase.from.mockImplementation(() => {
      const mine: Array<[string, unknown[]]> = [];
      calls.push(mine);
      return query({ count: calls.length, error: null }, mine);
    });
    const now = new Date("2026-11-20T10:00:00Z");
    expect(await countOpenGrievances(now)).toEqual({ open: 1, late: 2, ackLate: 3 });
    expect(calls[1]).toEqual(expect.arrayContaining([["lte", ["decide_due_at", now.toISOString()]]]));
    expect(calls[2]).toEqual(expect.arrayContaining([["is", ["acknowledged_at", null]], ["lte", ["ack_due_at", now.toISOString()]]]));
  });

  test("a read failure is a store error", async () => {
    supabase.from.mockReturnValue(query({ data: null, error: { code: "57014", message: "timeout" } }));
    await expect(listGrievances("open")).rejects.toMatchObject({ status: 500 });
  });
});

test("a grievance's notes keep to it, oldest first", async () => {
  const calls: Array<[string, unknown[]]> = [];
  supabase.from.mockReturnValue(query({ data: [{ id: "n-1", grievance_id: "g-1" }, { id: "n-2", grievance_id: "g-2" }], error: null }, calls));
  expect((await listGrievanceNotes("g-1")).map((n) => n.id)).toEqual(["n-1"]);
  expect(calls).toEqual(expect.arrayContaining([["order", ["created_at", { ascending: true }]]]));
});

test("staff names: only people with a name, and no read for none", async () => {
  expect(await staffNames([null, null])).toEqual(new Map());
  expect(supabase.from).not.toHaveBeenCalled();
  supabase.from.mockReturnValue(query({ data: [{ user_id: "u-1", display_name: "Asha" }, { user_id: "u-2", display_name: null }], error: null }));
  expect(await staffNames(["u-1", "u-2", "u-1"])).toEqual(new Map([["u-1", "Asha"]]));
});

test("a story by its number: in any state for an officer, published only for the form", async () => {
  const any: Array<[string, unknown[]]> = [];
  supabase.from.mockReturnValue(query({ data: { id: "s-1" }, error: null }, any));
  expect(await storyIdByNumber(12, false)).toBe("s-1");
  expect(any.some(([m, a]) => m === "eq" && a[0] === "workflow_state")).toBe(false);
  const published: Array<[string, unknown[]]> = [];
  supabase.from.mockReturnValue(query({ data: null, error: null }, published));
  expect(await storyIdByNumber(12, true)).toBeNull();
  expect(published).toEqual(expect.arrayContaining([["eq", ["public_id", 12]], ["eq", ["workflow_state", "published"]]]));
});
