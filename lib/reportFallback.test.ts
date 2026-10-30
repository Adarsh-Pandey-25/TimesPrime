jest.mock("@sentry/nextjs", () => ({ captureMessage: jest.fn() }));

import { reportFallback, throttleReport, FALLBACK_REPORT_WINDOW_MS } from "./reportFallback";

const { captureMessage } = jest.requireMock("@sentry/nextjs") as { captureMessage: jest.Mock };

let clock = Date.parse("2026-10-30T00:00:00Z");
let warn: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  // A fresh window per test: the module keeps state across calls by design.
  clock += 10 * FALLBACK_REPORT_WINDOW_MS;
  jest.setSystemTime(clock);
  captureMessage.mockClear();
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  jest.useRealTimers();
});

describe("reportFallback", () => {
  test("reports the first fallback to Sentry as a warning, tagged with its kind", () => {
    expect(reportFallback("test->first", { error: "ENOTFOUND" })).toBe(true);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith("Fallback: test->first", {
      level: "warning",
      tags: { fallback: "test->first" },
      extra: { error: "ENOTFOUND", suppressedSinceLastReport: 0 },
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test("suppresses repeats inside the window, in Sentry and in the log", () => {
    reportFallback("test->repeat");
    expect(reportFallback("test->repeat")).toBe(false);
    expect(reportFallback("test->repeat")).toBe(false);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test("reports again after the window, carrying the suppressed count", () => {
    reportFallback("test->window");
    reportFallback("test->window");
    reportFallback("test->window");
    jest.setSystemTime(clock + FALLBACK_REPORT_WINDOW_MS);
    expect(reportFallback("test->window")).toBe(true);
    expect(captureMessage).toHaveBeenCalledTimes(2);
    expect(captureMessage.mock.calls[1][1].extra).toEqual({ suppressedSinceLastReport: 2 });
  });

  test("throttleReport hands its sender the suppressed count, once per window", () => {
    const send = jest.fn();
    expect(throttleReport("test:direct", send)).toBe(true);
    expect(throttleReport("test:direct", send)).toBe(false);
    expect(throttleReport("test:direct", send)).toBe(false);
    jest.setSystemTime(clock + FALLBACK_REPORT_WINDOW_MS);
    expect(throttleReport("test:direct", send)).toBe(true);
    expect(send.mock.calls).toEqual([[0], [2]]);
  });

  test("rate-limits each kind independently", () => {
    expect(reportFallback("test->a")).toBe(true);
    expect(reportFallback("test->b")).toBe(true);
    expect(captureMessage).toHaveBeenCalledTimes(2);
  });
});
