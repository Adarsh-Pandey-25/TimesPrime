/**
 * Panel 1's M3b screens (design §5 and §6): emergency access (break-glass) and what needs a look on
 * the directory, and the access review page. The server decides every step; these tests check the
 * screens follow its answers.
 */

const mockRouter = { push: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter, useParams: () => ({ id: "p-1" }) }));

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import AccessReview from "./AccessReview";
import PeopleDirectory from "./PeopleDirectory";

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
const posted = (path: string, method = "POST") => sent.filter(([u, init]) => u === path && init?.method === method).map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : null));

const SUPER = { userId: "u-1", asks: true, scopes: [], grantable: ["writer"] };
const MANAGING = { userId: "u-2", asks: false, scopes: [{ language: "hi", section: null }], grantable: ["writer"] };
const DIRECTORY = (caller: object) => ({ status: 200, body: { people: [], caller, accounts: true } });
const IN_TWO_HOURS = new Date(Date.now() + 2 * 3_600_000).toISOString();
const SOON = new Date(Date.now() + 5 * 86_400_000).toISOString();

describe("emergency access and what needs a look, on the directory", () => {
  test("a Super Admin starts emergency access with a reason, then can end it", async () => {
    let on = false;
    serve((url, init) => {
      if (url === "/api/admin/people") return DIRECTORY(SUPER);
      if (url === "/api/admin/people/requests") return { status: 200, body: { requests: [] } };
      if (url === "/api/admin/people/alerts") {
        const mine = { assignmentId: "bg-1", userId: "u-1", name: "Adarsh", since: new Date().toISOString(), until: IN_TWO_HOURS, reason: "Court order.", mine: true };
        return { status: 200, body: { breakGlass: on ? [mine] : [], review: { lastAt: null, lastByName: null, dueAt: new Date().toISOString(), overdue: true }, endingSoon: [] } };
      }
      if (url === "/api/admin/people/break-glass" && init?.method === "POST") {
        on = true;
        return { status: 201, body: { until: IN_TWO_HOURS } };
      }
      if (url === "/api/admin/people/break-glass" && init?.method === "DELETE") {
        on = false;
        return { status: 200, body: { ended: 1 } };
      }
    });
    await act(async () => render(<PeopleDirectory />));
    const box = await screen.findByRole("region", { name: "Emergency access" });
    expect(within(box).getByRole("button", { name: "Start emergency access" })).toBeDisabled();
    fireEvent.change(within(box).getByRole("textbox"), { target: { value: "Court order." } });
    await act(async () => fireEvent.click(within(box).getByRole("button", { name: "Start emergency access" })));
    expect(posted("/api/admin/people/break-glass")).toEqual([{ reason: "Court order." }]);
    expect(within(box).getByRole("status")).toHaveTextContent("Emergency access is on until");
    await act(async () => fireEvent.click(within(box).getByRole("button", { name: "End it now" })));
    expect(posted("/api/admin/people/break-glass", "DELETE")).toEqual([null]);
    expect(within(box).getByRole("status")).toHaveTextContent("Emergency access is ended.");
    expect(screen.getByText("No access review yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start the review" })).toHaveAttribute("href", "/admin/people/review");
  });

  test("another Super Admin's emergency access is shown", async () => {
    serve((url) => {
      if (url === "/api/admin/people") return DIRECTORY(SUPER);
      if (url === "/api/admin/people/requests") return { status: 200, body: { requests: [] } };
      if (url === "/api/admin/people/alerts") {
        return { status: 200, body: { breakGlass: [{ assignmentId: "bg-2", userId: "u-7", name: "Vivek", since: new Date().toISOString(), until: IN_TWO_HOURS, reason: "Legal notice.", mine: false }], review: null, endingSoon: [] } };
      }
    });
    await act(async () => render(<PeopleDirectory />));
    expect(await screen.findByText(/Vivek has emergency access until .*Reason: Legal notice\./)).toBeInTheDocument();
  });

  test("a Managing Editor sees no emergency access, and the roles ending soon among their people", async () => {
    serve((url) => {
      if (url === "/api/admin/people") return DIRECTORY(MANAGING);
      if (url === "/api/admin/people/alerts") {
        return { status: 200, body: { breakGlass: [], review: null, endingSoon: [{ assignmentId: "a-1", userId: "p-1", name: "Ravi", role: "writer", language: "hi", section: "sports", expiresAt: SOON }] } };
      }
    });
    await act(async () => render(<PeopleDirectory />));
    const soon = await screen.findByRole("region", { name: "Roles ending soon" });
    expect(within(soon).getByRole("link", { name: "Ravi" })).toHaveAttribute("href", "/admin/people/p-1");
    expect(soon).toHaveTextContent("Writer · Hindi · Sports");
    expect(screen.queryByRole("region", { name: "Emergency access" })).not.toBeInTheDocument();
  });
});

