/**
 * The back office's top bar, on every page: who is signed in and as what (the owner asked, 18 Nov
 * 2026), and Sign out.
 */

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush, refresh: jest.fn() }), usePathname: () => "/admin" }));

import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@timesprime/ui/ThemeContext";
import AdminTopBar from "./AdminTopBar";

let me: { status: number; body: unknown };
let calls: Array<[string, RequestInit | undefined]>;

beforeEach(() => {
  mockPush.mockReset();
  calls = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push([url, init]);
    const answer = url === "/api/admin/me" ? me : { status: 200, body: { status: "success" } };
    return { ok: answer.status >= 200 && answer.status < 300, status: answer.status, json: async () => answer.body };
  }) as unknown as typeof fetch;
});

async function renderBar() {
  await act(async () => {
    render(
      <ThemeProvider>
        <AdminTopBar />
      </ThemeProvider>
    );
  });
}

const staff = (displayName: string, roles: Array<[string, string | null]>) => ({
  status: 200,
  body: {
    kind: "staff", displayName, aal: "aal2", permissions: {}, mfa: { required: true, enrolled: true },
    roles: roles.map(([role, language]) => ({ role, language, section: null, expiresAt: "2027-05-01T00:00:00Z" })),
  },
});

test("the Super Admin who is also a Desk Editor: their name, then their roles and desks", async () => {
  me = staff("Adarsh Pandey", [["super_admin", null], ["desk_editor", "en"], ["desk_editor", "hi"]]);
  await renderBar();
  expect(screen.getByText("Signed in as Adarsh Pandey")).toBeInTheDocument();
  expect(screen.getByText("Super Admin · Desk Editor (English, Hindi)")).toBeInTheDocument();
});

test("a Writer sees that they are the Writer", async () => {
  me = staff("TEST Writer", [["writer", "en"]]);
  await renderBar();
  expect(screen.getByText("Signed in as TEST Writer")).toBeInTheDocument();
  expect(screen.getByText("Writer (English)")).toBeInTheDocument();
});

test("Sign out ends the session and goes to the sign-in page", async () => {
  me = staff("TEST Writer", [["writer", "en"]]);
  await renderBar();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sign out" })));
  expect(calls.some(([url, init]) => url === "/api/admin/logout" && init?.method === "POST")).toBe(true);
  expect(mockPush).toHaveBeenCalledWith("/admin/login");
});

// Panel 1: People, for holders of user.manage (a Super Admin asks, a Managing Editor acts).
test("People is offered to a holder of user.manage, and to nobody else", async () => {
  me = { ...staff("Adarsh Pandey", [["super_admin", null]]), body: { ...staff("Adarsh Pandey", [["super_admin", null]]).body, permissions: { "user.manage": "ask" } } };
  await renderBar();
  expect(screen.getByRole("link", { name: "People" })).toHaveAttribute("href", "/admin/people");
});

test("a Writer is not offered People", async () => {
  me = staff("TEST Writer", [["writer", "en"]]);
  await renderBar();
  expect(screen.queryByRole("link", { name: "People" })).not.toBeInTheDocument();
});

// Panel 3, M2: the Front page, for holders of homepage.curate or breaking_banner.manage.
test("the Front page is offered to whoever arranges the front page or runs the banner, and to nobody else", async () => {
  const editor = staff("Meera", [["desk_editor", "hi"]]);
  for (const permissions of [{ "homepage.curate": "act" }, { "breaking_banner.manage": "act" }]) {
    me = { ...editor, body: { ...editor.body, permissions } };
    await renderBar();
    expect(screen.getAllByRole("link", { name: "Front page" }).at(-1)).toHaveAttribute("href", "/admin/front-page");
  }
});

test("a Writer is not offered the Front page", async () => {
  me = staff("TEST Writer", [["writer", "en"]]);
  await renderBar();
  expect(screen.queryByRole("link", { name: "Front page" })).not.toBeInTheDocument();
});

// Panel 7, M1: Compliance, for holders of grievance.handle: the Grievance Officer and Legal act, the
// Managing Editor reads.
test("Compliance is offered to whoever holds grievance.handle, to act or to read, and to nobody else", async () => {
  for (const [role, access] of [["grievance_officer", "act"], ["managing_editor", "read"]] as const) {
    const person = staff("Meera", [[role, null]]);
    me = { ...person, body: { ...person.body, permissions: { "grievance.handle": access } } };
    await renderBar();
    expect(screen.getAllByRole("link", { name: "Compliance" }).at(-1)).toHaveAttribute("href", "/admin/compliance");
  }
});

test("a Writer is not offered Compliance", async () => {
  me = staff("TEST Writer", [["writer", "en"]]);
  await renderBar();
  expect(screen.queryByRole("link", { name: "Compliance" })).not.toBeInTheDocument();
});

// Panel 1, M3: a Super Admin sees emergency access in use, and a review that is due, on every page.
describe("the Super Admins' alerts", () => {
  const superAdminMe = () => ({ ...staff("Adarsh Pandey", [["super_admin", null]]), body: { ...staff("Adarsh Pandey", [["super_admin", null]]).body, permissions: { "user.manage": "ask", "role.assign": "ask" } } });
  const answer = (alerts: unknown) => {
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      const a = url === "/api/admin/me" ? me : url === "/api/admin/people/alerts" ? { status: 200, body: alerts } : { status: 200, body: {} };
      return { ok: a.status >= 200 && a.status < 300, status: a.status, json: async () => a.body };
    }) as unknown as typeof fetch;
  };

  test("emergency access in use is a red alert across the top", async () => {
    me = superAdminMe();
    answer({ breakGlass: [{ assignmentId: "bg", userId: "u-7", name: "Vivek", since: "2026-11-19T18:00:00Z", until: "2026-11-19T20:00:00Z", reason: "Court order.", mine: false }], review: null, endingSoon: [] });
    await renderBar();
    expect(screen.getByRole("alert")).toHaveTextContent("Emergency access is on: Vivek, until");
    expect(screen.getByRole("alert")).toHaveTextContent("Reason: Court order.");
  });

  test("a review that is due is a reminder with the way to it", async () => {
    me = superAdminMe();
    answer({ breakGlass: [], review: { lastAt: null, lastByName: null, dueAt: "2026-11-19T00:00:00Z", overdue: true }, endingSoon: [] });
    await renderBar();
    expect(screen.getByText(/The access review is due/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start it" })).toHaveAttribute("href", "/admin/people/review");
  });

  test("anyone else is not asked for alerts", async () => {
    me = staff("TEST Writer", [["writer", "en"]]);
    await renderBar();
    expect(calls.some(([url]) => url === "/api/admin/people/alerts")).toBe(false);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
