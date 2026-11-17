/**
 * @jest-environment node
 *
 * The reader's renderer (Panel 2 design §6): a stored story body drawn on the server by the story
 * schema's own renderHTML, with the stored JSON treated as untrusted.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { getSchema } from "@tiptap/core";
import { renderStory } from "./render";
import { storyExtensions } from "./schema";

const html = (content: unknown[]) => renderToStaticMarkup(<>{renderStory({ type: "doc", content })}</>);
const text = (value: string, marks?: unknown[]) => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
const p = (...content: unknown[]) => ({ type: "paragraph", content });

test("the design's blocks, as the schema draws them", () => {
  expect(
    html([
      { type: "heading", attrs: { level: 2 }, content: [text("What passed")] },
      p(text("The house "), text("voted", [{ type: "bold" }]), text(" on "), text("Monday", [{ type: "italic" }]), text(".")),
      { type: "bulletList", content: [{ type: "listItem", content: [p(text("One"))] }] },
      { type: "orderedList", attrs: { start: 3 }, content: [{ type: "listItem", content: [p(text("Three"))] }] },
      { type: "blockquote", content: [p(text("A quote"))] },
      { type: "factbox", content: [p(text("Fact"))] },
      { type: "relatedLink", attrs: { href: "/india/budget-1024", title: "The budget" } },
      { type: "embed", attrs: { url: "https://www.youtube.com/watch?v=abc" } },
      { type: "adSlot" },
    ])
  ).toBe(
    [
      "<h2>What passed</h2>",
      "<p>The house <strong>voted</strong> on <em>Monday</em>.</p>",
      "<ul><li><p>One</p></li></ul>",
      '<ol start="3"><li><p>Three</p></li></ol>',
      "<blockquote><p>A quote</p></blockquote>",
      '<aside data-type="factbox"><p>Fact</p></aside>',
      '<aside data-type="related-link"><a href="/india/budget-1024">The budget</a></aside>',
      '<div data-type="embed" data-provider="youtube"><a href="https://www.youtube.com/watch?v=abc" rel="noopener noreferrer nofollow">https://www.youtube.com/watch?v=abc</a></div>',
      '<div data-type="ad-slot"></div>',
    ].join("")
  );
});

test("a link keeps a site path followed, an https one nofollow, and loses any other address", () => {
  const link = (href: string) => text("here", [{ type: "link", attrs: { href } }]);
  expect(html([p(link("/world/talks-12"))])).toBe('<p><a href="/world/talks-12">here</a></p>');
  expect(html([p(link("https://example.com/a"))])).toBe('<p><a href="https://example.com/a" rel="noopener noreferrer nofollow">here</a></p>');
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "http://example.com", "//evil.example"]) {
    expect(html([p(link(bad))])).toBe("<p><a>here</a></p>");
  }
  expect(html([{ type: "relatedLink", attrs: { href: "javascript:alert(1)", title: "x" } }])).toBe('<aside data-type="related-link"><a>x</a></aside>');
  expect(html([{ type: "embed", attrs: { url: "https://evil.example/x" } }])).toBe('<div data-type="embed" data-provider="none"></div>');
});

test("a heading is never the page's h1, and level 1 falls back to the schema's first level", () => {
  expect(html([{ type: "heading", attrs: { level: 1 }, content: [text("Big")] }])).toBe("<h2>Big</h2>");
  expect(html([{ type: "heading", attrs: { level: 3 }, content: [text("Small")] }])).toBe("<h3>Small</h3>");
});

test("what the schema does not know is left out: nodes, marks, attributes and markup in the text", () => {
  expect(html([{ type: "script", content: [text("alert(1)")] }, p(text("kept"))])).toBe("<p>kept</p>");
  expect(html([p(text("plain", [{ type: "code" }, { type: "evil", attrs: { onclick: "x" } }]))])).toBe("<p>plain</p>");
  expect(html([{ type: "paragraph", attrs: { class: "x", style: "color:red", onclick: "x" }, content: [text("<img src=x onerror=alert(1)>")] }])).toBe(
    "<p>&lt;img src=x onerror=alert(1)&gt;</p>"
  );
  expect(html(["not a node", null, 7, { content: [] }, p(text("ok"))])).toBe("<p>ok</p>");
});

test("anything but a document renders nothing", () => {
  for (const body of [null, "text", [], { type: "paragraph", content: [] }, { type: "doc" }]) {
    expect(renderToStaticMarkup(<>{renderStory(body)}</>)).toBe("");
  }
});

test("nesting deeper than the limit stops there instead of exhausting the stack", () => {
  let node: Record<string, unknown> = p(text("deep"));
  for (let i = 0; i < 5000; i++) node = { type: "blockquote", content: [node] };
  const out = html([node]);
  expect(out.startsWith("<blockquote>")).toBe(true);
  expect(out).not.toContain("deep");
});

test("Hindi text passes through as it is", () => {
  expect(html([p(text("संसद में बजट पास हुआ।"))])).toBe("<p>संसद में बजट पास हुआ।</p>");
});

test("every node and mark of the schema draws only tags the renderer allows", () => {
  const schema = getSchema(storyExtensions());
  const sample: Record<string, unknown> = { text: undefined, doc: undefined };
  for (const name of Object.keys(schema.nodes)) {
    if (name in sample) continue;
    const out = html([{ type: name, content: [p(text("x"))] }]);
    expect(out).not.toMatch(/<(?!\/?(p|h2|h3|ul|ol|li|blockquote|strong|em|s|u|a|br|hr|aside|div)\b)[a-z]/);
  }
  for (const name of Object.keys(schema.marks)) {
    const out = html([p(text("x", [{ type: name, attrs: { href: "https://example.com" } }]))]);
    expect(out).toMatch(/^<p><(strong|em|s|u|a)\b[^>]*>x<\/\1><\/p>$/);
  }
});
