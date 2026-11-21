/**
 * The Compliance screen (Panel 7 design §4, M1): the grievance queue with its clocks, one grievance
 * with its notes and decision, and typing one in. The server decides every request; these tests check
 * the screens show its answers, offer only what it says the caller may do (the Managing Editor reads,
 * the Grievance Officer and Legal act), and have loading, empty and error states.
 */

const mockRouter = { push: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter, usePathname: () => "/admin/compliance" }));

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ThemeProvider } from "@timesprime/ui/ThemeContext";
import { FeedbackProvider } from "../ui/Feedback";
import ComplianceScreen from "./ComplianceScreen";
import GrievanceDetail from "./GrievanceDetail";
import CorrectionsLog from "./CorrectionsLog";
import MonthlyReport from "./MonthlyReport";

const staffMe = (permissions: Record<string, "act" | "read" | "ask">, role = "grievance_officer") => ({
  kind: "staff",
  displayName: "Asha",
  aal: "aal2",
  roles: [{ role, language: null, section: null, expiresAt: "2099-01-01T00:00:00Z" }],
  permissions,
  mfa: { required: true, enrolled: true },
});
const OFFICER = staffMe({ "grievance.handle": "act" });
const EDITOR = staffMe({ "grievance.handle": "read" }, "managing_editor");

const GRIEVANCE = {
  id: "g-1", ticket: "G-2026-00042", channel: "web", language: "hi", name: "Asha Rao", email: "asha@example.com", contact_shown: true,
  about_url: "https://timesprime247.com/hi/sports/match-12", story_id: "s-1", category: "factual_error", body: "स्कोर गलत था।",
  received_at: "2026-11-20T06:00:00Z", entered_by: null, ack_due_at: "2026-11-21T06:00:00Z", decide_due_at: "2099-12-05T06:00:00Z",
  acknowledged_at: "2026-11-20T06:00:00Z", acknowledged_by: null, assigned_to: null, state: "open", outcome: null, reply: null,
  decided_by: null, decided_at: null, names: {},
};
const LATE = { ...GRIEVANCE, id: "g-2", ticket: "G-2026-00041", decide_due_at: "2026-11-01T06:00:00Z" };
const queue = (body: Partial<{ grievances: unknown[]; counts: unknown; may_handle: boolean }> = {}) => ({
  status: 200,
  body: { grievances: [GRIEVANCE], counts: { open: 1, late: 0, ackLate: 0 }, may_handle: true, ...body },
});

type Answer = { status: number; body: unknown };
let route: (url: string, init?: RequestInit) => Answer | undefined;
let sent: Array<{ url: string; init?: RequestInit }>;

beforeEach(() => {
  sent = [];
  mockRouter.push.mockReset();
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    sent.push({ url, init });
    const answer = route(url, init) ?? { status: 404, body: { error: "not found" } };
    return { ok: answer.status >= 200 && answer.status < 300, status: answer.status, json: async () => answer.body };
  }) as unknown as typeof fetch;
});

const wrap = (node: React.ReactNode) => (
  <ThemeProvider>
    <FeedbackProvider>{node}</FeedbackProvider>
  </ThemeProvider>
);
const show = async () => act(async () => void render(wrap(<ComplianceScreen />)));
const posted = (path: string) => sent.filter((s) => s.url === path && s.init?.method === "POST").map((s) => JSON.parse(String(s.init?.body)));

