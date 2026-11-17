/**
 * @jest-environment node
 *
 * R12-04: the server's timer starts the worker every NEWS_REFRESH_TICK_MINUTES; the job runs only
 * when the interval has passed since the last run started.
 */

import {
  ADMIN_SYNC_CALLS,
  isRefreshDue,
  NEWSDATA_FREE_PLAN_DAILY_CALLS,
  NEWSDATA_PLAN_CEILING,
  NEWSDATA_PLAN_DAILY_CALLS,
  refreshCallsPerDay,
  withinNewsDataPlan,
  NEWS_REFRESH_GRACE_MINUTES,
  NEWS_REFRESH_INTERVAL_MINUTES,
  NEWS_REFRESH_RUNS_PER_DAY,
  NEWS_REFRESH_TICK_MINUTES,
} from "./newsRefresh";

const MIN = 60_000;
const t0 = Date.parse("2026-11-16T10:00:00Z");

// The owner, 17 Nov 2026: every 2 hours while the site runs on NewsData's free plan.
test("the approved values: every 120 minutes (12 runs a day), on a 15-minute timer, 2 minutes' grace", () => {
  expect(NEWS_REFRESH_INTERVAL_MINUTES).toBe(120);
  expect(NEWS_REFRESH_RUNS_PER_DAY).toBe(12);
  expect(NEWS_REFRESH_TICK_MINUTES).toBe(15);
  expect(NEWS_REFRESH_GRACE_MINUTES).toBe(2);
});

test("no run recorded yet: due", () => {
  expect(isRefreshDue(null, t0)).toBe(true);
});

test("on a 15-minute timer with a 120-minute interval, one tick in eight runs", () => {
  const ticks = [15, 30, 45, 60, 75, 90, 105, 120].map((m) => isRefreshDue(t0, t0 + m * MIN));
  expect(ticks).toEqual([false, false, false, false, false, false, false, true]);
});

test("a timer that fires a little early still runs on time (the grace)", () => {
  expect(isRefreshDue(t0, t0 + 119 * MIN)).toBe(true);
  expect(isRefreshDue(t0, t0 + 117 * MIN)).toBe(false);
});

test("another interval, such as the admin setting's later, is honoured", () => {
  expect(isRefreshDue(t0, t0 + 15 * MIN, 15)).toBe(true);
  expect(isRefreshDue(t0, t0 + 60 * MIN, 120)).toBe(false);
});

test("a recorded start in the future (the clock went back) or a broken value runs at once", () => {
  expect(isRefreshDue(t0 + 30 * MIN, t0)).toBe(true);
  expect(isRefreshDue(Number.NaN, t0)).toBe(true);
});

// R12-05: the NewsData plan the refresh must stay inside, 70% of the Basic plan.
describe("calls a day against the plan", () => {
  test("the Basic plan, about 666 calls a day, and a 70% ceiling (about 466)", () => {
    expect(NEWSDATA_PLAN_DAILY_CALLS).toBe(666);
    expect(NEWSDATA_PLAN_CEILING).toBe(0.7);
  });

  test.each([
    ["the senior's figure, once Basic is bought: 14 calls a run every 60 minutes", 60, 14, 336, true],
    ["the free plan for now: 14 calls a run every 120 minutes", 120, 14, 168, true],
    ["option (c): 4 calls a run every 15 minutes", 15, 4, 384, true],
    ["option (c) every 30 minutes", 30, 4, 192, true],
    ["14 calls a run every 15 minutes: over the ceiling", 15, 14, 1344, false],
    ["14 calls a run every 30 minutes: over the ceiling", 30, 14, 672, false],
  ])("%s: %d-minute interval, %d a run = %d a day", (_label, interval, perRun, perDay, ok) => {
    expect(refreshCallsPerDay(interval, perRun)).toBe(perDay);
    expect(withinNewsDataPlan(interval, perRun)).toBe(ok);
  });
});

// The owner, 17 Nov 2026: the site starts on NewsData's free plan, 200 calls a day.
test("on the free plan the refresh leaves room for four of the back office's syncs, not five", () => {
  expect(NEWSDATA_FREE_PLAN_DAILY_CALLS).toBe(200);
  expect(ADMIN_SYNC_CALLS).toBe(7);
  const refresh = refreshCallsPerDay(NEWS_REFRESH_INTERVAL_MINUTES, 14);
  expect(refresh).toBe(168);
  expect(refresh + 4 * ADMIN_SYNC_CALLS).toBeLessThanOrEqual(NEWSDATA_FREE_PLAN_DAILY_CALLS);
  expect(refresh + 5 * ADMIN_SYNC_CALLS).toBeGreaterThan(NEWSDATA_FREE_PLAN_DAILY_CALLS);
});
