/**
 * @jest-environment node
 *
 * The monthly report (Panel 7 design §5, M3): the draft is grievance_month_figures and publishing is
 * grievance_report_publish, each with the month's first day; the reads; the refusals; and before
 * compliance-3 is applied, the reads say so instead of failing.
 */

jest.mock("../lib/supabase", () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

import { GrievanceStoreError } from "./grievances";
import { monthFigures, monthReports, publicReports, publishReport, reportError } from "./grievanceReports";

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
const NOT_APPLIED = { code: "42883", message: "function does not exist" };

test("the draft is grievance_month_figures for the month's first day; null before compliance-3", async () => {
  supabase.rpc.mockResolvedValue({ data: { month: "2026-11" }, error: null });
  expect(await monthFigures("2026-11")).toEqual({ month: "2026-11" });
  expect(supabase.rpc).toHaveBeenCalledWith("grievance_month_figures", { p_month: "2026-11-01" });
  supabase.rpc.mockResolvedValue({ data: null, error: NOT_APPLIED });
  expect(await monthFigures("2026-11")).toBeNull();
});

test("publishing is grievance_report_publish, with the month, who and the note", async () => {
  supabase.rpc.mockResolvedValue({ data: { id: "r-1", version: 1 }, error: null });
  expect(await publishReport("2026-11", "u-1", "A note.")).toEqual({ id: "r-1", version: 1 });
  expect(supabase.rpc).toHaveBeenCalledWith("grievance_report_publish", { p_month: "2026-11-01", p_actor: "u-1", p_note: "A note." });
  supabase.rpc.mockResolvedValue({ data: null, error: null });
  await expect(publishReport("2026-11", "u-1", null)).rejects.toMatchObject({ status: 500 });
});

test.each([
  ["55000", 409],
  ["23505", 409],
  ["23514", 422],
  ["57014", 500],
])("the database's %s is answered %d", (code, status) => {
  const err = reportError({ code, message: "m" });
  expect(err).toBeInstanceOf(GrievanceStoreError);
  expect(err.status).toBe(status);
});

test("a month's versions, newest first, with who published; null before compliance-3", async () => {
  const calls: Array<[string, unknown[]]> = [];
  supabase.from.mockReturnValue(query({ data: [], error: null }, calls));
  expect(await monthReports("2026-11")).toEqual([]);
  expect(calls).toEqual(expect.arrayContaining([["select", ["id, month, version, figures, note, published_by, published_at"]], ["eq", ["month", "2026-11-01"]], ["order", ["version", { ascending: false }]]]));
  supabase.from.mockReturnValue(query({ data: null, error: { code: "42P01", message: "relation does not exist" } }));
  expect(await monthReports("2026-11")).toBeNull();
});

test("readers' reports never name who published; empty before compliance-3; another failure throws", async () => {
  const calls: Array<[string, unknown[]]> = [];
  supabase.from.mockReturnValue(query({ data: [{ id: "r-1" }], error: null }, calls));
  expect(await publicReports()).toEqual([{ id: "r-1" }]);
  expect(calls[0]).toEqual(["select", ["id, month, version, figures, note, published_at"]]);
  expect(calls).toEqual(expect.arrayContaining([["order", ["month", { ascending: false }]], ["order", ["version", { ascending: false }]]]));
  supabase.from.mockReturnValue(query({ data: null, error: { code: "PGRST205", message: "no table" } }));
  expect(await publicReports("2026-11")).toEqual([]);
  supabase.from.mockReturnValue(query({ data: null, error: { code: "57014", message: "timeout" } }));
  await expect(publicReports()).rejects.toMatchObject({ status: 500 });
});
