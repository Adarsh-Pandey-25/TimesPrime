/**
 * Panel 1's M2b screens (design §4): adding a person, the one-time link (shown once, with its
 * warnings), a password link and a lost factor's reset on a person's page, the link an approver
 * gets, and the welcome page a link opens. The server decides every step; these tests check the
 * screens follow its answers.
 */

// A stable router, as Next's is: a new object each render would re-run every effect that lists it.
const mockRouter = { push: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter, useParams: () => ({ id: "p-1" }) }));

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import AddPerson from "./AddPerson";
import PeopleDirectory from "./PeopleDirectory";
import PersonDetail from "./PersonDetail";
import WelcomeFlow from "./WelcomeFlow";

type Route = (url: string, init?: RequestInit) => { status: number; body: unknown } | undefined;
let sent: Array<[string, RequestInit | undefined]>;
function serve(route: Route) {
  sent = [];
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push([String(input), init]);
    const answer = route(String(input), init) ?? { status: 404, body: { error: "not found" } };
    return { ok: answer.status >= 200 && answer.status < 300, status: answer.status, json: async () => answer.body };
  }) as unknown as typeof fetch;
}
const posted = (path: string) => sent.filter(([u, init]) => u === path && init?.method && init.method !== "GET").map(([, init]) => JSON.parse(String(init?.body ?? "{}")));

const meWith = (roleAssign: "act" | "ask" | null) => ({
  kind: "staff",
  displayName: "Asha",
  aal: "aal2",
  roles: [],
  mfa: { required: true, enrolled: true },
  permissions: roleAssign ? { "user.manage": roleAssign, "role.assign": roleAssign } : {},
});
const SUPER = { userId: "u-1", asks: true, scopes: [], grantable: ["super_admin", "managing_editor", "desk_editor", "sub_editor", "writer"] };
const MANAGING = { userId: "u-2", asks: false, scopes: [{ language: "hi", section: null }], grantable: ["desk_editor", "sub_editor", "writer"] };
const RAVI = { userId: "p-1", name: "Ravi", status: "active", email: "ravi@example.com", hasFactor: true, lastSignInAt: null, createdAt: "2026-11-19T09:00:00Z", roles: [] };
const detail = (can: Record<string, unknown>, caller: object = SUPER) => ({
  person: RAVI,
  assignments: [],
  requests: [],
  history: null,
  can: { rename: null, suspend: null, reactivate: null, signOut: null, grant: null, passwordLink: null, mfaReset: null, roles: {}, ...can },
  caller,
});
const fill = (name: string | RegExp, value: string) => fireEvent.change(screen.getByRole("textbox", { name }), { target: { value } });

describe("adding a person", () => {
  test("a Managing Editor adds a Writer and gets the one-time link, once, with its warnings", async () => {
    serve((url) => {
      if (url === "/api/admin/me") return { status: 200, body: meWith("act") };
      if (url === "/api/admin/people") return { status: 201, body: { person: { userId: "p-9" }, link: "/admin/welcome?token_hash=T0K&type=recovery" } };
    });
    await act(async () => render(<AddPerson />));
    const roles = within(await screen.findByRole("combobox", { name: "Role" })).getAllByRole("option").map((o) => o.textContent);
    expect(roles).toEqual(["Desk Editor", "Sub-editor", "Writer"]);
    fill("Email", "neha@example.com");
    fill("Name", "Neha");
    fill("Reason", "Joins sports.");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add" })));
    expect(posted("/api/admin/people")).toEqual([{ email: "neha@example.com", display_name: "Neha", role: "writer", language: "hi", section: null, days: 180, reason: "Joins sports." }]);
    const box = screen.getByRole("region", { name: "One-time link" });
    expect(within(box).getByRole("textbox", { name: "One-time link address" })).toHaveValue("http://localhost/admin/welcome?token_hash=T0K&type=recovery");
    expect(box).toHaveTextContent("works once, for 1 hour");
    expect(box).toHaveTextContent("never in a group");
  });

  test("a Super Admin's addition is a request: no link, and the answer says who gets it", async () => {
    serve((url) => {
      if (url === "/api/admin/me") return { status: 200, body: meWith("ask") };
      if (url === "/api/admin/people") return { status: 202, body: { request: { id: "r-9" }, asked: true } };
    });
    await act(async () => render(<AddPerson />));
    await screen.findByRole("textbox", { name: "Email" });
    fill("Email", "neha@example.com");
    fill("Name", "Neha");
    fill("Reason", "Joins sports.");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Ask to add" })));
    expect(screen.getByRole("status")).toHaveTextContent("A second Super Admin decides it");
    expect(screen.queryByRole("region", { name: "One-time link" })).not.toBeInTheDocument();
  });

  test("an email already on the staff points to their page", async () => {
    serve((url) => {
      if (url === "/api/admin/me") return { status: 200, body: meWith("act") };
      if (url === "/api/admin/people") return { status: 409, body: { error: "This email is already a staff member.", code: "staff", userId: "p-1" } };
    });
    await act(async () => render(<AddPerson />));
    await screen.findByRole("textbox", { name: "Email" });
    fill("Email", "ravi@example.com");
    fill("Name", "Ravi");
    fill("Reason", "x");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add" })));
    expect(screen.getByRole("link", { name: "Open their page" })).toHaveAttribute("href", "/admin/people/p-1");
  });

  test("someone without the right is told so, and gets no form", async () => {
    serve((url) => (url === "/api/admin/me" ? { status: 200, body: meWith(null) } : undefined));
    await act(async () => render(<AddPerson />));
    expect(await screen.findByText("Adding people is for a Super Admin or a Managing Editor.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Email" })).not.toBeInTheDocument();
  });
});

