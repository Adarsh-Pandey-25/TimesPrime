/**
 * @jest-environment node
 *
 * R2: outside stories live at /article/{headline-slug}-{article_id}.
 */

import { storyIdFrom, storyPath, storySegment, storySlug } from "./storyUrl";

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
