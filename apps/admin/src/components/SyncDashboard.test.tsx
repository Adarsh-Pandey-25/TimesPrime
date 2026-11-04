/**
 * The sync dashboard's schedule text: the last sync, the "next sync" estimate (last sync plus the
 * refresh interval) and the "Auto-sync: Every N minutes" line. Characterization before R1-03 moves
 * the interval to the one config value.
 */

import { act, render, screen } from "@testing-library/react";
import SyncDashboard from "./SyncDashboard";
import { ThemeProvider } from "@timesprime/ui/ThemeContext";

const NOW = Date.parse("2026-11-04T10:00:00Z");

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ totalArticles: 1200, todayArticles: 40, lastSyncAt: new Date(NOW - 10 * 60_000).toISOString() }),
  })) as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
});

async function renderDashboard() {
  await act(async () => {
    render(
      <ThemeProvider>
        <SyncDashboard />
      </ThemeProvider>
    );
  });
}

test("a sync 10 minutes ago: the next is due in 20, on a 30-minute schedule (characterization)", async () => {
  await renderDashboard();
  expect(screen.getByText("10 min ago")).toBeInTheDocument();
  expect(screen.getByText("in 20 mins")).toBeInTheDocument();
  expect(screen.getByText("Auto-sync: Every 30 minutes")).toBeInTheDocument();
  expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe("/api/admin/stats");
});

test("a sync more than one interval ago is due now (characterization)", async () => {
  (global.fetch as jest.Mock).mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ totalArticles: 1, todayArticles: 0, lastSyncAt: new Date(NOW - 45 * 60_000).toISOString() }),
  }));
  await renderDashboard();
  expect(screen.getByText("Due now")).toBeInTheDocument();
});