describe("the queue", () => {
  test("loading: the access check first, announced as a status", () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(<ComplianceScreen />);
    expect(screen.getByRole("status")).toHaveTextContent("Checking your access…");
  });

  test("the open grievances, each with its ticket, clock, category and sender; the counts; Add for an officer", async () => {
    route = (url) => {
      if (url === "/api/admin/me") return { status: 200, body: OFFICER };
      if (url === "/api/admin/compliance/grievances?state=open") return queue({ grievances: [LATE, GRIEVANCE], counts: { open: 2, late: 1, ackLate: 0 } });
    };
    await show();
    expect(screen.getByText(/2 open/)).toHaveTextContent("2 open · 1 late");
    const items = within(screen.getByRole("list", { name: "Grievances" })).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByRole("link", { name: "G-2026-00041" })).toHaveAttribute("href", "/admin/compliance/grievances/g-2");
    expect(within(items[0]).getByText(/^Late: the decision was due/)).toBeInTheDocument();
    expect(within(items[1]).getByText(/^Decide by/)).toBeInTheDocument();
    expect(within(items[1]).getByText(/A factual error · The form · arrived/)).toBeInTheDocument();
    expect(within(items[1]).getByText("स्कोर गलत था।")).toHaveAttribute("lang", "hi");
    expect(within(items[1]).getByText(/nobody has taken it yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a grievance" })).toBeInTheDocument();
  });

  test("the Managing Editor (read) gets no Add; the filters and the ticket search ask the server", async () => {
    route = (url) => {
      if (url === "/api/admin/me") return { status: 200, body: EDITOR };
      if (url.startsWith("/api/admin/compliance/grievances?")) return queue({ grievances: [], may_handle: false });
    };
    await show();
    expect(screen.queryByRole("button", { name: "Add a grievance" })).not.toBeInTheDocument();
    expect(screen.getByText("No open grievances.")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Decided" })));
    expect(sent.some((s) => s.url === "/api/admin/compliance/grievances?state=decided")).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Ticket" }), { target: { value: " g-2026-00042 " } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Find" })));
    expect(sent.some((s) => s.url === "/api/admin/compliance/grievances?state=all&ticket=g-2026-00042")).toBe(true);
    expect(screen.getByText("No grievance has the ticket g-2026-00042.")).toBeInTheDocument();
  });

  test("a failed read is shown, with Try again", async () => {
    let fail = true;
    route = (url) => {
      if (url === "/api/admin/me") return { status: 200, body: OFFICER };
      if (url.startsWith("/api/admin/compliance/grievances?")) return fail ? { status: 500, body: { error: "This could not be done. Nothing was changed." } } : queue();
    };
    await show();
    expect(screen.getByRole("alert")).toHaveTextContent("This could not be done.");
    fail = false;
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })));
    expect(screen.getByRole("link", { name: "G-2026-00042" })).toBeInTheDocument();
  });

  test("whoever holds no grievance cell is told who handles it, and nothing is read", async () => {
    route = (url) => (url === "/api/admin/me" ? { status: 200, body: staffMe({ "article.view_admin": "act" }, "writer") } : undefined);
    await show();
    expect(screen.getByText(/do not include compliance/)).toBeInTheDocument();
    expect(sent.some((s) => s.url.startsWith("/api/admin/compliance/"))).toBe(false);
  });

  test("typing one in: the fields go to the server as one grievance received another way", async () => {
    route = (url, init) => {
      if (url === "/api/admin/me") return { status: 200, body: OFFICER };
      if (url.startsWith("/api/admin/compliance/grievances?")) return queue();
      if (url === "/api/admin/compliance/grievances" && init?.method === "POST") return { status: 201, body: { grievance: { ...GRIEVANCE, ticket: "G-2026-00043", channel: "post" } } };
    };
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Add a grievance" }));
    const form = screen.getByRole("form", { name: "Add a grievance" });
    fireEvent.change(within(form).getByRole("combobox", { name: "How it arrived" }), { target: { value: "post" } });
    fireEvent.change(within(form).getByRole("textbox", { name: "Complainant's name" }), { target: { value: "Ravi" } });
    fireEvent.change(within(form).getByRole("textbox", { name: "Their email, to reply to" }), { target: { value: "ravi@example.com" } });
    fireEvent.change(within(form).getByRole("textbox", { name: "The grievance, as they wrote it" }), { target: { value: "The photo is mine." } });
    fireEvent.change(within(form).getByRole("combobox", { name: "What it is about" }), { target: { value: "copyright" } });
    fireEvent.click(within(form).getByRole("checkbox", { name: "I have already acknowledged it to them" }));
    await act(async () => fireEvent.click(within(form).getByRole("button", { name: "Add the grievance" })));
    expect(posted("/api/admin/compliance/grievances")).toEqual([
      { channel: "post", language: "en", name: "Ravi", email: "ravi@example.com", about_url: null, category: "copyright", body: "The photo is mine.", received_at: null, acknowledged: true },
    ]);
    expect(screen.queryByRole("form", { name: "Add a grievance" })).not.toBeInTheDocument();
  });

  test("a refused grievance keeps the form open, with the server's words", async () => {
    route = (url, init) => {
      if (url === "/api/admin/me") return { status: 200, body: OFFICER };
      if (url.startsWith("/api/admin/compliance/grievances?")) return queue();
      if (url === "/api/admin/compliance/grievances" && init?.method === "POST") return { status: 400, body: { error: "An email address we can reply to is required." } };
    };
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Add a grievance" }));
    const form = screen.getByRole("form", { name: "Add a grievance" });
    await act(async () => fireEvent.submit(form));
    expect(within(form).getByRole("alert")).toHaveTextContent("An email address we can reply to is required.");
  });
});

