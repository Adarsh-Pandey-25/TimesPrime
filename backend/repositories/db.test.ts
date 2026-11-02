/**
 * @jest-environment node
 *
 * BL-014: during a Supabase outage every failed operation reached Sentry —
 * five events per feed request. These tests simulate a failing database and
 * pin the reporting to at most one event per operation per window.
 */

jest.mock("@sentry/nextjs", () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));
jest.mock("@/backend/services/classify/categoryClassifier", () => ({ classifyCategoryRelevance: jest.fn(() => Promise.resolve()) }));
jest.mock("@/backend/lib/supabase", () => ({ supabase: { from: jest.fn() }, isSupabaseConfigured: jest.fn(() => true) }));

import { findArticleByLink, getDBArticles, getLatestArticleTimestamp, saveArticlesToDB } from "./db";
import { FALLBACK_REPORT_WINDOW_MS } from "@/backend/lib/reportFallback";
import type { Article } from "@/shared/types";

const sentry = jest.requireMock("@sentry/nextjs") as { captureMessage: jest.Mock; captureException: jest.Mock };
const { supabase } = jest.requireMock("@/backend/lib/supabase") as { supabase: { from: jest.Mock } };

// A query builder that accepts any chain of calls and resolves to `result`,
// the way supabase-js reports a network failure: no throw, an error object.
function failingQuery(result: object): object {
  const proxy: object = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") return (resolve: (value: object) => void) => resolve(result);
        return () => proxy;
      },
    }
  );
  return proxy;
}

const OUTAGE = { data: null, count: null, error: { message: "TypeError: fetch failed", code: "" } };

const article: Article = {
  article_id: "bl014-test-article",
  title: "Parliament passes the annual budget",
  link: "https://example.com/news/budget",
  pubDate: "2026-10-30 06:00:00",
  description: "A routine story used to reach the upsert.",
  source_id: "example",
  language: "en",
  category: ["top"],
  country: ["india"],
};

/** The Supabase calls one top-headlines request makes when it falls through to NewsData.io. */
async function feedRequest() {
  await getLatestArticleTimestamp("top", "en");
  await saveArticlesToDB([article]);
  await getDBArticles("top", "", "en");
}

const events = () => sentry.captureMessage.mock.calls.length + sentry.captureException.mock.calls.length;

let clock = Date.parse("2026-10-30T00:00:00Z");
let silence: jest.SpyInstance[];

beforeEach(() => {
  jest.useFakeTimers();
  // A fresh window per test: the limiter keeps state across calls by design.
  clock += 10 * FALLBACK_REPORT_WINDOW_MS;
  jest.setSystemTime(clock);
  sentry.captureMessage.mockClear();
  sentry.captureException.mockClear();
  supabase.from.mockReset();
  supabase.from.mockImplementation(() => failingQuery(OUTAGE));
  silence = [jest.spyOn(console, "error").mockImplementation(() => {}), jest.spyOn(console, "warn").mockImplementation(() => {})];
});

afterEach(() => {
  for (const spy of silence) spy.mockRestore();
  jest.useRealTimers();
});

describe("db.ts during a Supabase outage (BL-014)", () => {
  test("a run of failing feed requests reports each operation at most once per window", async () => {
    await feedRequest();
    await feedRequest();
    await feedRequest();

    // Three distinct operations fail: freshness check, upsert, select.
    // Unthrottled this was 15 events, when each request also purged twice
    // (F-015 took the purge off this path).
    expect(events()).toBeLessThanOrEqual(3);
    const operations = sentry.captureMessage.mock.calls.map(([, options]) => options.extra.operation).sort();
    expect(operations).toEqual(["getDBArticles", "getLatestArticleTimestamp", "saveArticlesToDB"]);
  });

  test("reports again after the window, carrying how many were suppressed", async () => {
    await feedRequest();
    await feedRequest();
    await feedRequest();
    sentry.captureMessage.mockClear();

    jest.setSystemTime(clock + FALLBACK_REPORT_WINDOW_MS);
    await feedRequest();

    const select = sentry.captureMessage.mock.calls.find(([, options]) => options.extra.operation === "getDBArticles");
    // Three selects ran in the first window (one per request); one was reported.
    expect(select?.[1].extra.suppressedSinceLastReport).toBe(2);
    expect(events()).toBeLessThanOrEqual(3);
  });

  test("thrown failures are throttled the same way", async () => {
    supabase.from.mockImplementation(() => {
      throw new TypeError("fetch failed");
    });
    for (let i = 0; i < 5; i++) await getDBArticles("top", "", "en");
    // getDBArticles's select throws; one report (it purged too before F-015).
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
  });

  test("what readers get is unchanged: empty results, not errors", async () => {
    await expect(getLatestArticleTimestamp("top", "en")).resolves.toBeNull();
    await expect(getDBArticles("top", "", "en")).resolves.toEqual([]);
    await expect(saveArticlesToDB([article])).resolves.toEqual([article]);
  });
});

