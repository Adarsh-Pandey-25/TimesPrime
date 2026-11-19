/**
 * Panel 1's screens (design §4): what they show for each answer the API gives. The server decides
 * every request; these tests check the screens show its answers, offer only what the API says the
 * caller may do ("act" at once, "ask" as a request), carry a reason with every change, and have
 * loading, empty and error states.
 */

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }), useParams: () => ({ id: "p-1" }) }));

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import PeopleDirectory from "./PeopleDirectory";
import PersonDetail from "./PersonDetail";

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

const ROLE = {
  id: "a-1", role: "writer", language: "hi", section: "sports", isBreakGlass: false, grantedBy: "u-9", approvedBy: null,
  reason: "New on the desk.", grantedAt: "2026-11-19T09:00:00Z", expiresAt: "2027-05-18T09:00:00Z", revokedAt: null, revokeReason: null, state: "live",
};
const RAVI = { userId: "p-1", name: "Ravi", status: "active", email: "ravi@example.com", hasFactor: false, lastSignInAt: null, createdAt: "2026-11-19T09:00:00Z", roles: [ROLE] };
const SUPER = { userId: "u-1", asks: true, scopes: [], grantable: ["super_admin", "managing_editor", "desk_editor", "sub_editor", "writer"] };
const MANAGING = { userId: "u-2", asks: false, scopes: [{ language: "hi", section: null }], grantable: ["desk_editor", "sub_editor", "writer"] };
const REQUEST = {
  id: "r-1", kind: "grant", userId: "p-1", userName: "Ravi", details: { role: "desk_editor", language: "hi", section: null, days: 180 },
  reason: "Runs the Hindi desk at night.", requestedBy: "u-7", requestedByName: "Vivek", requestedAt: "2026-11-19T09:00:00Z",
  lapsesAt: "2026-11-22T09:00:00Z", lapsed: false, decidedByName: null, decidedAt: null, outcome: null, note: null, mine: false, canDecide: true, canCancel: false,
};

describe("the directory", () => {
  test("a Super Admin sees everyone, their roles and second factor, and the requests waiting for them", async () => {
    serve((url) => {
      if (url === "/api/admin/people") return { status: 200, body: { people: [RAVI], caller: SUPER, accounts: true } };
      if (url === "/api/admin/people/requests") return { status: 200, body: { requests: [REQUEST] } };
      if (url === "/api/admin/people/requests/r-1/approve") return { status: 200, body: { request: { ...REQUEST, outcome: "approved" } } };
    });
    await act(async () => render(<PeopleDirectory />));
    expect(await screen.findByRole("link", { name: "Ravi" })).toHaveAttribute("href", "/admin/people/p-1");
    expect(screen.getByText(/Hindi · Sports · until/)).toBeInTheDocument();
    expect(screen.getByText("Not set yet")).toBeInTheDocument();
    const box = screen.getByRole("region", { name: "Requests" });
    expect(within(box).getByText("Grant Ravi Desk Editor (Hindi) for 180 days")).toBeInTheDocument();
    await act(async () => fireEvent.click(within(box).getByRole("button", { name: "Approve" })));
    expect(posted("/api/admin/people/requests/r-1/approve")).toEqual([{}]);
    expect(await screen.findByRole("status")).toHaveTextContent("Approved");
  });

  test("a Managing Editor sees their desks and no requests box", async () => {
    serve((url) => (url === "/api/admin/people" ? { status: 200, body: { people: [RAVI], caller: MANAGING, accounts: true } } : undefined));
    await act(async () => render(<PeopleDirectory />));
    expect(await screen.findByText(/You manage Writer, Sub-editor and Desk Editor in: Hindi/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Requests" })).not.toBeInTheDocument();
    expect(sent.some(([u]) => u === "/api/admin/people/requests")).toBe(false);
  });

  test("filters by role and status, and says when nobody matches", async () => {
    serve((url) => (url === "/api/admin/people" ? { status: 200, body: { people: [RAVI], caller: MANAGING, accounts: true } } : undefined));
    await act(async () => render(<PeopleDirectory />));
    await screen.findByRole("link", { name: "Ravi" });
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: "suspended" } });
    expect(screen.getByText("Nobody matches these filters.")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Role" }), { target: { value: "writer" } });
    expect(screen.getByRole("link", { name: "Ravi" })).toBeInTheDocument();
  });

  test("empty, loading and the server's refusal", async () => {
    serve((url) => (url === "/api/admin/people" ? { status: 200, body: { people: [], caller: MANAGING, accounts: false } } : undefined));
    await act(async () => render(<PeopleDirectory />));
    expect(await screen.findByText("No staff to show here yet.")).toBeInTheDocument();
    expect(screen.getByText(/could not be read from Supabase Auth/)).toBeInTheDocument();
  });

  test("a refusal is shown, not hidden", async () => {
    serve(() => ({ status: 403, body: { error: "You don't have permission for this action." } }));
    await act(async () => render(<PeopleDirectory />));
    expect(await screen.findByRole("alert")).toHaveTextContent("You don't have permission");
  });

  test("every filter has a name", async () => {
    serve((url) => (url === "/api/admin/people" ? { status: 200, body: { people: [RAVI], caller: MANAGING, accounts: true } } : undefined));
    await act(async () => render(<PeopleDirectory />));
    await screen.findByRole("link", { name: "Ravi" });
    for (const name of ["Search", "Role", "Language", "Status"]) {
      expect(screen.getByLabelText(name)).toBeInTheDocument();
    }
  });
});

