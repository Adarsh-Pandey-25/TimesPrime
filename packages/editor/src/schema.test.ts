/**
 * The Desk's story schema (Panel 2 design §5): the blocks the design names, and nothing that can
 * carry an unsafe link or a third-party script.
 */

import { getSchema } from "@tiptap/core";
import { DOMSerializer } from "@tiptap/pm/model";
import { embedProvider, isAllowedHref, storyExtensions } from "./schema";

const schema = getSchema(storyExtensions());

test("the design's blocks are in the schema; code and level-1 headings are not", () => {
  for (const node of ["paragraph", "heading", "bulletList", "orderedList", "blockquote", "factbox", "relatedLink", "embed", "adSlot"]) {
    expect(schema.nodes[node]).toBeDefined();
  }
  expect(schema.nodes.codeBlock).toBeUndefined();
  expect(schema.marks.code).toBeUndefined();
  expect(schema.marks.link).toBeDefined();
  expect(() => schema.node("heading", { level: 1 })).not.toThrow();
  const levels = storyExtensions()
    .map((e) => (e as { options?: { heading?: { levels?: number[] } } }).options?.heading?.levels)
    .find(Boolean);
  expect(levels).toEqual([2, 3]);
});

test.each([
  ["https://example.com/a", true],
  ["/india/budget-1024", true],
  ["mailto:desk@timesprime247.com", true],
  ["http://example.com", false],
  ["javascript:alert(1)", false],
  ["//evil.example", false],
  ["data:text/html,x", false],
  ["not a url", false],
])("a link to %s is allowed: %s", (href, allowed) => {
  expect(isAllowedHref(href)).toBe(allowed);
});

test.each([
  ["https://www.youtube.com/watch?v=abc", "youtube"],
  ["https://youtu.be/abc", "youtube"],
  ["https://x.com/user/status/1", "x"],
  ["https://twitter.com/user/status/1", "x"],
  ["https://www.instagram.com/p/abc/", "instagram"],
  ["http://www.youtube.com/watch?v=abc", null],
  ["https://evil.example/youtube.com", null],
  ["javascript:alert(1)", null],
])("%s embeds as %s", (url, provider) => {
  expect(embedProvider(url)).toBe(provider);
});

describe("rendering refuses what it does not trust", () => {
  const serialize = (node: ReturnType<typeof schema.node>) => {
    const host = document.createElement("div");
    host.appendChild(DOMSerializer.fromSchema(schema).serializeNode(node));
    return host.innerHTML;
  };

  test("a related link with an unsafe href renders without one", () => {
    const html = serialize(schema.node("relatedLink", { href: "javascript:alert(1)", title: "Read more" }));
    expect(html).not.toContain("javascript:");
    expect(html).toContain("Read more");
  });

  test("an embed from an unknown host renders as an empty placeholder", () => {
    const html = serialize(schema.node("embed", { url: "https://evil.example/x" }));
    expect(html).toBe('<div data-type="embed" data-provider="none"></div>');
  });

  test("a YouTube embed renders as a plain link, with no script or iframe", () => {
    const html = serialize(schema.node("embed", { url: "https://www.youtube.com/watch?v=abc" }));
    expect(html).toContain('data-provider="youtube"');
    expect(html).not.toMatch(/<script|<iframe/);
  });
});
