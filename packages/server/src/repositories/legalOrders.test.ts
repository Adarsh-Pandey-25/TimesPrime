/**
 * @jest-environment node
 *
 * The legal-orders register (Panel 7 design §2, M4): the list's orders, entering an order, a change
 * that names who and when and never touches a closed order, actions, and the refusals.
 */

jest.mock("../lib/supabase", () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

import { GrievanceStoreError } from "./grievances";
import { addLegalOrderAction, createLegalOrder, legalOrderError, listLegalOrderActions, listLegalOrders, updateLegalOrder } from "./legalOrders";

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

const FIELDS = {
  reference: "W.P.(C) 1234/2026", authorityType: "court" as const, authority: "Delhi High Court", orderDate: "2026-11-19", receivedAt: "2026-11-20T10:00:00.000Z",
  receivedVia: "email" as const, asks: ["remove_or_block" as const], summary: "Take it down.", dueAt: null, originalKeptAt: "Legal's drive", storyAddresses: [],
};

test("the register: not closed by deadline, the undated last; or all, newest first; null before compliance-4", async () => {
  const open: Array<[string, unknown[]]> = [];
  supabase.from.mockReturnValue(query({ data: [], error: null }, open));
  await listLegalOrders("open");
  expect(open).toEqual(expect.arrayContaining([["neq", ["status", "closed"]], ["order", ["due_at", { ascending: true, nullsFirst: false }]]]));
  const all: Array<[string, unknown[]]> = [];
  supabase.from.mockReturnValue(query({ data: [], error: null }, all));
  await listLegalOrders("all");
  expect(all).toEqual(expect.arrayContaining([["order", ["received_at", { ascending: false }]]]));
  supabase.from.mockReturnValue(query({ data: null, error: { code: "42P01", message: "no table" } }));
  expect(await listLegalOrders("open")).toBeNull();
});

test("entering an order inserts its fields, the stories' ids and who entered it", async () => {
  const calls: Array<[string, unknown[]]> = [];
  supabase.from.mockReturnValue(query({ data: { id: "o-1" }, error: null }, calls));
  await createLegalOrder(FIELDS, ["s-1"], "u-1");
  expect(calls.find(([m]) => m === "insert")?.[1][0]).toEqual({
    reference: "W.P.(C) 1234/2026", authority_type: "court", authority: "Delhi High Court", order_date: "2026-11-19", received_at: "2026-11-20T10:00:00.000Z",
    received_via: "email", asks: ["remove_or_block"], summary: "Take it down.", story_ids: ["s-1"], due_at: null, original_kept_at: "Legal's drive", created_by: "u-1",
  });
});

test("a change names who and when, and only an order not closed; a closed one is 409", async () => {
  const calls: Array<[string, unknown[]]> = [];
  supabase.from.mockReturnValue(query({ data: { id: "o-1", status: "complied" }, error: null }, calls));
  await updateLegalOrder("o-1", { status: "complied" }, "u-1");
  const update = calls.find(([m]) => m === "update")?.[1][0] as Record<string, unknown>;
  expect(update).toMatchObject({ status: "complied", updated_by: "u-1" });
  expect(typeof update.updated_at).toBe("string");
  expect(calls).toEqual(expect.arrayContaining([["eq", ["id", "o-1"]], ["neq", ["status", "closed"]]]));
  supabase.from.mockReturnValue(query({ data: null, error: null }));
  await expect(updateLegalOrder("o-1", { status: "open" }, "u-1")).rejects.toMatchObject({ status: 409 });
});

test("actions: added with who, listed oldest first and kept to their order", async () => {
  const calls: Array<[string, unknown[]]> = [];
  supabase.from.mockReturnValue(query({ data: { id: "a-1" }, error: null }, calls));
  await addLegalOrderAction("o-1", "Replied to the court.", "u-1");
  expect(calls.find(([m]) => m === "insert")?.[1][0]).toEqual({ order_id: "o-1", body: "Replied to the court.", author_id: "u-1" });
  supabase.from.mockReturnValue(query({ data: [{ id: "a-1", order_id: "o-1" }, { id: "a-2", order_id: "o-2" }], error: null }));
  expect((await listLegalOrderActions("o-1")).map((a) => a.id)).toEqual(["a-1"]);
});

test.each([
  [{ code: "P0001", message: "legal_orders: order o-1 is closed" }, 409],
  [{ code: "23514", message: "check" }, 422],
  [{ code: "57014", message: "timeout" }, 500],
])("the database's refusal %j is answered %d", (error, status) => {
  const err = legalOrderError(error);
  expect(err).toBeInstanceOf(GrievanceStoreError);
  expect(err.status).toBe(status);
});
