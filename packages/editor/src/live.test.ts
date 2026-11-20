/**
 * @jest-environment node
 *
 * A live update's smaller schema (Panel 3 design §2, M3): paragraphs whose text may be bold, italic
 * or a link, and at most one library image. Anything else is refused before it is stored.
 */

import { getSchema } from "@tiptap/core";
import { LIVE_BLOCKS_MAX, LIVE_TEXT_MAX, liveBodyProblem, liveExtensions } from "./live";

const IMAGE = "c0ffee00-0000-4000-8000-000000000001";
const text = (value: string, marks?: unknown[]) => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
const paragraph = (...content: unknown[]) => ({ type: "paragraph", content });
const doc = (...content: unknown[]) => ({ type: "doc", content });
const image = (attrs: Record<string, unknown> = { id: IMAGE, ratio: "16x9" }) => ({ type: "image", attrs });

test("paragraphs with bold, italic, links and line breaks, and one library image, are fine", () => {
  const body = doc(
    paragraph(text("Polls close at "), text("6 pm", [{ type: "bold" }]), { type: "hardBreak" }, text("Turnout so far: 61%.", [{ type: "italic" }])),
    image(),
    paragraph(text("Live results", [{ type: "link", attrs: { href: "https://eci.gov.in/results", target: "_blank", rel: "noopener noreferrer nofollow", class: null } }])),
    paragraph(text("Our earlier story", [{ type: "link", attrs: { href: "/india/polls-close-12" } }])),
    { type: "paragraph" }
  );
  expect(liveBodyProblem(body)).toBeNull();
  expect(liveBodyProblem(doc(paragraph(text("मतदान शाम 6 बजे तक"))))).toBeNull();
});

test.each([
  ["not a document", { type: "paragraph" }],
  ["nothing at all", doc()],
  ["only an image", doc(image())],
  ["only spaces", doc(paragraph(text("   ")))],
  ["a heading", doc({ type: "heading", attrs: { level: 2 }, content: [text("Results")] })],
  ["a list", doc({ type: "bulletList", content: [] })],
  ["an embed", doc({ type: "embed", attrs: { url: "https://www.youtube.com/watch?v=x" } })],
  ["two images", doc(paragraph(text("Two")), image(), image())],
  ["an image not in the library", doc(paragraph(text("A")), image({ id: "https://example.com/a.jpg" }))],
  ["an image with an unknown crop", doc(paragraph(text("A")), image({ id: IMAGE, ratio: "2x1" }))],
  ["code", doc(paragraph(text("x", [{ type: "code" }])))],
  ["a javascript: link", doc(paragraph(text("x", [{ type: "link", attrs: { href: "javascript:alert(1)" } }])))],
  ["an http link", doc(paragraph(text("x", [{ type: "link", attrs: { href: "http://example.com" } }])))],
  ["a link with an onclick", doc(paragraph(text("x", [{ type: "link", attrs: { href: "https://example.com", onclick: "x()" } }])))],
  ["a mention node", doc(paragraph({ type: "mention", attrs: { id: "u-1" } }))],
])("%s is refused", (_case, body) => {
  expect(liveBodyProblem(body)).toEqual(expect.any(String));
});

test("the limits: paragraphs and characters", () => {
  expect(liveBodyProblem(doc(...Array.from({ length: LIVE_BLOCKS_MAX + 1 }, () => paragraph(text("x")))))).toMatch(/1 to 30 paragraphs/);
  expect(liveBodyProblem(doc(paragraph(text("x".repeat(LIVE_TEXT_MAX)))))).toBeNull();
  expect(liveBodyProblem(doc(paragraph(text("x".repeat(LIVE_TEXT_MAX + 1)))))).toMatch(/at most 5000 characters/);
});

test("the editor's schema makes only what the check accepts: no headings, lists, quotes, code, embeds or galleries", () => {
  const schema = getSchema(liveExtensions());
  expect(Object.keys(schema.nodes).sort()).toEqual(["doc", "hardBreak", "image", "paragraph", "text"]);
  expect(Object.keys(schema.marks).sort()).toEqual(["bold", "italic", "link"]);
});
