/**
 * The article view's links out to the publisher (F-005). Two of its four
 * sinks rendered `href={targetUrl}` guarded only by `targetUrl &&`. The page
 * now passes only a verified link, and every sink also requires
 * safePublisherHref: http(s), a named host, no credentials, no IP literal.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "util";
import ArticleDetailView from "./ArticleDetailView";
import { ThemeProvider } from "@/context/ThemeContext";
import { LanguageProvider } from "@/context/LanguageContext";

beforeEach(() => {
  global.fetch = jest.fn(async () => new Response(JSON.stringify({}), { status: 200 })) as typeof fetch;
});

function hrefsFor(targetUrl: string | undefined, content?: string[]) {
  const { container, unmount } = render(
    <ThemeProvider>
      <LanguageProvider>
        <ArticleDetailView
          slug="budget-passes"
          targetUrl={targetUrl}
          scrapedData={{ title: "Budget passes", content }}
          allArticles={[]}
        />
      </LanguageProvider>
    </ThemeProvider>
  );
  const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
  unmount();
  return hrefs;
}

const SCRAPED = ["The annual budget passed the lower house on Tuesday after a long debate about priorities."];

describe.each([
  ["with scraped content", SCRAPED],
  ["without scraped content", undefined],
])("ArticleDetailView %s", (_label, content) => {
  test("a publisher link is rendered at every sink", () => {
    const hrefs = hrefsFor("https://publisher.example/story", content);
    expect(hrefs.filter((h) => h === "https://publisher.example/story").length).toBeGreaterThanOrEqual(2);
  });

  test.each(["http://127.0.0.1/admin", "https://user:pw@publisher.example/story", "http://[::1]/", "ftp://publisher.example/story"])(
    "no sink links to %s",
    (bad) => {
      const hrefs = hrefsFor(bad, content);
      expect(hrefs.some((h) => h === bad || h.startsWith(bad.slice(0, 12)))).toBe(false);
    }
  );
});

// The askTimesPrime panel (F-013). A fetch whose body streams `chunks`,
// read through getReader() as the panel reads it. jsdom has no
// TextEncoder/TextDecoder, which the panel uses; Node's are the same API.
Object.assign(global, { TextEncoder: NodeTextEncoder, TextDecoder: NodeTextDecoder });

function streamed(chunks: string[], init: { ok?: boolean; status?: number; json?: object } = {}) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => init.json ?? {},
    body: {
      getReader: () => ({
        read: async () => (i < chunks.length ? { done: false, value: encoder.encode(chunks[i++]) } : { done: true, value: undefined }),
      }),
    },
  };
}

function renderPanel() {
  render(
    <ThemeProvider>
      <LanguageProvider>
        <ArticleDetailView slug="budget-passes" scrapedData={{ title: "Budget passes", description: "The lower house voted." }} allArticles={[]} />
      </LanguageProvider>
    </ThemeProvider>
  );
}

async function ask(question: string) {
  const input = screen.getByPlaceholderText("Ask anything about this article...");
  fireEvent.change(input, { target: { value: question } });
  await act(async () => {
    fireEvent.submit(input.closest("form") as HTMLFormElement);
  });
}

const chatCalls = () => (global.fetch as jest.Mock).mock.calls.filter(([url]) => url === "/api/chat");

describe("askTimesPrime: a successful answer (characterization, F-013)", () => {
  test("the question and the article go to /api/chat, and the streamed answer is shown under 'AI Answer:'", async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) =>
      url === "/api/chat" ? streamed(["The budget ", "passed on Tuesday."]) : new Response("{}", { status: 200 })
    );
    renderPanel();
    await ask("What passed?");
    expect(chatCalls()).toHaveLength(1);
    expect(JSON.parse(chatCalls()[0][1].body)).toEqual({
      message: "What passed?",
      articleContext: { title: "Budget passes", description: "The lower house voted." },
    });
    expect(screen.getByText("AI Answer:")).toBeInTheDocument();
    expect(screen.getByText(/The budget passed on Tuesday\./)).toBeInTheDocument();
  });

  test("an empty question sends nothing", async () => {
    renderPanel();
    await ask("   ");
    expect(chatCalls()).toHaveLength(0);
  });
});

// The panel answered every failure with a made-up "Key Takeaway" about the
// article, presented as the AI's answer. It now says the request failed and
// why, as the chatbot does, and shows no answer.
describe("askTimesPrime: a failure is reported, never answered (F-013)", () => {
  const FABRICATED = /Key Takeaway|key insight|Stay tuned to TimesPrime/;

  function chatAnswers(answer: () => Promise<unknown>) {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) =>
      url === "/api/chat" ? answer() : new Response("{}", { status: 200 })
    );
  }

  beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  test.each([
    ["an HTTP error, with the server's message", async () => streamed([], { ok: false, status: 503, json: { error: "AI service unavailable." } }), "Sorry, that request failed: AI service unavailable."],
    ["an HTTP error without a message", async () => streamed([], { ok: false, status: 500 }), "Sorry, that request failed: AI query failed with status 500"],
    ["a network error", async () => { throw new TypeError("Failed to fetch"); }, "Sorry, that request failed: Failed to fetch"],
  ])("%s", async (_label, answer, message) => {
    chatAnswers(answer);
    renderPanel();
    await ask("What passed?");
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByText("AI Answer:")).toBeNull();
    expect(document.body.textContent).not.toMatch(FABRICATED);
  });

  test("an empty answer says so, instead of a canned insight", async () => {
    chatAnswers(async () => streamed([]));
    renderPanel();
    await ask("What passed?");
    expect(screen.getByRole("alert")).toHaveTextContent("I'm having trouble processing that request right now.");
    expect(screen.queryByText("AI Answer:")).toBeNull();
    expect(document.body.textContent).not.toMatch(FABRICATED);
  });

  test("a stream that breaks midway replaces the partial answer with the error", async () => {
    const res = streamed(["The budget "]);
    const reader = res.body.getReader();
    let first = true;
    res.body.getReader = () => ({
      read: async () => {
        if (first) { first = false; return reader.read(); }
        throw new Error("network error");
      },
    });
    chatAnswers(async () => res);
    renderPanel();
    await ask("What passed?");
    expect(screen.getByRole("alert")).toHaveTextContent("Sorry, that request failed: network error");
    expect(screen.queryByText("AI Answer:")).toBeNull();
    expect(document.body.textContent).not.toContain("The budget ");
  });

  test("a new question clears the previous error", async () => {
    chatAnswers(async () => { throw new TypeError("Failed to fetch"); });
    renderPanel();
    await ask("What passed?");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    chatAnswers(async () => streamed(["It passed."]));
    await ask("And then?");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/It passed\./)).toBeInTheDocument();
  });
});

// What the story area shows for each kind of scrape result (characterization,
// F-017): the paragraphs, the subscriber-only notice, or the "read at source"
// card when there is nothing to show.
describe("the story area (characterization, F-017)", () => {
  function story(scrapedData: { title?: string; content?: string[]; isPaywalled?: boolean; description?: string }) {
    const { container, unmount } = render(
      <ThemeProvider>
        <LanguageProvider>
          <ArticleDetailView slug="budget-passes" targetUrl="https://publisher.example/story" scrapedData={scrapedData} allArticles={[]} />
        </LanguageProvider>
      </ThemeProvider>
    );
    const text = container.querySelector("article")?.textContent ?? "";
    unmount();
    return text;
  }

  test("scraped paragraphs are shown", () => {
    const text = story({ title: "Budget passes", content: SCRAPED });
    expect(text).toContain(SCRAPED[0]);
    expect(text).not.toContain("Full Story Available at Source");
  });

  test("a paywalled page shows the subscriber-only notice and its description", () => {
    const text = story({ title: "Locked", content: [], isPaywalled: true, description: "The teaser." });
    expect(text).toContain("Subscriber-only article");
    expect(text).toContain("The teaser.");
  });

  test.each([[[]], [undefined]])("no content (%p) shows the read-at-source card", (content) => {
    const text = story({ title: "Budget passes", content });
    expect(text).toContain("Full Story Available at Source");
    expect(text).toContain("Read Full Article →");
  });
});
