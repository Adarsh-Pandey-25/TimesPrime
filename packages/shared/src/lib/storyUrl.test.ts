/**
 * @jest-environment node
 *
 * R2: outside stories live at /article/{headline-slug}-{article_id}. Panel 2: the Desk's own stories
 * live at /{section}/{slug}-{number}, and at /hi/{section}/{slug}-{number} in Hindi.
 */

import { deskStoryIdFrom, deskStoryNumberFrom, deskStoryPath, storyIdFrom, storyPath, storySegment, storySlug } from "./storyUrl";

const ID = "3f9a0c21b7d44e0e9a6b5c4d3e2f1a0b";
const story = (title: string, article_id = ID) => ({ article_id, title, link: "https://publisher.example/a?b=1" });

test.each([
  ["India wins the series by 3-1", "india-wins-the-series-by-3-1"],
  ["  Café owners: what's next?  ", "cafe-owners-what-s-next"],
  ["संसद में बजट पास", ""],
  ["RBI keeps रेपो rate at 6.5%", "rbi-keeps-rate-at-6-5"],
  ["", ""],
])("the slug of %j is %j", (title, slug) => {
  expect(storySlug(title)).toBe(slug);
});

test("a slug stops at a whole word before 80 characters", () => {
  const slug = storySlug("word ".repeat(40));
  expect(slug.length).toBeLessThanOrEqual(80);
  expect(slug.endsWith("-")).toBe(false);
  expect(slug).toMatch(/^(word-)*word$/);
});

test("a story's path is its slug and its id, and holds no publisher link", () => {
  expect(storyPath(story("India wins the series"))).toBe(`/article/india-wins-the-series-${ID}`);
  expect(storyPath(story("संसद में बजट पास"))).toBe(`/article/${ID}`);
  expect(storyPath(story("India wins the series"))).not.toContain("publisher.example");
});

test("a story whose id is not letters and digits keeps the old address", () => {
  const odd = story("A story", "https://publisher.example/a");
  expect(storyPath(odd)).toBe("/article/story?url=https%3A%2F%2Fpublisher.example%2Fa%3Fb%3D1");
  expect(storySegment(odd)).toBeNull();
});

test.each([
  [`india-wins-the-series-${ID}`, ID],
  [ID, ID],
  [`an-old-headline-${ID}`, ID],
  ["india-wins", "wins"],
  ["", null],
  ["story", "story"],
  ["bad-id-with-%2F", null],
])("the id in %j is %j", (segment, id) => {
  expect(storyIdFrom(segment)).toBe(id);
});

test("the segment round-trips to the id", () => {
  const segment = storySegment(story("Markets close higher"))!;
  expect(segment).toBe(`markets-close-higher-${ID}`);
  expect(storyIdFrom(segment)).toBe(ID);
});

describe("the Desk's stories", () => {
  test("English at /{section}/{slug}-{number}, Hindi under /hi/, and the number alone without a slug", () => {
    expect(deskStoryPath({ language: "en", section: "india", slug: "budget-passes", public_id: 1024 })).toBe("/india/budget-passes-1024");
    expect(deskStoryPath({ language: "hi", section: "sports", slug: "bharat-jeeta", public_id: 7 })).toBe("/hi/sports/bharat-jeeta-7");
    expect(deskStoryPath({ language: "en", section: "world", slug: null, public_id: 8 })).toBe("/world/8");
  });

  test.each([
    ["budget-passes-1024", 1024],
    ["1024", 1024],
    ["2026-budget-passes-15", 15],
    ["budget-passes", null],
    ["budget-passes-0", null],
    ["budget-passes-007", null],
    ["budget-passes-1234567890123456", null],
    ["budget-passes-12a", null],
    ["", null],
  ])("the number in %j is %j", (segment, id) => {
    expect(deskStoryIdFrom(segment)).toBe(id);
  });

  test("the path round-trips to the number", () => {
    const path = deskStoryPath({ language: "hi", section: "india", slug: "sansad-mein-bajat", public_id: 31 });
    expect(deskStoryIdFrom(path.split("/").pop()!)).toBe(31);
  });

  // Panel 7: the address a grievance names, as a reader pastes it.
  const isSection = (key: string) => ["india", "sports"].includes(key);
  test.each([
    ["https://timesprime247.com/india/budget-passes-1024", 1024],
    ["https://timesprime247.com/hi/sports/bharat-jeeta-7?utm_source=whatsapp#top", 7],
    ["/india/budget-passes-1024", 1024],
    [" /india/1024 ", 1024],
    ["https://timesprime247.com/opinion/budget-passes-1024", null],
    ["https://timesprime247.com/article/budget-passes-1024", null],
    ["https://timesprime247.com/india/budget-passes-1024/more", null],
    ["https://timesprime247.com/hi/india", null],
    ["The budget story from Monday", null],
    ["", null],
  ])("a grievance about %j names story %j", (address, id) => {
    expect(deskStoryNumberFrom(address, isSection)).toBe(id);
  });
});
