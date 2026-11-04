/**
 * @jest-environment node
 *
 * The error boundaries' reporter (R1-07): registered once by instrumentation-client.ts, reachable
 * from every copy of this module, and the console when none is registered.
 */

afterEach(() => {
  delete (globalThis as Record<string, unknown>).__timesprimeReportClientError;
  jest.resetModules();
  jest.restoreAllMocks();
});

test("a registered reporter receives the error", async () => {
  const { registerClientErrorReporter, reportClientError } = await import("./clientErrorReport");
  const report = jest.fn();
  registerClientErrorReporter(report);
  const error = new Error("boom");
  reportClientError(error);
  expect(report).toHaveBeenCalledWith(error);
});

test("a second copy of the module (another chunk's) reaches the same reporter", async () => {
  const first = await import("./clientErrorReport");
  const report = jest.fn();
  first.registerClientErrorReporter(report);
  jest.resetModules();
  const second = await import("./clientErrorReport");
  expect(second).not.toBe(first);
  second.reportClientError("from another chunk");
  expect(report).toHaveBeenCalledWith("from another chunk");
});

test("with no reporter, the console", async () => {
  const { reportClientError } = await import("./clientErrorReport");
  const error = jest.spyOn(console, "error").mockImplementation(() => {});
  reportClientError("nothing registered");
  expect(error).toHaveBeenCalledWith("nothing registered");
});