// F-015: the 7-day purge is a DELETE. It ran on every feed read and every
// upsert, against a database that may be production. It now runs only in the
// cron route (and the admin's explicit purge action).
describe("no purge on the read and write paths (F-015)", () => {
  // Records every query-builder method called, and resolves like a healthy database.
  function recordingQuery(calls: string[]): object {
    const proxy: object = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") return (resolve: (value: object) => void) => resolve({ data: [], count: 0, error: null });
          return () => {
            calls.push(String(prop));
            return proxy;
          };
        },
      }
    );
    return proxy;
  }

  test("a feed read issues no DELETE", async () => {
    const calls: string[] = [];
    supabase.from.mockImplementation(() => recordingQuery(calls));
    await getDBArticles("top", "", "en");
    expect(calls).toContain("select");
    expect(calls).not.toContain("delete");
  });

  test("an upsert issues no DELETE", async () => {
    const calls: string[] = [];
    supabase.from.mockImplementation(() => recordingQuery(calls));
    await saveArticlesToDB([article]);
    expect(calls).toContain("upsert");
    expect(calls).not.toContain("delete");
  });
});


// F-005: the article page asks whether its ?url= names a stored article.
describe("findArticleByLink (F-005)", () => {
  function answering(rows: object[], calls: Array<[string, unknown[]]>): object {
    const proxy: object = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") return (resolve: (value: object) => void) => resolve({ data: rows, error: null });
          return (...args: unknown[]) => {
            calls.push([String(prop), args]);
            return proxy;
          };
        },
      }
    );
    return proxy;
  }

  test("an exact match on link, read-only", async () => {
    const calls: Array<[string, unknown[]]> = [];
    supabase.from.mockImplementation(() => answering([{ title: "Budget", link: "https://publisher.example/a?b=1" }], calls));
    await expect(findArticleByLink("https://publisher.example/a?b=1")).resolves.toEqual({ title: "Budget", link: "https://publisher.example/a?b=1" });
    expect(calls).toContainEqual(["eq", ["link", "https://publisher.example/a?b=1"]]);
    expect(calls.map(([m]) => m)).not.toEqual(expect.arrayContaining(["delete", "update", "upsert", "insert"]));
  });

  test("no row, or a database failure, is not a match", async () => {
    supabase.from.mockImplementation(() => answering([], []));
    await expect(findArticleByLink("https://publisher.example/none")).resolves.toBeNull();
    supabase.from.mockImplementation(() => failingQuery(OUTAGE));
    await expect(findArticleByLink("https://publisher.example/none")).resolves.toBeNull();
  });
});

// F-006: the search term went into a PostgREST or=(...) filter unescaped,
// so a comma, dot or parenthesis in it could add filter clauses of its own.
describe("the feed search filter (F-006)", () => {
  /** Splits an or=(...) value into clauses the way PostgREST does: commas outside quotes and brackets. */
  function clauses(filter: string): string[] {
    const out: string[] = [];
    let current = "";
    let depth = 0;
    let quoted = false;
    for (let i = 0; i < filter.length; i++) {
      const c = filter[i];
      if (quoted && c === "\\") { current += c + filter[++i]; continue; }
      if (c === '"') quoted = !quoted;
      else if (!quoted && (c === "(" || c === "{")) depth++;
      else if (!quoted && (c === ")" || c === "}")) depth--;
      if (c === "," && !quoted && depth === 0) { out.push(current); current = ""; continue; }
      current += c;
    }
    out.push(current);
    return out;
  }
  /** The value PostgREST hands to ILIKE: the quoted string, unescaped. */
  const unquote = (value: string) => value.slice(1, -1).replace(/\\(.)/g, "$1");

  async function searchFilter(query: string): Promise<string> {
    const calls: Array<[string, unknown[]]> = [];
    const proxy: object = new Proxy({}, {
      get(_t, prop) {
        if (prop === "then") return (resolve: (v: object) => void) => resolve({ data: [], error: null });
        return (...args: unknown[]) => { calls.push([String(prop), args]); return proxy; };
      },
    });
    supabase.from.mockImplementation(() => proxy);
    await getDBArticles("tech", query, "en");
    const or = calls.filter(([m]) => m === "or").map(([, [f]]) => f as string);
    expect(or).toHaveLength(1);
    return or[0];
  }

  test("an ordinary search: two ILIKE clauses, title and description", async () => {
    const parts = clauses(await searchFilter("budget"));
    expect(parts).toEqual(['title.ilike."%budget%"', 'description.ilike."%budget%"']);
  });

  test.each([
    "x,id.gt.0",
    "x%,title.not.is.null",
    "a),or(title.ilike.*",
    'quote"),category.cs.{top}',
    "x\\\",id.eq.1",
    "a.b:c(d)e",
  ])("%j cannot add a clause, and is matched literally", async (query) => {
    const parts = clauses(await searchFilter(query));
    expect(parts).toHaveLength(2);
    expect(parts[0].startsWith('title.ilike."')).toBe(true);
    expect(parts[1].startsWith('description.ilike."')).toBe(true);
    for (const part of parts) {
      const value = unquote(part.slice(part.indexOf('"')));
      // LIKE-escaped: every % and _ the user typed is literal; only the outer two are wildcards.
      const literal = value.slice(1, -1).replace(/\\([\\%_])/g, "$1");
      expect(value.startsWith("%") && value.endsWith("%")).toBe(true);
      expect(literal).toBe(query.replace(/\*/g, ""));
    }
  });

  test("LIKE wildcards in the term are literal, and PostgREST's * wildcard is dropped", async () => {
    const value = unquote(clauses(await searchFilter("50%_off*\\"))[0].replace(/^title\.ilike\./, ""));
    // %50\%\_off\\% : literal %, literal _, literal backslash, between the two wildcards.
    expect(value).toBe("%50\\%\\_off\\\\%");
  });
});
