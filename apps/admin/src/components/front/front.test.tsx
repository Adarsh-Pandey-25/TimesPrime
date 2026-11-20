/**
 * The Front page screen (Panel 3 design §4): the pinned slots of the page chosen, pinning and
 * unpinning, and the breaking banner, each for whoever holds its permission. The server decides
 * every request; these tests check the screen shows its answers, offers only what the server says
 * the caller may do, and has loading, empty and error states.
 */

const mockRouter = { push: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter, usePathname: () => "/admin/front-page" }));

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ThemeProvider } from "@timesprime/ui/ThemeContext";
import { FeedbackProvider } from "../ui/Feedback";
import FrontPageScreen from "./FrontPageScreen";

const staffMe = (permissions: Record<string, "act" | "read" | "ask">, language: string | null = "hi") => ({
  kind: "staff",
  displayName: "Asha",
  aal: "aal2",
  roles: [{ role: "desk_editor", language, section: null, expiresAt: "2099-01-01T00:00:00Z" }],
  permissions,
  mfa: { required: true, enrolled: true },
});
const EDITOR = staffMe({ "homepage.curate": "act", "breaking_banner.manage": "act" });

const PIN = {
  id: "p-1", slot: 1, story_id: "s-1", starts_at: "2026-11-20T06:00:00Z", ends_at: "2099-01-01T00:00:00Z", ended_at: null,
  headline: "भारत ने फाइनल जीता", story_state: "published", pinned_by_name: "Meera",
};
const LATER = { ...PIN, id: "p-2", slot: 2, story_id: "s-2", starts_at: "2099-01-01T00:00:00Z", ends_at: "2099-01-02T00:00:00Z", headline: "Budget day" };

type Answer = { status: number; body: unknown };
let route: (url: string, init?: RequestInit) => Answer | undefined;
let sent: Array<{ url: string; init?: RequestInit }>;

beforeEach(() => {
  sent = [];
  mockRouter.push.mockReset();
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    sent.push({ url, init });
    const answer = route(url, init) ?? (url.startsWith("/api/admin/breaking-news") ? { status: 200, body: { items: [] } } : { status: 404, body: { error: "not found" } });
    return { ok: answer.status >= 200 && answer.status < 300, status: answer.status, json: async () => answer.body };
  }) as unknown as typeof fetch;
});

async function show() {
  await act(async () =>
    render(
      <ThemeProvider>
        <FeedbackProvider>
          <FrontPageScreen />
        </FeedbackProvider>
      </ThemeProvider>
    )
  );
}

const pagePins = (body: Partial<{ slots: number; pins: unknown[]; may_pin: boolean }> = {}) => ({ status: 200, body: { slots: 3, pins: [], may_pin: true, ...body } });

test("loading: the access check, then the page's pins, each announced as a status", async () => {
  route = (url) => (url === "/api/admin/me" ? { status: 200, body: EDITOR } : undefined);
  global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
  render(<FrontPageScreen />);
  expect(screen.getByRole("status")).toHaveTextContent("Checking your access…");
});

