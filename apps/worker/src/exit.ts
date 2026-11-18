// How the worker ends a run. The exit code is set, not forced: on Windows, process.exit() right
// after a fetch crashes Node as it closes ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)",
// libuv's src\win\async.c; the owner met it on 18 Nov 2026, and the job then reported a failure
// though its work was done). Node exits by itself once nothing is left to do; if something still
// keeps it alive, it is made to exit after FORCE_EXIT_MS, by a timer that itself keeps nothing alive.

export const FORCE_EXIT_MS = 10_000;

type Exiting = Pick<NodeJS.Process, "exit"> & { exitCode?: number | string | null };

export function finishRun(code: number, proc: Exiting = process): void {
  proc.exitCode = code;
  setTimeout(() => proc.exit(code), FORCE_EXIT_MS).unref();
}
