/**
 * The admin dashboard's two database controls (F-014): "Sync All Categories
 * Now" (POST /api/admin/seed-supabase) and "Run 7-Day Purge Now" (POST
 * /api/admin/db-stats). The news chrome and the admin widgets are stubbed;
 * `fetch` answers each admin route as the test sets it.
 */

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush, refresh: jest.fn() }) }));
// Each widget renders its name, so a test can see which ones the dashboard shows.
jest.mock("@/components/ArticlesTable", () => ({ __esModule: true, default: () => "[ArticlesTable]" }));
jest.mock("@/components/CategoryStatsCard", () => ({ __esModule: true, default: () => "[CategoryStatsCard]" }));
jest.mock("@/components/BreakingNewsManager", () => ({ __esModule: true, default: () => "[BreakingNewsManager]" }));
jest.mock("@/components/SyncDashboard", () => ({ __esModule: true, default: () => "[SyncDashboard]" }));
jest.mock("@/components/ActivityLog", () => ({ __esModule: true, default: () => "[ActivityLog]" }));

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import AdminDashboardPage from "./page";
import { ThemeProvider } from "@timesprime/ui/ThemeContext";

type Answer = { status: number; body?: unknown } | Error;
let answers: Record<string, Answer>;

const STATS = { configured: true, totalStoredArticles: 120, retentionDays: 7, databaseType: "Supabase" };

// Panel 0: the dashboard asks /api/admin/me what the user holds and hides the rest. The F-014 tests
// below need both buttons, so their user holds sync.run and content.purge. (No real role holds
// content.purge yet: it is A for everyone until Panel 4, so in practice the purge button is hidden.)
const staffMe = (permissions: Record<string, "act" | "read">, over: object = {}) => ({
  kind: "staff",
  displayName: "Asha",
  aal: "aal2",
  roles: [{ role: "super_admin", language: null, section: null, expiresAt: "2099-01-01T00:00:00Z" }],
  permissions,
  mfa: { required: true, enrolled: true },
  ...over,
});
const EVERYTHING = staffMe({
  "sync.view": "act",
  "sync.run": "act",
  "content.purge": "act",
  "stats.view": "act",
  "breaking_banner.manage": "act",
  "article.publish_direct": "act",
  "article.create": "act",
  "article.view_admin": "act",
  "audit.read": "read",
});

beforeEach(() => {
  mockPush.mockReset();
  answers = {
    "GET /api/admin/me": { status: 200, body: EVERYTHING },
    "GET /api/admin/db-stats": { status: 200, body: { status: "success", stats: STATS } },
  };
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

// Panel 0: the dashboard shows only what /api/admin/me says the user holds. UX only: every route
// checks again on the server, which access.test.ts proves.
describe("what the dashboard shows depends on /api/admin/me (Panel 0)", () => {
  const shown = () => document.body.textContent ?? "";

  test("everything held: every widget and both controls, and who is signed in", async () => {
    await renderDashboard();
    for (const w of ["[SyncDashboard]", "[BreakingNewsManager]", "[CategoryStatsCard]", "[ArticlesTable]", "[ActivityLog]"]) expect(shown()).toContain(w);
    expect(screen.getByRole("button", { name: SYNC })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: PURGE })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Publish Article/ })).toBeInTheDocument();
    expect(shown()).toMatch(/Signed in as Asha/);
  });

  test("only stats.view: the stats, and nothing that changes anything", async () => {
    answers["GET /api/admin/me"] = { status: 200, body: staffMe({ "stats.view": "act" }) };
    await renderDashboard();
    expect(shown()).toContain("[CategoryStatsCard]");
    expect(screen.getByText("120")).toBeInTheDocument();
    for (const w of ["[SyncDashboard]", "[BreakingNewsManager]", "[ArticlesTable]", "[ActivityLog]"]) expect(shown()).not.toContain(w);
    expect(screen.queryByRole("button", { name: SYNC })).toBeNull();
    expect(screen.queryByRole("button", { name: PURGE })).toBeNull();
    expect(screen.queryByRole("button", { name: /Publish Article/ })).toBeNull();
  });

  test("without content.purge (every real role, until Panel 4) the purge button is hidden", async () => {
    const rest = Object.fromEntries(Object.entries(EVERYTHING.permissions).filter(([key]) => key !== "content.purge"));
    answers["GET /api/admin/me"] = { status: 200, body: staffMe(rest) };
    await renderDashboard();
    expect(screen.getByRole("button", { name: SYNC })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: PURGE })).toBeNull();
  });

  test("the shared password: a notice with the date it retires, and no activity log", async () => {
    answers["GET /api/admin/me"] = {
      status: 200,
      body: {
        kind: "legacy",
        displayName: "Shared admin password",
        retiresAt: "2026-12-31T18:30:00.000Z",
        permissions: { "article.view_admin": "act", "sync.run": "act", "sync.view": "act", "stats.view": "act", "breaking_banner.manage": "act", "article.publish_direct": "act", "article.create": "act" },
      },
    };
    await renderDashboard();
    expect(shown()).toMatch(/shared admin password/i);
    expect(shown()).toMatch(/1 January 2027/);
    expect(shown()).toContain("[ArticlesTable]");
    expect(shown()).not.toContain("[ActivityLog]");
  });

  test("no session (401): sent to the sign-in page", async () => {
    answers["GET /api/admin/me"] = { status: 401, body: { error: "Unauthorized: please log in." } };
    await renderDashboard();
    expect(mockPush).toHaveBeenCalledWith("/admin/login");
  });

  test("an aal1 session that still needs its code: told to finish signing in, nothing shown", async () => {
    answers["GET /api/admin/me"] = { status: 200, body: staffMe({}, { aal: "aal1" }) };
    await renderDashboard();
    expect(screen.getByRole("link", { name: /finish signing in/i })).toHaveAttribute("href", "/admin/login");
    expect(shown()).not.toContain("[CategoryStatsCard]");
  });

  test("a refusal from /me (not staff, suspended) is shown as is", async () => {
    answers["GET /api/admin/me"] = { status: 403, body: { error: "This staff account is suspended.", code: "suspended" } };
    await renderDashboard();
    expect(screen.getByRole("alert")).toHaveTextContent("This staff account is suspended.");
  });
});

describe("the access check's states", () => {
  const shown = () => document.body.textContent ?? "";

  test("loading: 'Checking your access…', announced as a status, and nothing else yet", async () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(
      <ThemeProvider>
        <AdminDashboardPage />
      </ThemeProvider>
    );
    expect(screen.getByRole("status")).toHaveTextContent("Checking your access…");
    expect(shown()).not.toContain("[ActivityLog]");
  });

  test("a network failure: its own message, as an alert, and nothing shown", async () => {
    answers["GET /api/admin/me"] = new TypeError("fetch failed") as never;
    await renderDashboard();
    expect(screen.getByRole("alert")).toHaveTextContent("Network error while loading your access.");
    expect(shown()).not.toContain("[ActivityLog]");
  });
});

test("the publish form's Category ID label names its select (Definition of done, item 10)", async () => {
  await renderDashboard();
  expect(screen.getByRole("combobox", { name: "Category ID" })).toBeInTheDocument();
});