test("a Hindi Desk Editor starts on the Hindi home page: three empty slots, the form to pin, and the banner below", async () => {
  route = (url) => {
    if (url === "/api/admin/me") return { status: 200, body: EDITOR };
    if (url.startsWith("/api/admin/front-page/pins?")) return pagePins();
  };
  await show();
  expect(sent.some((s) => s.url === "/api/admin/front-page/pins?language=hi")).toBe(true);
  expect(screen.getByRole("combobox", { name: "Language" })).toHaveValue("hi");
  expect(screen.getByRole("combobox", { name: "Page" })).toHaveValue("");
  expect(within(screen.getByRole("list", { name: "Slots" })).getAllByText("Empty: nothing pinned.")).toHaveLength(3);
  expect(screen.getByRole("searchbox", { name: "Find a published story" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Breaking News Manager" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /See the page/ })).toHaveAttribute("href", expect.stringMatching(/\/$/));
});

test("a section page has two slots, and is asked for by its section", async () => {
  route = (url) => {
    if (url === "/api/admin/me") return { status: 200, body: EDITOR };
    if (url === "/api/admin/front-page/pins?language=hi&section=sports") return pagePins({ slots: 2 });
    if (url.startsWith("/api/admin/front-page/pins?")) return pagePins();
  };
  await show();
  await act(async () => fireEvent.change(screen.getByRole("combobox", { name: "Page" }), { target: { value: "sports" } }));
  expect(within(screen.getByRole("list", { name: "Slots" })).getAllByRole("listitem")).toHaveLength(2);
  expect(screen.getByRole("link", { name: /See the page/ })).toHaveAttribute("href", expect.stringMatching(/\/sports$/));
});

test("a pin shows what is showing and what starts later, who pinned it, and links to the story on the Desk", async () => {
  route = (url) => {
    if (url === "/api/admin/me") return { status: 200, body: EDITOR };
    if (url.startsWith("/api/admin/front-page/pins?")) return pagePins({ pins: [PIN, LATER] });
  };
  await show();
  expect(screen.getByRole("link", { name: "भारत ने फाइनल जीता" })).toHaveAttribute("href", "/admin/desk/s-1");
  expect(screen.getByText("Showing")).toBeInTheDocument();
  expect(screen.getByText(/^From /)).toBeInTheDocument();
  expect(screen.getAllByText(/pinned by Meera/)).toHaveLength(2);
});

test("a story taken down while pinned is marked as not showing", async () => {
  route = (url) => {
    if (url === "/api/admin/me") return { status: 200, body: EDITOR };
    if (url.startsWith("/api/admin/front-page/pins?")) return pagePins({ pins: [{ ...PIN, story_state: "unpublished" }] });
  };
  await show();
  expect(screen.getByText("Story not live: not showing")).toBeInTheDocument();
});

test("where the server says the caller may not pin: no Unpin, no form, and why", async () => {
  route = (url) => {
    if (url === "/api/admin/me") return { status: 200, body: EDITOR };
    if (url.startsWith("/api/admin/front-page/pins?")) return pagePins({ pins: [PIN], may_pin: false });
  };
  await show();
  expect(screen.queryByRole("button", { name: /Unpin/ })).toBeNull();
  expect(screen.queryByRole("searchbox")).toBeNull();
  expect(screen.getByText(/You can see this page's pins/)).toBeInTheDocument();
});

test("the server's refusal to list is shown, with a way to try again", async () => {
  let fail = true;
  route = (url) => {
    if (url === "/api/admin/me") return { status: 200, body: EDITOR };
    if (url.startsWith("/api/admin/front-page/pins?")) return fail ? { status: 500, body: { error: "The Desk could not do this. Nothing was changed." } } : pagePins();
  };
  await show();
  expect(screen.getByRole("alert")).toHaveTextContent("The Desk could not do this.");
  fail = false;
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getAllByText("Empty: nothing pinned.")).toHaveLength(3);
});

test("pinning: search, choose a story, a slot and a length; the request names the page, and the slots reload", async () => {
  let pinned = false;
  route = (url, init) => {
    if (url === "/api/admin/me") return { status: 200, body: EDITOR };
    if (url.startsWith("/api/admin/front-page/stories?")) return { status: 200, body: { stories: [{ id: "s-1", headline: "भारत ने फाइनल जीता", published_at: "2026-11-20T06:00:00Z" }], may_pin: true } };
    if (url === "/api/admin/front-page/pins" && init?.method === "POST") {
      pinned = true;
      return { status: 200, body: { pin: PIN, replaced: [] } };
    }
    if (url.startsWith("/api/admin/front-page/pins?")) return pagePins({ pins: pinned ? [{ ...PIN, slot: 2 }] : [] });
  };
  await show();
  fireEvent.change(screen.getByRole("searchbox", { name: "Find a published story" }), { target: { value: "फाइनल" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Search" })));
  expect(sent.some((s) => s.url === `/api/admin/front-page/stories?language=hi&q=${encodeURIComponent("फाइनल")}`)).toBe(true);
  expect(screen.getByRole("radio", { name: /भारत ने फाइनल जीता/ })).toBeChecked();
  fireEvent.change(screen.getByRole("combobox", { name: "Slot" }), { target: { value: "2" } });
  fireEvent.change(screen.getByRole("combobox", { name: "For" }), { target: { value: "72" } });
  expect(screen.getByRole("combobox", { name: "Starts" })).toHaveValue("now");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Pin to slot 2" })));
  const post = sent.find((s) => s.init?.method === "POST");
  expect(JSON.parse(String(post?.init?.body))).toEqual({ language: "hi", section: null, slot: 2, story_id: "s-1", starts_at: null, hours: 72 });
  expect(await screen.findByText(/Pinned to slot 2/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "भारत ने फाइनल जीता" })).toHaveAttribute("href", "/admin/desk/s-1");
});

test("a refused pin keeps the form and shows the server's words", async () => {
  route = (url, init) => {
    if (url === "/api/admin/me") return { status: 200, body: EDITOR };
    if (url.startsWith("/api/admin/front-page/stories?")) return { status: 200, body: { stories: [{ id: "s-1", headline: "Final", published_at: null }], may_pin: true } };
    if (url === "/api/admin/front-page/pins" && init?.method === "POST") return { status: 409, body: { error: "The story is already pinned on this page. Unpin it there first.", code: "already_pinned" } };
    if (url.startsWith("/api/admin/front-page/pins?")) return pagePins();
  };
  await show();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Search" })));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Pin to slot 1" })));
  expect(screen.getByRole("alert")).toHaveTextContent("already pinned on this page");
  expect(screen.getByRole("radio", { name: /Final/ })).toBeInTheDocument();
});

test("a search with no match says what can be pinned", async () => {
  route = (url) => {
    if (url === "/api/admin/me") return { status: 200, body: EDITOR };
    if (url.startsWith("/api/admin/front-page/stories?")) return { status: 200, body: { stories: [], may_pin: true } };
    if (url.startsWith("/api/admin/front-page/pins?")) return pagePins();
  };
  await show();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Search" })));
  expect(screen.getByText(/No published story of this page matches/)).toBeInTheDocument();
});

test("unpinning asks first in the back office's popup; Unpin ends the pin and the slots reload", async () => {
  let ended = false;
  route = (url, init) => {
    if (url === "/api/admin/me") return { status: 200, body: EDITOR };
    if (url === "/api/admin/front-page/pins/p-1/end" && init?.method === "POST") {
      ended = true;
      return { status: 200, body: { pin: { ...PIN, ended_at: "2026-11-20T10:00:00Z" } } };
    }
    if (url.startsWith("/api/admin/front-page/pins?")) return pagePins({ pins: ended ? [] : [PIN] });
  };
  await show();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Unpin" })));
  const dialog = await screen.findByRole("dialog", { name: "Unpin this story?" });
  await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" })));
  expect(ended).toBe(false);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Unpin" })));
  const again = await screen.findByRole("dialog", { name: "Unpin this story?" });
  await act(async () => fireEvent.click(within(again).getByRole("button", { name: "Unpin" })));
  expect(ended).toBe(true);
  expect(screen.getAllByText("Empty: nothing pinned.")).toHaveLength(3);
});

test("only the banner for a holder of breaking_banner.manage alone; nothing for a role without either", async () => {
  route = (url) => (url === "/api/admin/me" ? { status: 200, body: staffMe({ "breaking_banner.manage": "act" }) } : undefined);
  await show();
  expect(screen.queryByRole("list", { name: "Slots" })).toBeNull();
  expect(screen.getByRole("heading", { name: "Breaking News Manager" })).toBeInTheDocument();
  expect(sent.some((s) => s.url.startsWith("/api/admin/front-page/"))).toBe(false);
});

test("a role without the front page is told who arranges it", async () => {
  route = (url) => (url === "/api/admin/me" ? { status: 200, body: staffMe({ "article.view_admin": "read" }, "en") } : undefined);
  await show();
  expect(screen.getByText(/Your roles do not include the front page/)).toBeInTheDocument();
});
