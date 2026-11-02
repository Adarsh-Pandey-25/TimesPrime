/**
 * The article view's links out to the publisher (F-005). Two of its four
 * sinks rendered `href={targetUrl}` guarded only by `targetUrl &&`. The page
 * now passes only a verified link, and every sink also requires
 * safePublisherHref: http(s), a named host, no credentials, no IP literal.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "util";
import ArticleDetailView from "./ArticleDetailView";
import { ThemeProvider } from "@/frontend/context/ThemeContext";
import { LanguageProvider } from "@/frontend/context/LanguageContext";

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
