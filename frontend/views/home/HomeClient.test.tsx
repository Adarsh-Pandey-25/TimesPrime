/**
 * The home feed's client-side fetches (F-021). The Header is stubbed with
 * buttons that call its onSelectCategory/onSearch props, each card renders
 * its title, and `fetch` is controlled per test: `feedCalls()` lists every
 * /api/news/top-headlines request in order.
 */

let searchParams = new URLSearchParams();
let language: "en" | "hi" = "en";

jest.mock("next/navigation", () => ({ useSearchParams: () => searchParams }));
jest.mock("@/frontend/context/LanguageContext", () => ({ useLanguage: () => ({ language, setLanguage: jest.fn() }) }));
jest.mock("@/frontend/features/news", () => ({
  Header: ({ onSelectCategory, onSearch }: { onSelectCategory: (c: string) => void; onSearch: (q: string) => void }) => (
    <div>
      <button onClick={() => onSelectCategory("sports")}>cat:sports</button>
      <button onClick={() => onSelectCategory("technology")}>cat:technology</button>
      <button onClick={() => onSearch("budget")}>search:budget</button>
    </div>
  ),
  Footer: () => null,
  MarqueeTicker: () => null,
  ArticleCard: ({ article }: { article: { title: string } }) => <div data-testid="card">{article.title}</div>,
}));

import { act, fireEvent, render, screen } from "@testing-library/react";
import HomeClient from "./HomeClient";
import { ThemeProvider } from "@/frontend/context/ThemeContext";
import type { Article } from "@/backend/shared/types";

const article = (title: string): Article => ({
  article_id: title,
  title,
  link: `https://publisher.example/${encodeURIComponent(title)}`,
  pubDate: "2026-11-02 06:00:00",
  description: "",
  source_id: "example",
  language: "en",
  category: ["top"],
  country: ["india"],
});

const feed = (...titles: string[]) => ({ results: titles.map(article) });

/** Answers each feed request from `answer(url)`; other requests get an empty body. */
function serveFeed(answer: (url: string) => object) {
  global.fetch = jest.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => (String(url).startsWith("/api/news/top-headlines") ? answer(String(url)) : {}),
  })) as unknown as typeof fetch;
}

const feedCalls = () =>
  (global.fetch as jest.Mock).mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith("/api/news/top-headlines"));

const titles = () => screen.queryAllByTestId("card").map((c) => c.textContent);

beforeEach(() => {
  searchParams = new URLSearchParams();
  language = "en";
  serveFeed((url) => feed(`answer for ${url}`));
});

function renderHome(initial = feed("Initial story").results) {
  return render(
    <ThemeProvider>
      <HomeClient initialArticles={initial} initialCategory="general" initialSearch="" />
    </ThemeProvider>
  );
}

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

describe("the home feed's fetches (characterization, F-021)", () => {
  test("the server's articles are shown without a client fetch", async () => {
    await act(async () => {
      renderHome();
    });
    expect(titles()).toContain("Initial story");
    expect(feedCalls()).toEqual([]);
  });

  test("choosing a category fetches it and shows its articles", async () => {
    serveFeed(() => feed("Sports story"));
    renderHome();
    await click("cat:sports");
    expect(feedCalls()).toContain("/api/news/top-headlines?category=sports&language=en");
    expect(titles()).toContain("Sports story");
  });

  // BL-027: while searching, the featured slot is hidden, and the grids used
  // to start at the second article, so the best match was never shown.
  test("a search fetches with q and shows every match, the first one included", async () => {
    serveFeed(() => feed("Budget passes", "Budget debate", "Weather today", "Budget vote"));
    renderHome();
    await click("search:budget");
    expect(feedCalls()).toContain("/api/news/top-headlines?category=general&language=en&q=budget");
    expect(titles()).toEqual(["Budget passes", "Budget debate", "Budget vote"]);
  });

  test("without a search, the first article is the featured one and is not repeated in the grids", async () => {
    serveFeed(() => feed("Lead story", "Second", "Third"));
    renderHome();
    await click("cat:sports");
    expect(titles().filter((t) => t === "Lead story")).toHaveLength(1);
    expect(titles()).toEqual(["Lead story", "Second", "Third"]);
  });

  test("a language change refetches the current category in that language", async () => {
    const { rerender } = renderHome();
    language = "hi";
    await act(async () => {
      rerender(
        <ThemeProvider>
          <HomeClient initialArticles={feed("Initial story").results} initialCategory="general" initialSearch="" />
        </ThemeProvider>
      );
    });
    expect(feedCalls()).toContain("/api/news/top-headlines?category=general&language=hi");
  });
});

// Responses resolved in any order the test chooses. The mock ignores the
// abort signal on purpose: the sequence guard must hold even when a stale
// response still arrives.
type Pending = { url: string; signal?: AbortSignal; resolve: (body: object) => void };
let pending: Pending[];

function holdFeed() {
  pending = [];
  global.fetch = jest.fn(
    (url: string, init: RequestInit = {}) =>
      new Promise((resolve) => {
        const respond = (body: object) => resolve({ ok: true, status: 200, json: async () => body });
        if (String(url).startsWith("/api/news/top-headlines")) {
          pending.push({ url: String(url), signal: init.signal ?? undefined, resolve: respond });
        } else respond({});
      })
  ) as unknown as typeof fetch;
}

async function settle(request: Pending, body: object) {
  await act(async () => {
    request.resolve(body);
  });
}

describe("the home feed's fetches cannot race (F-021)", () => {
  beforeEach(() => holdFeed());

  test("a slow older response cannot overwrite a newer one, and the older request is aborted", async () => {
    renderHome();
    await click("cat:sports");
    await click("cat:technology");
    const sports = pending.find((p) => p.url.includes("category=sports"))!;
    const technology = pending.find((p) => p.url.includes("category=technology"))!;

    expect(sports.signal?.aborted).toBe(true);
    expect(technology.signal?.aborted).toBe(false);

    await settle(technology, feed("Technology story"));
    await settle(sports, feed("Sports story"));
    expect(titles()).toContain("Technology story");
    expect(titles()).not.toContain("Sports story");
  });

  test("the loading state ends with the newest request, not an aborted one", async () => {
    renderHome();
    await click("cat:sports");
    await click("cat:technology");
    const sports = pending.find((p) => p.url.includes("category=sports"))!;
    await settle(sports, feed("Sports story"));
    expect(screen.queryAllByTestId("card")).toEqual([]); // still loading technology
    await settle(pending.find((p) => p.url.includes("category=technology"))!, feed("Technology story"));
    expect(titles()).toContain("Technology story");
  });

  test("choosing a category sends exactly one request", async () => {
    renderHome();
    await click("cat:sports");
    expect(feedCalls()).toEqual(["/api/news/top-headlines?category=sports&language=en"]);
  });

  test("a URL change of both category and search sends exactly one request", async () => {
    const { rerender } = renderHome();
    searchParams = new URLSearchParams("category=sports&search=budget");
    await act(async () => {
      rerender(
        <ThemeProvider>
          <HomeClient initialArticles={feed("Initial story").results} initialCategory="general" initialSearch="" />
        </ThemeProvider>
      );
    });
    expect(feedCalls()).toEqual(["/api/news/top-headlines?category=sports&language=en&q=budget"]);
  });
});
