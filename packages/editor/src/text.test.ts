/**
 * @jest-environment node
 *
 * A story body's text, read from the stored Tiptap JSON without Tiptap.
 */

import { plainText, textBlocks, wordCount } from "./text";

const doc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Match report" }] },
    { type: "paragraph", content: [{ type: "text", text: "India won " }, { type: "text", marks: [{ type: "bold" }], text: "by 6 runs." }] },
    { type: "paragraph" },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Kohli 82" }] }] }] },
    { type: "relatedLink", attrs: { href: "/sports/x-1", title: "The first match" } },
    { type: "paragraph", content: [{ type: "text", text: "भारत ने" }, { type: "hardBreak" }, { type: "text", text: "मैच जीता।" }] },
  ],
};

test("blocks come out in order, marks and empty paragraphs aside", () => {
  expect(textBlocks(doc)).toEqual(["Match report", "India won by 6 runs.", "Kohli 82", "The first match", "भारत ने मैच जीता।"]);
});

test("plain text puts a blank line between blocks", () => {
  expect(plainText(doc).split("\n\n")).toHaveLength(5);
});

test("words are counted in any script", () => {
  expect(wordCount(doc)).toBe(2 + 5 + 2 + 3 + 4);
});

test("a body it does not understand gives nothing, never an error", () => {
  expect(textBlocks(null)).toEqual([]);
  expect(textBlocks("text")).toEqual([]);
  expect(textBlocks({ type: "unknownBlock", content: [{ type: "text", text: "kept" }] })).toEqual(["kept"]);
});
