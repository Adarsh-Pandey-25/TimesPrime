/**
 * The admin sign-in page. Characterization first: today it has one field, the shared password,
 * posted to /api/admin/login. Panel 0 adds staff accounts and the second factor next to it.
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

  test("the shared password stays one click away (no lockout)", async () => {
    await renderPage();
    expect(screen.getByRole("button", { name: /shared admin password/i })).toBeInTheDocument();
  });
});
