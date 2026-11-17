/**
 * @jest-environment node
 *
 * R2: each section at its own URL; the top stories at /.
 */

import { isSection, SECTION_IDS, sectionMetadata, sectionPath } from "./sections";

test("the sections are the feed's categories, without the top stories", () => {
  expect(SECTION_IDS).toEqual(["india", "world", "tech", "business", "sports", "entertainment", "health", "science"]);
  expect(isSection("general")).toBe(false);
  expect(isSection("technology")).toBe(false);
  expect(isSection("")).toBe(false);
  expect(isSection(undefined)).toBe(false);
});

test.each([
  ["general", "", "/"],
  ["india", "", "/india"],
  ["tech", "", "/tech"],
  ["sports", "Cricket", "/sports?search=Cricket"],
  ["general", "budget & tax", "/?search=budget%20%26%20tax"],
  ["unknown", "", "/"],
])("%s with search %j is %s", (category, search, path) => {
  expect(sectionPath(category, search)).toBe(path);
});

test("a section's title and description name it", () => {
  expect(sectionMetadata("tech")).toEqual({
    title: "Technology News",
    description: "The latest technology headlines on TimesPrime, each with a short summary and a link to the full story at its source.",
  });
});
