/**
 * The admin sign-in page: a staff account (email and password), then the second factor (Panel 0).
 * The shared admin password was retired in Panel 1's M4: the page no longer offers it.
 */

const mockPush = jest.fn();
const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush, refresh: mockRefresh }) }));

import { act, fireEvent, render, screen } from "@testing-library/react";
import AdminLoginPage from "./page";
import { ThemeProvider } from "@timesprime/ui/ThemeContext";

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

const typeInto = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

// Panel 0: staff accounts sign in with email and password, then the second factor: set it up the
// first time (QR code and secret, then a code), or enter a code each time after.
describe("staff sign-in and the second factor (Panel 0)", () => {
  async function signInAsStaff(next: string) {
    answers["POST /api/admin/login"] = { status: 200, body: { status: "success", kind: "staff", next } };
    await renderPage();
    typeInto(/email/i, "asha@example.com");
    typeInto(/^password$/i, "pw");
    await submit(/^sign in$/i);
  }

  test("staff sign-in comes first; an account with nothing more to do goes to /admin", async () => {
    await signInAsStaff("done");
    expect(posted).toEqual([{ url: "/api/admin/login", body: { email: "asha@example.com", password: "pw" } }]);
    expect(mockPush).toHaveBeenCalledWith("/admin");
  });

  test("with a factor set up: a code, sent to /api/admin/mfa, then /admin", async () => {
    answers["POST /api/admin/mfa"] = { status: 200, body: { status: "success", aal: "aal2" } };
    await signInAsStaff("mfa_verify");
    expect(mockPush).not.toHaveBeenCalled();
    typeInto(/authenticator code/i, "123456");
    await submit(/^verify$/i);
    expect(posted[1]).toEqual({ url: "/api/admin/mfa", body: { action: "verify", code: "123456" } });
    expect(mockPush).toHaveBeenCalledWith("/admin");
  });

  // The owner's choice (18 Nov 2026): one sign-in page, then the page of the person's work.
  const me = (...roles: string[]) => ({
    status: 200,
    body: { kind: "staff", displayName: "Asha", aal: "aal2", roles: roles.map((role) => ({ role, language: "en", section: null, expiresAt: "2027-05-01T00:00:00Z" })), permissions: {}, mfa: { required: true, enrolled: true } },
  });

  test("a newsroom role lands on the Desk once signed in", async () => {
    answers["POST /api/admin/mfa"] = { status: 200, body: { status: "success", aal: "aal2" } };
    await signInAsStaff("mfa_verify");
    answers["GET /api/admin/me"] = me("writer");
    typeInto(/authenticator code/i, "123456");
    await submit(/^verify$/i);
    expect(mockPush).toHaveBeenCalledWith("/admin/desk");
  });

  test("the Super Admin keeps the dashboard, even holding a Desk role", async () => {
    answers["GET /api/admin/me"] = me("desk_editor", "super_admin");
    await signInAsStaff("done");
    expect(mockPush).toHaveBeenCalledWith("/admin");
  });

  test("every other role keeps the dashboard too", async () => {
    answers["GET /api/admin/me"] = me("analyst");
    await signInAsStaff("done");
    expect(mockPush).toHaveBeenCalledWith("/admin");
  });

  test("the first time: the set-up starts, the QR code and secret are shown, and the code confirms that factor", async () => {
    answers["POST /api/admin/mfa"] = { status: 200, body: { factorId: "f-new", qrCode: "data:image/svg+xml;utf-8,<svg/>", secret: "JBSWY3DP" } };
    await signInAsStaff("mfa_enroll");
    expect(posted[1]).toEqual({ url: "/api/admin/mfa", body: { action: "enroll" } });
    expect(screen.getByRole("img", { name: /qr code/i })).toBeInTheDocument();
    expect(screen.getByText("JBSWY3DP")).toBeInTheDocument();
    answers["POST /api/admin/mfa"] = { status: 200, body: { status: "success", aal: "aal2" } };
    typeInto(/authenticator code/i, "654321");
    await submit(/^verify$/i);
    expect(posted[2]).toEqual({ url: "/api/admin/mfa", body: { action: "verify", code: "654321", factorId: "f-new" } });
    expect(mockPush).toHaveBeenCalledWith("/admin");
  });

  test("a wrong code: the server's message, and the code step stays", async () => {
    await signInAsStaff("mfa_verify");
    answers["POST /api/admin/mfa"] = { status: 401, body: { error: "That code is not right. Enter the current one." } };
    typeInto(/authenticator code/i, "000000");
    await submit(/^verify$/i);
    expect(screen.getByText("That code is not right. Enter the current one.")).toBeInTheDocument();
    expect(screen.getByLabelText(/authenticator code/i)).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("arriving with a signed-in session that still owes its code goes straight to the code step", async () => {
    answers["GET /api/admin/me"] = { status: 200, body: { kind: "staff", displayName: "Asha", aal: "aal1", roles: [], permissions: {}, mfa: { required: true, enrolled: true } } };
    await renderPage();
    expect(screen.getByLabelText(/authenticator code/i)).toBeInTheDocument();
  });

  test("the retired shared password is not offered", async () => {
    await renderPage();
    expect(screen.queryByRole("button", { name: /shared admin password/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/shared password/i)).not.toBeInTheDocument();
  });

  test("a wrong email or password: the server's error is shown, and the page stays", async () => {
    answers["POST /api/admin/login"] = { status: 401, body: { error: "Incorrect email or password." } };
    await renderPage();
    typeInto(/email/i, "asha@example.com");
    typeInto(/^password$/i, "wrong");
    await submit(/^sign in$/i);
    expect(screen.getByText("Incorrect email or password.")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe("its states", () => {
  test("while the server answers: the button says so and cannot be pressed again", async () => {
    await renderPage();
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    typeInto(/email/i, "asha@example.com");
    typeInto(/^password$/i, "pw");
    await submit(/^sign in$/i);
    expect(screen.getByRole("button", { name: "Signing in..." })).toBeDisabled();
  });

  test("a network failure: its own message, as an alert, and the form stays", async () => {
    await renderPage();
    global.fetch = jest.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    typeInto(/email/i, "asha@example.com");
    typeInto(/^password$/i, "pw");
    await submit(/^sign in$/i);
    expect(screen.getByRole("alert")).toHaveTextContent("Network error. Please try again.");
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });
});
