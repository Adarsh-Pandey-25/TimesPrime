/**
 * @jest-environment node
 *
 * How the worker ends a run: it sets the exit code and lets Node exit by itself (process.exit right
 * after a fetch crashes Node on Windows), and forces the exit only if something keeps it alive.
 */

import { FORCE_EXIT_MS, finishRun } from "./exit";

afterEach(() => jest.useRealTimers());

test("the exit code is set at once, and nothing forces the exit then", () => {
  jest.useFakeTimers();
  const proc = { exitCode: undefined as number | undefined, exit: jest.fn() };
  finishRun(1, proc as never);
  expect(proc.exitCode).toBe(1);
  expect(proc.exit).not.toHaveBeenCalled();
});

test("if Node is still alive after FORCE_EXIT_MS, the run is made to end, with the same code", () => {
  jest.useFakeTimers();
  const proc = { exitCode: undefined as number | undefined, exit: jest.fn() };
  finishRun(2, proc as never);
  jest.advanceTimersByTime(FORCE_EXIT_MS - 1);
  expect(proc.exit).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(proc.exit).toHaveBeenCalledWith(2);
});

test("the timer keeps nothing alive itself", () => {
  const unref = jest.fn();
  const spy = jest.spyOn(global, "setTimeout").mockReturnValue({ unref } as unknown as NodeJS.Timeout);
  finishRun(0, { exitCode: undefined, exit: jest.fn() } as never);
  expect(unref).toHaveBeenCalled();
  spy.mockRestore();
});
