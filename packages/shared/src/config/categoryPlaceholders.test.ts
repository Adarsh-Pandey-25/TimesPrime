/**
 * @jest-environment node
 *
 * B-03 (Phase B): every story shows our own drawing for its category, never a stock photo and
 * never the publisher's photo.
 */

import fs from "fs";
import path from "path";
import { assignPlaceholders, PLACEHOLDER_KEYS, placeholderFor, placeholderKey, thumbnailFor } from "./categoryPlaceholders";
import type { Article } from "../types";

const story = (category?: string[], country?: string[], image_url?: string): Article => ({
  article_id: "a",
  title: "t",
  link: "https://publisher.example/a",
  pubDate: "2026-11-16 06:00:00",
  category,
  country,
  image_url,
});

test.each([
  [["business"], undefined, "business"],
  [["top", "technology"], undefined, "technology"],
  [["tech"], undefined, "technology"],
  [["World"], undefined, "world"],
  [["top"], ["india"], "india"],
  [["top"], ["in"], "india"],
  [["sports"], ["india"], "sports"],
  [["top"], ["united states of america"], "general"],
  [undefined, undefined, "general"],
  [["politics"], undefined, "general"],
])("category %j, country %j: %s", (category, country, key) => {
  expect(placeholderKey(story(category, country))).toBe(key);
});

test("the publisher's photo is never used, whatever the row carries", () => {
  expect(placeholderFor(story(["business"], undefined, "https://publisher.example/photo.jpg"))).toBe("/placeholders/business.svg");
});

test("a list gets one image per story", () => {
  const a = story(["sports"]);
  const b = story(["health"]);
  const images = assignPlaceholders([a, b]);
  expect(images.get(a)).toBe("/placeholders/sports.svg");
  expect(images.get(b)).toBe("/placeholders/health.svg");
});

test("a small thumbnail gets the same category's drawing without its label (BL-045)", () => {
  expect(thumbnailFor(story(["business"]))).toBe("/placeholders/business-thumb.svg");
  expect(thumbnailFor(story(["top"], ["in"]))).toBe("/placeholders/india-thumb.svg");
  expect(thumbnailFor(story(undefined, undefined, "https://publisher.example/photo.jpg"))).toBe("/placeholders/general-thumb.svg");
});

test("a thumbnail has no label to crop: 4:3, and no text but the TP mark", () => {
  const dir = path.resolve(__dirname, "../../../../apps/web/public/placeholders");
  for (const key of PLACEHOLDER_KEYS) {
    const svg = fs.readFileSync(path.join(dir, `${key}-thumb.svg`), "utf8");
    expect(svg).toContain('viewBox="0 0 400 300"');
    const texts = [...svg.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map((m) => m[1].replace(/<[^>]+>/g, ""));
    expect(texts).toEqual(["TP"]);
  }
});

test("every drawing and thumbnail exists, is our own SVG and loads nothing from elsewhere", () => {
  const dir = path.resolve(__dirname, "../../../../apps/web/public/placeholders");
  const files = PLACEHOLDER_KEYS.flatMap((key) => [`${key}.svg`, `${key}-thumb.svg`]);
  for (const file of files) {
    const svg = fs.readFileSync(path.join(dir, file), "utf8");
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toContain("TimesPrime");
    expect(svg).not.toMatch(/<script|<image|href=|url\((?!#)/i);
  }
  expect(fs.readdirSync(dir).sort()).toEqual(files.sort());
});
