/**
 * The admin dashboard's two database controls (F-014): "Sync All Categories
 * Now" (POST /api/admin/seed-supabase) and "Run 7-Day Purge Now" (POST
 * /api/admin/db-stats). The news chrome and the admin widgets are stubbed;
 * `fetch` answers each admin route as the test sets it.
 */

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));
jest.mock("@/frontend/features/news", () => ({ Header: () => null, Footer: () => null, MarqueeTicker: () => null }));
jest.mock("@/frontend/features/admin", () => ({
  ArticlesTable: () => null,
  CategoryStatsCard: () => null,
  BreakingNewsManager: () => null,
  SyncDashboard: () => null,
  ActivityLog: () => null,
}));

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import AdminDashboardPage from "./AdminView";
import { ThemeProvider } from "@/frontend/context/ThemeContext";

type Answer = { status: number; body?: unknown } | Error;
let answers: Record<string, Answer>;

const STATS = { configured: true, totalStoredArticles: 120, retentionDays: 7, databaseType: "Supabase" };

beforeEach(() => {
  answers = { "GET /api/admin/db-stats": { status: 200, body: { status: "success", stats: STATS } } };
  global.fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    const answer = answers[`${init.method ?? "GET"} ${url}`] ?? { status: 404, body: {} };
    if (answer instanceof Error) throw answer;
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      json: async () => {
        if (typeof answer.body === "string") throw new SyntaxError("Unexpected token '<'");
        return answer.body;
      },
    };
  }) as unknown as typeof fetch;
});

async function renderDashboard() {
  await act(async () => {
    render(
      <ThemeProvider>
        <AdminDashboardPage />
      </ThemeProvider>
    );
  });
}

async function click(name: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

const SYNC = /Sync All Categories Now/;
const PURGE = /Run 7-Day Purge Now/;

describe("the sync and purge buttons on success (characterization, F-014)", () => {
  test("sync shows the server's message and posts to /api/admin/seed-supabase", async () => {
    answers["POST /api/admin/seed-supabase"] = { status: 200, body: { status: "success", message: "Synced 14 categories." } };
    await renderDashboard();
    await click(SYNC);
    expect(screen.getByText("Synced 14 categories.")).toBeInTheDocument();
    expect((global.fetch as jest.Mock).mock.calls).toContainEqual(["/api/admin/seed-supabase", { method: "POST", credentials: "include" }]);
  });

  test("sync without a message shows the default", async () => {
    answers["POST /api/admin/seed-supabase"] = { status: 200, body: { status: "success" } };
    await renderDashboard();
    await click(SYNC);
    expect(screen.getByText("All news categories synchronized to Supabase!")).toBeInTheDocument();
  });

  test("purge shows the server's message and the new stats", async () => {
    answers["POST /api/admin/db-stats"] = {
      status: 200,
      body: { status: "success", message: "Purged 12 articles.", stats: { ...STATS, totalStoredArticles: 108 } },
    };
    await renderDashboard();
    await click(PURGE);
    expect(screen.getByText("Purged 12 articles.")).toBeInTheDocument();
    expect(screen.getByText("108")).toBeInTheDocument();
  });

  test("purge without a message shows the default", async () => {
    answers["POST /api/admin/db-stats"] = { status: 200, body: { status: "success", stats: STATS } };
    await renderDashboard();
    await click(PURGE);
    expect(screen.getByText("7-Day Purge completed!")).toBeInTheDocument();
  });
});

// The sync and purge buttons said they had succeeded when the request threw
// ("News synchronization request sent.", "Purge operation complete.") and
// said nothing at all on an error status. Success now needs res.ok; any other
// outcome shows the real error.
describe("the sync and purge buttons on failure (F-014)", () => {
  const SUCCESS = /synchroniz|Purge (operation )?complete|Purge completed|request sent/i;

  test.each([
    [SYNC, "POST /api/admin/seed-supabase", "sync"],
    [PURGE, "POST /api/admin/db-stats", "purge"],
  ])("%s", async (button, route, name) => {
    const cases: Array<[Answer, string]> = [
      [{ status: 500, body: { status: "error", message: "NEWSDATA_API_KEY is not configured on the server." } }, "NEWSDATA_API_KEY is not configured on the server."],
      [{ status: 401, body: { error: "Unauthorized" } }, "Unauthorized"],
      [{ status: 504, body: "<html>Gateway Timeout</html>" }, `${name === "sync" ? "Sync" : "Purge"} failed (status 504).`],
      [new TypeError("Failed to fetch"), `${name === "sync" ? "Sync" : "Purge"} failed: Failed to fetch`],
    ];
    for (const [answer, message] of cases) {
      answers[route] = answer;
      await renderDashboard();
      await click(button);
      expect(screen.getByRole("alert")).toHaveTextContent(message);
      expect(document.body.textContent).not.toMatch(SUCCESS);
      cleanup();
    }
  });

  test("a success after a failure replaces the error", async () => {
    answers["POST /api/admin/db-stats"] = new TypeError("Failed to fetch");
    await renderDashboard();
    await click(PURGE);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    answers["POST /api/admin/db-stats"] = { status: 200, body: { status: "success", message: "Purged 3 articles.", stats: STATS } };
    await click(PURGE);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Purged 3 articles.")).toBeInTheDocument();
  });
});
