/**
 * The admin sign-in page. Characterization first: today it has one field, the shared password,
 * posted to /api/admin/login. Panel 0 adds staff accounts and the second factor next to it.
 */

const mockPush = jest.fn();
const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush, refresh: mockRefresh }) }));

import { act, fireEvent, render, screen } from "@testing-library/react";
import AdminLoginPage from "./AdminLoginView";
import { ThemeProvider } from "@/frontend/context/ThemeContext";

type Answer = { status: number; body?: unknown };
let answers: Record<string, Answer>;
let posted: Array<{ url: string; body: unknown }>;

beforeEach(() => {
  mockPush.mockReset();
  mockRefresh.mockReset();
  posted = [];
  answers = {};
  global.fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    if (method === "POST") posted.push({ url, body: JSON.parse(String(init.body ?? "{}")) });
    const answer = answers[`${method} ${url}`] ?? { status: 401, body: { error: "Unauthorized: please log in." } };
    return { ok: answer.status >= 200 && answer.status < 300, status: answer.status, json: async () => answer.body };
  }) as unknown as typeof fetch;
});

async function renderPage() {
  await act(async () => {
    render(
      <ThemeProvider>
        <AdminLoginPage />
      </ThemeProvider>
    );
  });
}

async function submit(button: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: button }));
  });
}

// The original page's label was not tied to its input, so the characterization finds the field by type.
const typePassword = (value: string) => {
  const field = document.querySelector('input[type="password"]');
  if (!field) throw new Error("no password field");
  fireEvent.change(field, { target: { value } });
};

describe("the shared password (characterization)", () => {
  async function openSharedPassword() {
    await renderPage();
    const toggle = screen.queryByRole("button", { name: /shared admin password/i });
    if (toggle) await act(async () => void fireEvent.click(toggle));
  }

  test("posts the password to /api/admin/login and goes to /admin on success", async () => {
    answers["POST /api/admin/login"] = { status: 200, body: { status: "success" } };
    await openSharedPassword();
    typePassword("correct horse");
    await submit(/^sign in$/i);
    expect(posted).toEqual([{ url: "/api/admin/login", body: { password: "correct horse" } }]);
    expect(mockPush).toHaveBeenCalledWith("/admin");
  });

  test("shows the server's error and stays", async () => {
    answers["POST /api/admin/login"] = { status: 401, body: { error: "Incorrect password." } };
    await openSharedPassword();
    typePassword("wrong");
    await submit(/^sign in$/i);
    expect(screen.getByText("Incorrect password.")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