const ITEM = (over: Record<string, unknown> = {}) => ({
  assignmentId: "a-1", userId: "p-1", name: "Ravi", email: "ravi@example.com", status: "active", role: "writer", language: "hi", section: "sports",
  grantedByName: "Asha", grantedAt: "2026-08-01T09:00:00Z", expiresAt: "2027-02-01T09:00:00Z", lastSignInAt: null,
  flags: { stale: true, noFactor: true, privileged: false, expired: false }, ...over,
});
const REVIEW = (items: unknown[]) => ({ status: 200, body: { items, due: { lastAt: null, dueAt: new Date().toISOString(), overdue: true }, accounts: true } });

describe("the access review", () => {
  test("each role shows what needs a look; revoke and renew act at once, and the review records the decisions", async () => {
    serve((url, init) => {
      if (url === "/api/admin/people/review" && init?.method === "POST") return { status: 201, body: { review: { completed_at: "2026-11-19T12:00:00Z" }, items: 2 } };
      if (url === "/api/admin/people/review") return REVIEW([ITEM(), ITEM({ assignmentId: "a-2", userId: "p-2", name: "Meera", role: "managing_editor", language: null, section: null, flags: { stale: false, noFactor: false, privileged: true, expired: false } })]);
      if (url === "/api/admin/people/p-1/roles/a-1/revoke") return { status: 200, body: { assignment: { id: "a-1" } } };
      if (url === "/api/admin/people/p-2/roles/a-2/renew") return { status: 202, body: { request: { id: "r-1" }, asked: true } };
    });
    await act(async () => render(<AccessReview />));
    const list = await screen.findByRole("list", { name: "Roles to review" });
    expect(screen.getByText("2 roles, 2 flagged.")).toBeInTheDocument();
    const [ravi, meera] = within(list).getAllByRole("listitem");
    expect(ravi).toHaveTextContent("No sign-in for 60 days");
    expect(ravi).toHaveTextContent("No second factor");
    expect(meera).toHaveTextContent("Privileged role");

    await act(async () => fireEvent.click(within(ravi).getByRole("button", { name: "Revoke" })));
    expect(posted("/api/admin/people/p-1/roles/a-1/revoke")).toEqual([{ reason: "Access review" }]);
    expect(ravi).toHaveTextContent("Revoked");
    await act(async () => fireEvent.click(within(meera).getByRole("button", { name: "Renew" })));
    expect(posted("/api/admin/people/p-2/roles/a-2/renew")).toEqual([{ reason: "Access review", days: 180 }]);
    expect(meera).toHaveTextContent("Renewal asked");

    fireEvent.change(screen.getByRole("textbox", { name: /Note/ }), { target: { value: "Q4 review." } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Complete the review" })));
    expect(posted("/api/admin/people/review")).toEqual([{ note: "Q4 review.", decisions: { "a-1": "revoked", "a-2": "renew_asked" } }]);
    expect(screen.getByRole("status")).toHaveTextContent("The review is recorded");
  });

  test("a refusal is shown, with the way back", async () => {
    serve(() => ({ status: 403, body: { error: "The access review is a Super Admin's." } }));
    await act(async () => render(<AccessReview />));
    expect(await screen.findByRole("alert")).toHaveTextContent("a Super Admin's");
    expect(screen.getByRole("link", { name: "← All people" })).toHaveAttribute("href", "/admin/people");
  });

  test("nothing to review says so; a failed revoke says why and changes nothing on screen", async () => {
    serve((url) => (url === "/api/admin/people/review" ? REVIEW([]) : undefined));
    await act(async () => render(<AccessReview />));
    expect(await screen.findByText("No roles to review.")).toBeInTheDocument();

    serve((url) => {
      if (url === "/api/admin/people/review") return REVIEW([ITEM()]);
      if (url === "/api/admin/people/p-1/roles/a-1/revoke") return { status: 403, body: { error: "Nobody changes their own access. Ask another admin.", code: "own_access" } };
    });
    await act(async () => render(<AccessReview />));
    const list = await screen.findByRole("list", { name: "Roles to review" });
    await act(async () => fireEvent.click(within(list).getByRole("button", { name: "Revoke" })));
    expect(screen.getByRole("alert")).toHaveTextContent("Nobody changes their own access");
    expect(within(list).getByRole("button", { name: "Revoke" })).toBeInTheDocument();
  });
});
