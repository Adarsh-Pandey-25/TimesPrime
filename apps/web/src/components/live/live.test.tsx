/**
 * A live blog on its reader page (Panel 3 design §5, M3): the updates as the server drew them, and
 * the page's check for new ones every 15 seconds while the tab is visible, offered with a button
 * instead of moving the page; a removal or the blog's end is shown at once.
 */

const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { LiveFeed, LiveUpdateView } from "@timesprime/shared/config/liveBlog";
import LiveBlogFeed from "./LiveBlogFeed";
import LiveWatcher from "./LiveWatcher";

const update = (id: string, over: Partial<LiveUpdateView> = {}): LiveUpdateView => ({
  id,
  headline: null,
  blocks: [{ kind: "p", runs: [{ text: `Update ${id}.` }] }],
  keyEvent: false,
  pinned: false,
  postedAt: "2026-11-20T09:00:00Z",
  editedAt: null,
  time: "20 Nov, 2:30 pm IST",
  ...over,
});

let answer: { status: number; body: unknown };
const fetchMock = jest.fn(async () => ({ ok: answer.status === 200, status: answer.status, json: async () => answer.body }));

beforeEach(() => {
  jest.useFakeTimers();
  refresh.mockClear();
  fetchMock.mockClear();
  global.fetch = fetchMock as unknown as typeof fetch;
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
});
afterEach(() => jest.useRealTimers());

describe("the feed as drawn", () => {
  test("Live, the key events as links, the pinned update first, then the rest newest first; runs, links and images", () => {
    const feed: LiveFeed = {
      endedAt: null,
      updates: [
        update("3", { headline: "Results declared", keyEvent: true, blocks: [{ kind: "p", runs: [{ text: "Full " }, { text: "results", href: "https://eci.gov.in", bold: true }, { br: true }, { text: "here." }] }] }),
        update("2", { pinned: true, headline: "How to follow", editedAt: "2026-11-20T09:10:00Z" }),
        update("1", { blocks: [{ kind: "image", alt: "Counting", caption: "At the centre", credit: "Staff", avif: "/media/a.avif 960w", webp: "/media/a.webp 960w", src: "/media/a.webp", width: 960, height: 540 }] }),
      ],
    };
    render(<LiveBlogFeed publicId={55} language="en" feed={feed} />);
    expect(screen.getByText("Live")).toBeInTheDocument();
    const keyEvents = screen.getByRole("navigation", { name: "Key events" });
    expect(within(keyEvents).getByRole("link", { name: /Results declared/ })).toHaveAttribute("href", "#update-3");
    const articles = screen.getAllByRole("article");
    expect(within(articles[0]).getByText("Pinned")).toBeInTheDocument();
    expect(within(articles[0]).getByText(/Updated/)).toBeInTheDocument();
    expect(articles.map((a) => a.id)).toEqual(["", "update-3", "update-1"]);
    expect(within(articles[1]).getByRole("link", { name: "results" })).toHaveAttribute("href", "https://eci.gov.in");
    expect(within(articles[1]).getByRole("link", { name: "results" })).toHaveAttribute("rel", "noopener noreferrer nofollow");
    expect(within(articles[2]).getByRole("img", { name: "Counting" })).toHaveAttribute("src", "/media/a.webp");
    expect(screen.getByText("At the centre · Staff")).toBeInTheDocument();
  });

  test("Hindi labels; an ended blog says so and does not check again; no updates says so", async () => {
    render(<LiveBlogFeed publicId={55} language="hi" feed={{ endedAt: "2026-11-20T12:00:00Z", updates: [] }} />);
    expect(screen.getByText("समाप्त")).toBeInTheDocument();
    expect(screen.getByText("अभी कोई अपडेट नहीं।")).toBeInTheDocument();
    await act(async () => jest.advanceTimersByTime(60_000));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the check for new updates", () => {
  const watch = (ids: string[]) => render(<LiveWatcher publicId={55} language="en" ids={ids} ended={false} />);
  const tick = () => act(async () => jest.advanceTimersByTime(15_000));

  test("every 15 seconds it reads the blog's one shared address; new updates are offered, not shown", async () => {
    answer = { status: 200, body: { endedAt: null, updates: [{ id: "4" }, { id: "3" }, { id: "2" }] } };
    watch(["2"]);
    await act(async () => jest.advanceTimersByTime(14_000));
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(1_000));
    expect(fetchMock).toHaveBeenCalledWith("/api/live/55");
    const button = screen.getByRole("button", { name: "2 new updates · Show" });
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test("a removed update, or the blog's end, is shown at once", async () => {
    answer = { status: 200, body: { endedAt: null, updates: [{ id: "3" }] } };
    const first = watch(["3", "2"]);
    await tick();
    expect(refresh).toHaveBeenCalledTimes(1);
    first.unmount();
    answer = { status: 200, body: { endedAt: "2026-11-20T12:00:00Z", updates: [{ id: "3" }] } };
    watch(["3"]);
    await tick();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  test("with the newest 50 shown, the oldest leaving as new ones arrive is not a removal", async () => {
    const shown = Array.from({ length: 50 }, (_, i) => String(50 - i));
    answer = { status: 200, body: { endedAt: null, updates: ["51", ...shown.slice(0, 49)].map((id) => ({ id })) } };
    watch(shown);
    await tick();
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "1 new update · Show" })).toBeInTheDocument();
  });

  test("a hidden tab is not checked; coming back checks at once; a failed check changes nothing", async () => {
    answer = { status: 200, body: { endedAt: null, updates: [{ id: "2" }, { id: "1" }] } };
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    watch(["1"]);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      jest.advanceTimersByTime(60_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "1 new update · Show" })).toBeInTheDocument();
    answer = { status: 503, body: { error: "x" } };
    await tick();
    expect(refresh).not.toHaveBeenCalled();
  });
});
