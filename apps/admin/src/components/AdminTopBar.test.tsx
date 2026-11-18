/**
 * The back office's top bar, on every page: who is signed in and as what (the owner asked, 18 Nov
 * 2026), and Sign out.
 */

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush, refresh: jest.fn() }) }));

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

test("the shared password says so", async () => {
  me = { status: 200, body: { kind: "legacy", displayName: "Admin", permissions: {}, retiresAt: "2027-01-01T00:00:00+05:30" } };
  await renderBar();
  expect(screen.getByText("Signed in with the shared admin password")).toBeInTheDocument();
});

test("Sign out ends the session and goes to the sign-in page", async () => {
  me = staff("TEST Writer", [["writer", "en"]]);
  await renderBar();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sign out" })));
  expect(calls.some(([url, init]) => url === "/api/admin/logout" && init?.method === "POST")).toBe(true);
  expect(mockPush).toHaveBeenCalledWith("/admin/login");
});