describe("one grievance", () => {
  const detail = (over: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
    status: 200,
    body: { grievance: { ...GRIEVANCE, ...over }, notes: [], story: { id: "s-1", workflow_state: "published", headline: "भारत ने मैच जीता" }, may_handle: true, yours: false, ...extra },
  });
  const open = async () => act(async () => void render(wrap(<GrievanceDetail id="g-1" />)));

  test("loading, then what was sent, the story it names, the clocks and the officer's actions", async () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const { unmount } = render(<GrievanceDetail id="g-1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading the grievance…");
    unmount();

    route = (url) => (url === "/api/admin/compliance/grievances/g-1" ? detail() : undefined);
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const answer = route(String(input), init) ?? { status: 404, body: {} };
      sent.push({ url: String(input), init });
      return { ok: answer.status < 300, status: answer.status, json: async () => answer.body };
    }) as unknown as typeof fetch;
    await open();
    expect(screen.getByRole("heading", { name: "G-2026-00042" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "asha@example.com" })).toHaveAttribute("href", expect.stringMatching(/^mailto:asha@example\.com\?subject=/));
    expect(screen.getByRole("link", { name: "भारत ने मैच जीता" })).toHaveAttribute("href", "/admin/desk/s-1");
    expect(screen.getByText(/done .* \(by the form\)/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "I have acknowledged it" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I'll handle this" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decide" })).toBeDisabled();
    expect(screen.getByText("No notes yet.")).toBeInTheDocument();
  });

  test("the Managing Editor reads it with the email masked, and is offered no action", async () => {
    route = (url) => (url === "/api/admin/compliance/grievances/g-1" ? detail({ email: "a•••@example.com", contact_shown: false }, { may_handle: false }) : undefined);
    await open();
    expect(screen.getByText(/a•••@example\.com/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /example\.com/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /handle|Decide|Add the note|acknowledged/ })).not.toBeInTheDocument();
    expect(screen.getByText(/The Grievance Officer and Legal act on them/)).toBeInTheDocument();
  });

  test("one typed in and not acknowledged offers the acknowledgement; taking it, a note and the decision go to the server", async () => {
    let state = detail({ channel: "email", entered_by: "u-9", acknowledged_at: null, assigned_to: "u-9", names: { "u-9": "Meera" } });
    route = (url, init) => {
      if (url === "/api/admin/compliance/grievances/g-1") return state;
      if (init?.method === "POST") return { status: 200, body: {} };
    };
    await open();
    expect(screen.getByText("not yet")).toBeInTheDocument();
    expect(screen.getByText("Meera")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "I have acknowledged it" })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Take it over" })));
    fireEvent.change(screen.getByRole("textbox", { name: "A note" }), { target: { value: "Asked the desk." } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add the note" })));
    expect(posted("/api/admin/compliance/grievances/g-1/acknowledge")).toEqual([{}]);
    expect(posted("/api/admin/compliance/grievances/g-1/assign")).toEqual([{}]);
    expect(posted("/api/admin/compliance/grievances/g-1/notes")).toEqual([{ body: "Asked the desk." }]);

    fireEvent.change(screen.getByRole("combobox", { name: "Outcome" }), { target: { value: "partly_upheld" } });
    fireEvent.change(screen.getByRole("textbox", { name: "The reply to the complainant" }), { target: { value: "We corrected the score." } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Decide" })));
    const confirm = screen.getByRole("dialog");
    expect(confirm).toHaveTextContent("A decision is final");
    state = detail({ state: "decided", outcome: "partly_upheld", reply: "We corrected the score.", decided_by: "u-1", decided_at: "2026-11-21T06:00:00Z", names: { "u-1": "Asha" } });
    await act(async () => fireEvent.click(within(confirm).getByRole("button", { name: "Decide" })));
    expect(posted("/api/admin/compliance/grievances/g-1/decide")).toEqual([{ outcome: "partly_upheld", reply: "We corrected the score." }]);
    expect(screen.getByRole("heading", { name: "The decision: Partly upheld" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "The reply to the complainant" })).not.toBeInTheDocument();
  });

  test("a refusal is shown beside the screen; an unknown grievance is an error with Try again", async () => {
    route = (url, init) => {
      if (url === "/api/admin/compliance/grievances/g-1") return detail();
      if (init?.method === "POST") return { status: 409, body: { error: "This grievance is decided: a decision is final." } };
    };
    await open();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "I'll handle this" })));
    expect(screen.getByRole("alert")).toHaveTextContent("a decision is final");

    route = () => ({ status: 404, body: { error: "Grievance not found." } });
    await act(async () => void render(<GrievanceDetail id="g-9" />));
    expect(screen.getAllByRole("alert").at(-1)).toHaveTextContent("Grievance not found.");
    expect(screen.getAllByRole("link", { name: "← Compliance" }).at(-1)).toHaveAttribute("href", "/admin/compliance");
  });
});

