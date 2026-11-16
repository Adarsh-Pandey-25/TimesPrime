/**
 * The outside-story page's view (B-05, Phase B, approved by the owner's senior on 16 Nov 2026):
 * the headline, NewsData's short summary, the source, the time and a link to the full story on the
 * publisher's site. No publisher text, no translation, nothing invented. Its links out to the
 * publisher stay guarded (F-005): http(s), a named host, no credentials, no IP literal.
 */

import { render, screen } from "@testing-library/react";
import ArticleDetailView, { storyTime } from "./ArticleDetailView";
import { ThemeProvider } from "@timesprime/ui/ThemeContext";
import { LanguageProvider } from "@/context/LanguageContext";
import type { Article } from "@timesprime/shared/types";

const STORY: Article = {
  article_id: "a1",
  title: "Budget passes the lower house",
  link: "https://publisher.example/story",
  description: "The lower house voted for the annual budget on Tuesday.",
  source_name: "Publisher Example",
  pubDate: "2026-11-16 06:00:00",
  category: ["business"],
  language: "english",
};

beforeEach(() => {
  global.fetch = jest.fn(async () => new Response(JSON.stringify({}), { status: 200 })) as typeof fetch;
  window.localStorage.clear();
});

function show(story: Article = STORY, language: "en" | "hi" = "en") {
  if (language === "hi") window.localStorage.setItem("timesprime_language", "hi");
  return render(
    <ThemeProvider>
      <LanguageProvider>
        <ArticleDetailView story={story} allArticles={[]} />
      </LanguageProvider>
    </ThemeProvider>
  );
}

describe("what an outside story shows", () => {
  test("the headline, the source's own summary, the source and the time in IST", () => {
    show();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Budget passes the lower house");
    expect(screen.getByText("The lower house voted for the annual budget on Tuesday.")).toBeInTheDocument();
    expect(screen.getByText("Summary, as published by Publisher Example")).toBeInTheDocument();
    expect(screen.getByText("Source: Publisher Example")).toBeInTheDocument();
    expect(screen.getByText(/16 Nov 2026.*11:30.*IST/i)).toBeInTheDocument();
  });

  test("a link to the full story at the source, opening the publisher's site", () => {
    show();
    const link = screen.getByRole("link", { name: "Read the full story at Publisher Example" });
    expect(link).toHaveAttribute("href", "https://publisher.example/story");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText(/TimesPrime shows only the headline and a short summary here\./)).toBeInTheDocument();
  });

  test("nothing invented: no AI summary, no poll or vote counts, no house byline, no made-up highlights", () => {
    const { container } = show();
    expect(container.textContent).not.toMatch(
      /AI Executive Summary|Key Highlights|Reader Opinion Poll|votes|TimesPrime Desk|Verified global reporting|min read|Follow us/
    );
  });

  test("without a summary, the summary section is left out", () => {
    show({ ...STORY, description: null });
    expect(screen.queryByText(/Summary, as published by/)).toBeNull();
  });

  test("without a source name, the publisher's domain names the source", () => {
    show({ ...STORY, source_name: undefined });
    expect(screen.getByText("Source: publisher.example")).toBeInTheDocument();
  });

  test("in Hindi, the page's own words are Hindi; the story stays as published", async () => {
    show(STORY, "hi");
    expect(await screen.findByText("स्रोत: Publisher Example")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "पूरी खबर Publisher Example पर पढ़ें" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Budget passes the lower house");
  });
});

// B-06: the askTimesPrime panel follows the AI chat switch.
describe("the askTimesPrime panel", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_AI_CHAT_ENABLED;
  });

  test("is hidden while the AI chat is off (the default)", () => {
    show();
    expect(screen.queryByPlaceholderText("Ask anything about this article...")).toBeNull();
  });

  test('is shown when NEXT_PUBLIC_AI_CHAT_ENABLED is "1"', () => {
    process.env.NEXT_PUBLIC_AI_CHAT_ENABLED = "1";
    show();
    expect(screen.getByPlaceholderText("Ask anything about this article...")).toBeInTheDocument();
  });
});

describe("the publisher link stays guarded (F-005)", () => {
  test.each(["http://127.0.0.1/admin", "https://user:pw@publisher.example/story", "http://[::1]/", "ftp://publisher.example/story"])(
    "no link goes to %s, and no read-at-source button is shown",
    (bad) => {
      const { container } = show({ ...STORY, link: bad });
      const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
      expect(hrefs.some((h) => h === bad || h.startsWith(bad.slice(0, 12)))).toBe(false);
      expect(screen.queryByRole("link", { name: /Read the full story/ })).toBeNull();
    }
  );
});

describe("storyTime", () => {
  test("NewsData's zoneless UTC time is shown in IST", () => {
    expect(storyTime("2026-11-16 18:45:00", "en")).toMatch(/17 Nov 2026.*12:15.*IST/i);
  });

  test("a stored time with a zone is read as given", () => {
    expect(storyTime("2026-11-16T06:00:00+00:00", "en")).toMatch(/16 Nov 2026.*11:30.*IST/i);
  });

  test("no time, or a broken one, shows nothing", () => {
    expect(storyTime(undefined, "en")).toBeNull();
    expect(storyTime("not a date", "en")).toBeNull();
  });
});
