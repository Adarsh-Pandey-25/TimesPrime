/**
 * @jest-environment node
 *
 * The corrections log (Panel 7 design §2, M2): a correction is desk_correct with its fields named;
 * readers read corrections_log; the back office reads the table; and before compliance-2 is
 * applied, the reads say so instead of failing.
 */

jest.mock("../lib/supabase", () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

import { correctionError, correctionsForGrievance, listCorrections, publicCorrections, publishCorrection } from "./corrections";
import { DeskStoreError } from "./stories";

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

test("a correction is desk_correct, with its fields named", async () => {
  supabase.rpc.mockResolvedValue({ data: { id: "c-1" }, error: null });
  await publishCorrection({ storyId: "s-1", actorId: "u-1", actorLabel: "staff:u-1", kind: "update", text: "Updated the toll.", grievanceId: "g-1" });
  expect(supabase.rpc).toHaveBeenCalledWith("desk_correct", { p_story: "s-1", p_actor: "u-1", p_actor_label: "staff:u-1", p_kind: "update", p_text: "Updated the toll.", p_grievance: "g-1" });
  supabase.rpc.mockResolvedValue({ data: null, error: null });
  await expect(publishCorrection({ storyId: "s-1", actorId: "u-1", actorLabel: "x", kind: "update", text: "x", grievanceId: null })).rejects.toMatchObject({ status: 500 });
});

test.each([
  ["40001", 409],
  ["23503", 422],
  ["23514", 422],
  ["57014", 500],
])("the database's %s is answered %d", (code, status) => {
  const err = correctionError({ code, message: "m" });
  expect(err).toBeInstanceOf(DeskStoreError);
  expect(err.status).toBe(status);
});

describe("the readers' log", () => {
  test("corrections_log, all stories' or one's, with the story's number as a number", async () => {
    supabase.rpc.mockResolvedValue({ data: [{ id: "c-1", public_id: "42", story_live: true }, { id: "c-2", public_id: null, story_live: false }], error: null });
    expect(await publicCorrections({ limit: 30 })).toEqual([
      { id: "c-1", public_id: 42, story_live: true },
      { id: "c-2", public_id: null, story_live: false },
    ]);
    expect(supabase.rpc).toHaveBeenCalledWith("corrections_log", { p_story: null, p_before: null, p_limit: 30 });
    await publicCorrections({ storyId: "s-1", before: "2026-11-21T06:00:00.000Z", limit: 100 });
    expect(supabase.rpc).toHaveBeenLastCalledWith("corrections_log", { p_story: "s-1", p_before: "2026-11-21T06:00:00.000Z", p_limit: 100 });
  });

  test("null before compliance-2 is applied; another failure throws", async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    expect(await publicCorrections({ limit: 30 })).toBeNull();
    supabase.rpc.mockResolvedValue({ data: null, error: { code: "57014", message: "timeout" } });
    await expect(publicCorrections({ limit: 30 })).rejects.toMatchObject({ status: 500 });
  });
});

describe("the back office's reads", () => {
  test("the log, newest first, paged by time; null before compliance-2", async () => {
    const calls: Array<[string, unknown[]]> = [];
    supabase.from.mockReturnValue(query({ data: [], error: null }, calls));
    expect(await listCorrections(50, "2026-11-21T06:00:00.000Z")).toEqual([]);
    expect(calls).toEqual(
      expect.arrayContaining([
        ["lt", ["published_at", "2026-11-21T06:00:00.000Z"]],
        ["order", ["published_at", { ascending: false }]],
        ["limit", [50]],
      ])
    );
    supabase.from.mockReturnValue(query({ data: null, error: { code: "42P01", message: "relation does not exist" } }));
    expect(await listCorrections(50)).toBeNull();
  });

  test("a grievance's corrections keep to it; none before compliance-2", async () => {
    supabase.from.mockReturnValue(query({ data: [{ id: "c-1", grievance_id: "g-1" }, { id: "c-2", grievance_id: "g-2" }], error: null }));
    expect((await correctionsForGrievance("g-1")).map((c) => c.id)).toEqual(["c-1"]);
    supabase.from.mockReturnValue(query({ data: null, error: { code: "42P01", message: "relation does not exist" } }));
    expect(await correctionsForGrievance("g-1")).toEqual([]);
  });
});
