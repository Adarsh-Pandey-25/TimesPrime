/**
 * @jest-environment node
 *
 * R12-04: the server's timer starts the worker every NEWS_REFRESH_TICK_MINUTES; the job runs only
 * when the interval has passed since the last run started.
 */

import {
  isRefreshDue,
  NEWS_REFRESH_GRACE_MINUTES,
  NEWS_REFRESH_INTERVAL_MINUTES,
  NEWS_REFRESH_RUNS_PER_DAY,
  NEWS_REFRESH_TICK_MINUTES,
} from "./newsRefresh";

const MIN = 60_000;
const t0 = Date.parse("2026-11-16T10:00:00Z");

test("the approved values: every 60 minutes (24 runs a day), on a 15-minute timer, 2 minutes' grace", () => {
  expect(NEWS_REFRESH_INTERVAL_MINUTES).toBe(60);
  expect(NEWS_REFRESH_RUNS_PER_DAY).toBe(24);
  expect(NEWS_REFRESH_TICK_MINUTES).toBe(15);
  expect(NEWS_REFRESH_GRACE_MINUTES).toBe(2);
});

test("no run recorded yet: due", () => {
  expect(isRefreshDue(null, t0)).toBe(true);
});

test("on a 15-minute timer with a 60-minute interval, one tick in four runs", () => {
  const ticks = [15, 30, 45, 60].map((m) => isRefreshDue(t0, t0 + m * MIN));
  expect(ticks).toEqual([false, false, false, true]);
});

test("a timer that fires a little early still runs on the hour (the grace)", () => {
  expect(isRefreshDue(t0, t0 + 59 * MIN)).toBe(true);
  expect(isRefreshDue(t0, t0 + 57 * MIN)).toBe(false);
});

test("another interval, such as the admin setting's later, is honoured", () => {
  expect(isRefreshDue(t0, t0 + 15 * MIN, 15)).toBe(true);
  expect(isRefreshDue(t0, t0 + 60 * MIN, 120)).toBe(false);
});

test("a recorded start in the future (the clock went back) or a broken value runs at once", () => {
  expect(isRefreshDue(t0 + 30 * MIN, t0)).toBe(true);
  expect(isRefreshDue(Number.NaN, t0)).toBe(true);
});