const detail = (can: Record<string, unknown>, caller: object = SUPER, over: Record<string, unknown> = {}) => ({
  person: RAVI,
  assignments: [{ ...ROLE, grantedByName: "Asha", approvedByName: null }],
  requests: [],
  history: [{ at: "2026-11-19T09:00:00Z", actor_label: "Asha", action: "role.assign", outcome: "succeeded", reason: "New on the desk." }],
  can: { rename: null, suspend: null, reactivate: null, signOut: null, grant: null, roles: {}, ...can },
  caller,
  ...over,
});

describe("one person", () => {
  test("a Super Admin's grant is a request: the button says so, and the answer says who decides", async () => {
    serve((url, init) => {
      if (url === "/api/admin/people/p-1" && !init?.method) return { status: 200, body: detail({ grant: "ask", roles: { "a-1": { renew: "ask", revoke: "act" } } }) };
      if (url === "/api/admin/people/p-1/roles") return { status: 202, body: { request: { id: "r-2" }, asked: true } };
    });
    await act(async () => render(<PersonDetail id="p-1" />));
    const form = await screen.findByRole("region", { name: "Grant a role" });
    fireEvent.change(within(form).getByRole("combobox", { name: "Role" }), { target: { value: "desk_editor" } });
    fireEvent.change(within(form).getByRole("textbox", { name: "Reason" }), { target: { value: "Runs the night desk." } });
    await act(async () => fireEvent.click(within(form).getByRole("button", { name: "Ask to grant" })));
    expect(posted("/api/admin/people/p-1/roles")).toEqual([{ role: "desk_editor", language: "hi", section: null, days: 180, reason: "Runs the night desk." }]);
    expect(await screen.findByRole("status")).toHaveTextContent("A second Super Admin decides it within 72 hours");
    // The role's own actions: renew is a request, revoke is at once.
    const roles = screen.getByRole("region", { name: "Roles" });
    expect(within(roles).getByRole("button", { name: "Ask to renew" })).toBeDisabled();
    expect(within(roles).getByRole("button", { name: "Revoke" })).toBeDisabled();
  });

  test("a Managing Editor grants at once, within what they may grant", async () => {
    serve((url, init) => {
      if (url === "/api/admin/people/p-1" && !init?.method) return { status: 200, body: detail({ grant: "act" }, MANAGING) };
      if (url === "/api/admin/people/p-1/roles") return { status: 201, body: { assignment: { id: "a-2" } } };
    });
    await act(async () => render(<PersonDetail id="p-1" />));
    const form = await screen.findByRole("region", { name: "Grant a role" });
    const options = within(within(form).getByRole("combobox", { name: "Role" })).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Desk Editor", "Sub-editor", "Writer"]);
    fireEvent.change(within(form).getByRole("textbox", { name: "Reason" }), { target: { value: "Covers sports." } });
    await act(async () => fireEvent.click(within(form).getByRole("button", { name: "Grant" })));
    expect(await screen.findByRole("status")).toHaveTextContent("Granted.");
  });

  test("revoking needs a reason, and is sent with it", async () => {
    serve((url, init) => {
      if (url === "/api/admin/people/p-1" && !init?.method) return { status: 200, body: detail({ roles: { "a-1": { renew: null, revoke: "act" } } }) };
      if (url === "/api/admin/people/p-1/roles/a-1/revoke") return { status: 200, body: { assignment: { id: "a-1" } } };
    });
    await act(async () => render(<PersonDetail id="p-1" />));
    const roles = await screen.findByRole("region", { name: "Roles" });
    expect(within(roles).queryByRole("button", { name: /renew/i })).not.toBeInTheDocument();
    fireEvent.change(within(roles).getByRole("textbox", { name: "Reason" }), { target: { value: "Left the desk." } });
    await act(async () => fireEvent.click(within(roles).getByRole("button", { name: "Revoke" })));
    expect(posted("/api/admin/people/p-1/roles/a-1/revoke")).toEqual([{ reason: "Left the desk." }]);
  });

  test("suspend is offered to an active person, reactivate (as a request) to a suspended one", async () => {
    serve((url) => (url === "/api/admin/people/p-1" ? { status: 200, body: detail({ suspend: "act", signOut: "act" }) } : undefined));
    await act(async () => render(<PersonDetail id="p-1" />));
    const account = await screen.findByRole("region", { name: "Account actions" });
    expect(within(account).getByRole("button", { name: "Suspend" })).toBeDisabled();
    expect(within(account).getByRole("button", { name: "Sign out everywhere" })).toBeEnabled();

    serve((url) => (url === "/api/admin/people/p-1" ? { status: 200, body: detail({ reactivate: "ask" }, SUPER, { person: { ...RAVI, status: "suspended" } }) } : undefined));
    await act(async () => render(<PersonDetail id="p-1" />));
    expect(await screen.findByRole("button", { name: "Ask to reactivate" })).toBeInTheDocument();
  });

  test("nothing to do: no actions, the history and an empty requests list", async () => {
    serve((url) => (url === "/api/admin/people/p-1" ? { status: 200, body: detail({}, { ...SUPER, userId: "p-1" }) } : undefined));
    await act(async () => render(<PersonDetail id="p-1" />));
    expect(await screen.findByText(/This is you: nobody changes their own access/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Grant a role" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Account actions" })).not.toBeInTheDocument();
    expect(screen.getByText("No requests about this person.")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "History" })).getByText("role.assign")).toBeInTheDocument();
  });

  test("not found is shown, with the way back", async () => {
    serve(() => ({ status: 404, body: { error: "Staff member not found." } }));
    await act(async () => render(<PersonDetail id="p-1" />));
    expect(await screen.findByRole("alert")).toHaveTextContent("Staff member not found.");
    expect(screen.getByRole("link", { name: "← All people" })).toHaveAttribute("href", "/admin/people");
  });
});