// ---- M2: the corrections log, and a grievance's corrections ------------------------------------

describe("the corrections log (M2)", () => {
  const LOG_ROW = {
    id: "c-1", story_id: "s-1", language: "hi", kind: "clarification", text: "मतदान सोमवार को हुआ था।", headline: "संसद में बजट पास",
    published_at: "2026-11-21T06:00:00Z", published_by_name: "Meera", requested_by_name: "Ravi", ticket: "G-2026-00042",
  };
  const WITH_LOG = staffMe({ "grievance.handle": "act", "correction.publish": "read" });

  test("for a holder of correction.publish: each correction's kind, story, text, who published and asked, and its grievance", async () => {
    route = (url) => {
      if (url === "/api/admin/me") return { status: 200, body: WITH_LOG };
      if (url.startsWith("/api/admin/compliance/grievances?")) return queue({ grievances: [] });
      if (url === "/api/admin/compliance/corrections") return { status: 200, body: { corrections: [LOG_ROW], applied: true, more: true } };
      if (url.startsWith("/api/admin/compliance/corrections?before=")) return { status: 200, body: { corrections: [{ ...LOG_ROW, id: "c-0", ticket: null, requested_by_name: null }], applied: true, more: false } };
    };
    await show();
    const log = screen.getByRole("list", { name: "Corrections, newest first" });
    expect(within(log).getByText("Clarification")).toBeInTheDocument();
    expect(within(log).getByRole("link", { name: "संसद में बजट पास" })).toHaveAttribute("href", "/admin/desk/s-1");
    expect(within(log).getByText("Grievance G-2026-00042")).toBeInTheDocument();
    expect(within(log).getByText("Published by Meera, asked for by Ravi")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Older corrections" })));
    expect(sent.some((s) => s.url === `/api/admin/compliance/corrections?before=${encodeURIComponent("2026-11-21T06:00:00Z")}`)).toBe(true);
    expect(within(log).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Older corrections" })).not.toBeInTheDocument();
  });

  test("before compliance-2 the log says it is waiting; empty, it says so; a failure has Try again", async () => {
    let answer: Answer = { status: 200, body: { corrections: [], applied: false, more: false } };
    route = (url) => {
      if (url === "/api/admin/me") return { status: 200, body: staffMe({ "correction.publish": "read" }, "sub_editor") };
      if (url === "/api/admin/compliance/corrections") return answer;
    };
    await show();
    expect(screen.getByText(/compliance-2 is waiting to be applied/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Grievances" })).not.toBeInTheDocument();
    answer = { status: 500, body: { error: "The Desk could not do this. Nothing was changed." } };
    await act(async () => void render(wrap(<CorrectionsLog />)));
    expect(screen.getAllByRole("alert").at(-1)).toHaveTextContent("The Desk could not do this.");
    answer = { status: 200, body: { corrections: [], applied: true, more: false } };
    await act(async () => fireEvent.click(screen.getAllByRole("button", { name: "Try again" }).at(-1) as HTMLElement));
    expect(screen.getAllByText("No corrections yet.").length).toBeGreaterThan(0);
  });

  test("a grievance's page lists the corrections it caused", async () => {
    route = (url) =>
      url === "/api/admin/compliance/grievances/g-1"
        ? {
            status: 200,
            body: {
              grievance: GRIEVANCE, notes: [], story: null, may_handle: true, yours: false,
              corrections: [{ id: "c-1", story_id: "s-1", kind: "correction", text: "स्कोर सुधार दिया गया।", headline: "भारत ने मैच जीता", published_at: "2026-11-22T06:00:00Z" }],
            },
          }
        : undefined;
    await act(async () => void render(wrap(<GrievanceDetail id="g-1" />)));
    const section = screen.getByRole("region", { name: "Corrections it caused" });
    expect(within(section).getByText("स्कोर सुधार दिया गया।")).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "भारत ने मैच जीता" })).toHaveAttribute("href", "/admin/desk/s-1");
  });
});

// ---- M3: the monthly report ----------------------------------------------------------------------

describe("the monthly report (M3)", () => {
  const FIGS = {
    month: "2026-10", as_of: "2026-11-21T06:00:00Z",
    received: { total: 4, by_category: { factual_error: 4, defamation_privacy: 0, obscene_harmful: 0, copyright: 0, other: 0 }, by_language: { en: 4, hi: 0 }, by_channel: { web: 4, email: 0, post: 0, other: 0 } },
    decided: { total: 3, by_outcome: { upheld: 3, partly_upheld: 0, not_upheld: 0, outside_scope: 0, withdrawn: 0, duplicate: 0, spam: 0 }, within_15_days: 3, late: 0, median_days: 2 },
    open: { total: 1, late: 0 },
    corrections: { total: 0, by_kind: { correction: 0, clarification: 0, update: 0, editors_note: 0, retraction: 0 } },
  };
  const view = (over: Record<string, unknown> = {}) => ({
    status: 200,
    body: { month: "2026-10", months: ["2026-10", "2026-09"], applied: true, draft: FIGS, published: [], due_at: "2026-11-07T18:29:59.000Z", overdue: true, may_publish: true, ...over },
  });
  const REPORTER = staffMe({ "grievance.report": "act" });

  test("an officer sees the draft and when it was due, and publishes it after confirming, with a note", async () => {
    let state = view();
    route = (url, init) => {
      if (url === "/api/admin/me") return { status: 200, body: REPORTER };
      if (url.startsWith("/api/admin/compliance/reports") && init?.method === "POST") return { status: 201, body: { report: { id: "rep-1", version: 1 } } };
      if (url.startsWith("/api/admin/compliance/reports")) return state;
    };
    await show();
    expect(screen.getByRole("combobox", { name: "Month" })).toHaveValue("2026-10");
    expect(screen.getByText(/^Not published: it was due/)).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Grievances received" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: /A note readers see/ }), { target: { value: "All four were about one story." } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Publish" })));
    const confirm = screen.getByRole("dialog");
    expect(confirm).toHaveTextContent("Published figures never change");
    state = view({ published: [{ id: "rep-1", version: 1, figures: FIGS, note: "All four were about one story.", published_at: "2026-11-21T06:00:00Z", published_by_name: "Asha" }], overdue: false });
    await act(async () => fireEvent.click(within(confirm).getByRole("button", { name: "Publish" })));
    expect(posted("/api/admin/compliance/reports")).toEqual([{ month: "2026-10", note: "All four were about one story." }]);
    expect(screen.getByText("Published, version 1")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Published versions, newest first" })).getByText(/Version 1, .* by Asha/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish again (new version)" })).toBeInTheDocument();
  });

  test("another month asks the server again; the Managing Editor reads it and cannot publish", async () => {
    route = (url) => {
      if (url === "/api/admin/me") return { status: 200, body: staffMe({ "grievance.report": "read" }, "managing_editor") };
      if (url.startsWith("/api/admin/compliance/reports")) return view({ may_publish: false, overdue: false });
    };
    await show();
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    expect(screen.getByText(/The Grievance Officer and Legal publish it/)).toBeInTheDocument();
    await act(async () => fireEvent.change(screen.getByRole("combobox", { name: "Month" }), { target: { value: "2026-09" } }));
    expect(sent.some((s) => s.url === "/api/admin/compliance/reports?month=2026-09")).toBe(true);
  });

  test("before compliance-3 it says it is waiting; a refused publication stays on screen", async () => {
    route = (url, init) => {
      if (url === "/api/admin/me") return { status: 200, body: REPORTER };
      if (url.startsWith("/api/admin/compliance/reports") && init?.method === "POST") return { status: 409, body: { error: "A month's report is published once the month has ended." } };
      if (url.startsWith("/api/admin/compliance/reports")) return view({ applied: false, draft: null });
    };
    await show();
    expect(screen.getByText(/compliance-3 is waiting to be applied/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();

    route = (url, init) => {
      if (url === "/api/admin/me") return { status: 200, body: REPORTER };
      if (url.startsWith("/api/admin/compliance/reports") && init?.method === "POST") return { status: 409, body: { error: "A month's report is published once the month has ended." } };
      if (url.startsWith("/api/admin/compliance/reports")) return view();
    };
    await act(async () => void render(wrap(<MonthlyReport />)));
    await act(async () => fireEvent.click(screen.getAllByRole("button", { name: "Publish" }).at(-1) as HTMLElement));
    await act(async () => fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Publish" })));
    expect(screen.getAllByRole("alert").at(-1)).toHaveTextContent("once the month has ended");
  });
});