describe("links and lost factors on a person's page", () => {
  test("a password link is shown once, after it is made", async () => {
    serve((url, init) => {
      if (url === "/api/admin/people/p-1" && !init?.method) return { status: 200, body: detail({ passwordLink: "act" }, MANAGING) };
      if (url === "/api/admin/people/p-1/password-link") return { status: 200, body: { link: "/admin/welcome?token_hash=ABC&type=recovery" } };
    });
    await act(async () => render(<PersonDetail id="p-1" />));
    await screen.findByRole("textbox", { name: "Reason for a password link" });
    fill("Reason for a password link", "Forgot it.");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Make a password link" })));
    expect(posted("/api/admin/people/p-1/password-link")).toEqual([{ reason: "Forgot it." }]);
    expect(screen.getByRole("textbox", { name: "One-time link address" })).toHaveValue("http://localhost/admin/welcome?token_hash=ABC&type=recovery");
  });

  test("a lost factor: a Super Admin asks, saying how they checked it is the person", async () => {
    serve((url, init) => {
      if (url === "/api/admin/people/p-1" && !init?.method) return { status: 200, body: detail({ mfaReset: "ask", passwordLink: "ask" }) };
      if (url === "/api/admin/people/p-1/mfa-reset") return { status: 202, body: { request: { id: "r-3" }, asked: true } };
    });
    await act(async () => render(<PersonDetail id="p-1" />));
    expect(await screen.findByRole("button", { name: "Ask for a password link" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ask to reset the second factor" })).toBeDisabled();
    fill(/How did you check it is them/, "Called her desk line.");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Ask to reset the second factor" })));
    expect(posted("/api/admin/people/p-1/mfa-reset")).toEqual([{ reason: "Called her desk line." }]);
    expect(screen.getByRole("status")).toHaveTextContent("A second Super Admin decides it");
  });

  test("no factor reset or link is offered where the API offers none", async () => {
    serve((url) => (url === "/api/admin/people/p-1" ? { status: 200, body: detail({}, MANAGING) } : undefined));
    await act(async () => render(<PersonDetail id="p-1" />));
    await screen.findByRole("heading", { name: "Ravi" });
    expect(screen.queryByRole("button", { name: /second factor/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /password link/ })).not.toBeInTheDocument();
  });
});

describe("the requests box", () => {
  test("approving an addition shows the new person's link to the approver", async () => {
    const adding = {
      id: "r-1", kind: "add_person", userId: null, userName: "Neha",
      details: { email: "neha@example.com", display_name: "Neha", role: "writer", language: "hi", section: null, days: 180 },
      reason: "Joins sports.", requestedBy: "u-7", requestedByName: "Vivek", requestedAt: "2026-11-19T09:00:00Z", lapsesAt: "2026-11-22T09:00:00Z",
      lapsed: false, decidedByName: null, decidedAt: null, outcome: null, note: null, mine: false, canDecide: true, canCancel: false,
    };
    serve((url) => {
      if (url === "/api/admin/people") return { status: 200, body: { people: [RAVI], caller: SUPER, accounts: true } };
      if (url === "/api/admin/people/requests") return { status: 200, body: { requests: [adding] } };
      if (url === "/api/admin/people/requests/r-1/approve") return { status: 200, body: { request: { ...adding, outcome: "approved" }, link: "/admin/welcome?token_hash=NEW&type=recovery" } };
    });
    await act(async () => render(<PeopleDirectory />));
    expect(await screen.findByRole("link", { name: "Ask to add a person" })).toHaveAttribute("href", "/admin/people/new");
    expect(screen.getByText("Add Neha as Writer")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Approve" })));
    const box = screen.getByRole("region", { name: "One-time link" });
    expect(box).toHaveTextContent("The link for Neha");
    expect(within(box).getByRole("textbox")).toHaveValue("http://localhost/admin/welcome?token_hash=NEW&type=recovery");
  });
});

describe("the welcome page", () => {
  const TOKEN_LINK = "?token_hash=pkce_0123456789abcdef&type=recovery";
  const open = async (search: string, route: Route) => {
    window.history.pushState({}, "", `/admin/welcome${search}`);
    serve(route);
    await act(async () => render(<WelcomeFlow />));
  };
  const typePassword = (a: string, b: string) => {
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: a } });
    fireEvent.change(screen.getByLabelText("The same password again"), { target: { value: b } });
  };

  test("the token leaves the address at once and is sent once; a new person chooses a password, then signs in", async () => {
    await open(TOKEN_LINK, (url) => {
      if (url === "/api/admin/welcome") return { status: 200, body: { name: "Neha", email: "neha@example.com", hasFactor: false } };
      if (url === "/api/admin/password") return { status: 200, body: { status: "success", signIn: "/admin/login" } };
    });
    expect(window.location.search).toBe("");
    expect(posted("/api/admin/welcome")).toEqual([{ token_hash: "pkce_0123456789abcdef", type: "recovery" }]);
    expect(await screen.findByText("Welcome to TimesPrime, Neha.")).toBeInTheDocument();
    typePassword("correct horse battery", "correct horse batterY");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Set my password" })));
    expect(screen.getByRole("alert")).toHaveTextContent("not the same");
    typePassword("correct horse battery", "correct horse battery");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Set my password" })));
    expect(posted("/api/admin/password")).toEqual([{ password: "correct horse battery" }]);
    expect(screen.getByRole("link", { name: "Go to sign-in" })).toHaveAttribute("href", "/admin/login");
  });

  test("an account with a second factor gives its code first", async () => {
    await open(TOKEN_LINK, (url) => {
      if (url === "/api/admin/welcome") return { status: 200, body: { name: "Ravi", email: "ravi@example.com", hasFactor: true } };
      if (url === "/api/admin/mfa") return { status: 200, body: { status: "success", aal: "aal2" } };
    });
    fireEvent.change(await screen.findByRole("textbox", { name: "Code" }), { target: { value: "123456" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Continue" })));
    expect(posted("/api/admin/mfa")).toEqual([{ action: "verify", code: "123456" }]);
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
  });

  test("a weak password is refused on the page, before anything is sent", async () => {
    await open(TOKEN_LINK, (url) => (url === "/api/admin/welcome" ? { status: 200, body: { name: "Neha", email: "neha@example.com", hasFactor: false } } : undefined));
    await screen.findByLabelText("New password");
    typePassword("short", "short");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Set my password" })));
    expect(screen.getByRole("alert")).toHaveTextContent("at least 12");
    expect(posted("/api/admin/password")).toEqual([]);
  });

  test("the server asking for the code sends the person back to it", async () => {
    await open(TOKEN_LINK, (url) => {
      if (url === "/api/admin/welcome") return { status: 200, body: { name: "Ravi", email: "ravi@example.com", hasFactor: false } };
      if (url === "/api/admin/password") return { status: 403, body: { error: "Enter the code first.", code: "mfa_required" } };
    });
    await screen.findByLabelText("New password");
    typePassword("correct horse battery", "correct horse battery");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Set my password" })));
    expect(screen.getByRole("textbox", { name: "Code" })).toBeInTheDocument();
  });

  test("a link without its token says so, and asks nothing of the server", async () => {
    await open("", () => undefined);
    expect(await screen.findByRole("alert")).toHaveTextContent("This link is not complete");
    expect(sent).toEqual([]);
  });

  test("a used or expired link says so, with the way to sign-in", async () => {
    await open(TOKEN_LINK, () => ({ status: 400, body: { error: "This link does not work any more: it was used, or it expired.", code: "link_invalid" } }));
    expect(await screen.findByRole("alert")).toHaveTextContent("does not work any more");
    expect(screen.getByRole("link", { name: "Go to sign-in" })).toHaveAttribute("href", "/admin/login");
  });
});
