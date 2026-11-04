/**
 * The activity log card. Characterization of what stays (the list, refresh, pages), then the Panel 0
 * change: no "Clear All Logs" button, because the audit log is append-only and its DELETE route is
 * gone (owner decision Q6).
 */

import { act, render, screen } from "@testing-library/react";
import ActivityLog from "./ActivityLog";
import { ThemeProvider } from "@timesprime/ui/ThemeContext";

const log = (id: string, details: string) => ({ id, action: "article.edit", details, metadata: {}, created_at: new Date().toISOString() });

beforeEach(() => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ logs: [log("r-1", "Asha: article.edit succeeded article a-1")], total: 12, page: 1, totalPages: 2 }),
  })) as unknown as typeof fetch;
});

async function renderLog() {
  await act(async () => {
    render(
      <ThemeProvider>
        <ActivityLog />
      </ThemeProvider>
    );
  });
}

test("lists the log rows from GET /api/admin/logs, ten to a page (characterization)", async () => {
  await renderLog();
  expect(screen.getByText("Asha: article.edit succeeded article a-1")).toBeInTheDocument();
  expect(screen.getByText("Activity Log (12)")).toBeInTheDocument();
  expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
  expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe("/api/admin/logs?page=1&limit=10");
});

test("an unknown action shows its own name (characterization)", async () => {
  await renderLog();
  expect(screen.getByText("article.edit")).toBeInTheDocument();
});

test("there is no way to clear the log, and nothing ever sends a DELETE (Q6)", async () => {
  await renderLog();
  expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
  expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
  const methods = (global.fetch as jest.Mock).mock.calls.map(([, init]) => (init as RequestInit | undefined)?.method ?? "GET");
  expect(methods.every((m) => m === "GET")).toBe(true);
});
