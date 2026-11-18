/**
 * @jest-environment node
 *
 * Images in a story (Panel 2 design §7): the image node keeps only a library id and a crop; the
 * reader's renderer draws it from the data the page passes in (renditions, alt text, caption,
 * credit), never from the body, and checks every address again.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { getSchema } from "@tiptap/core";
import type { StoryImageData } from "@timesprime/shared/types";
import { renderStory } from "./render";
import { storyExtensions } from "./schema";
import { plainText } from "./text";

const ID = "3f9a0c21-b7d4-4e0e-9a6b-5c4d3e2f1a0b";
const R = `/media/renditions/${ID}`;
const image = (attrs: Record<string, unknown> = { id: ID, ratio: "16x9" }) => ({ type: "image", attrs });
const html = (content: unknown[], images?: Record<string, StoryImageData>) => renderToStaticMarkup(<>{renderStory({ type: "doc", content }, { images })}</>);

const DATA: StoryImageData = {
  alt: "Players on the field",
  caption: "The final over.",
  credit: "Photo: Asha Rao",
  crops: {
    "16x9": { avif: `${R}/16x9-480.avif 480w, ${R}/16x9-960.avif 960w`, webp: `${R}/16x9-480.webp 480w, ${R}/16x9-960.webp 960w`, src: `${R}/16x9-960.webp`, width: 960, height: 540 },
  },
};

test("an image: its crop's AVIF and WebP renditions, sized, lazy, with its alt text, caption and credit", () => {
  expect(html([image()], { [ID]: DATA })).toBe(
    `<figure data-type="image"><picture>` +
      `<source type="image/avif" srcSet="${R}/16x9-480.avif 480w, ${R}/16x9-960.avif 960w" sizes="(min-width: 768px) 720px, 100vw"/>` +
      `<source type="image/webp" srcSet="${R}/16x9-480.webp 480w, ${R}/16x9-960.webp 960w" sizes="(min-width: 768px) 720px, 100vw"/>` +
      `<img src="${R}/16x9-960.webp" alt="Players on the field" width="960" height="540" loading="lazy" decoding="async"/>` +
      `</picture><figcaption>The final over. <span data-type="credit">Photo: Asha Rao</span></figcaption></figure>`
  );
});

test("an image the page was not given, or whose crop has no renditions, is left out", () => {
  expect(html([image()])).toBe("");
  expect(html([image({ id: "7d1e2f30-4a5b-4c6d-8e9f-0a1b2c3d4e5f", ratio: "16x9" })], { [ID]: DATA })).toBe("");
  expect(html([image({ id: ID, ratio: "1x1" })], { [ID]: DATA })).toBe("");
});

test("the Desk's preview: the original through the back office stands in while there are no renditions", () => {
  const preview = { ...DATA, crops: {}, fallbackUrl: `/api/admin/desk/media/${ID}/original` };
  expect(html([image()], { [ID]: preview })).toBe(
    `<figure data-type="image"><img src="/api/admin/desk/media/${ID}/original" alt="Players on the field" loading="lazy" decoding="async"/>` +
      `<figcaption>The final over. <span data-type="credit">Photo: Asha Rao</span></figcaption></figure>`
  );
});

test("an address that is not https or a site path is never drawn, nor a malformed srcset", () => {
  const bad = (crop: Partial<NonNullable<StoryImageData["crops"]["16x9"]>>) => ({ ...DATA, crops: { "16x9": { ...DATA.crops["16x9"]!, ...crop } } });
  expect(html([image()], { [ID]: bad({ src: "javascript:alert(1)" }) })).toBe("");
  expect(html([image()], { [ID]: bad({ webp: "http://example.com/a.webp 480w" }) })).toBe("");
  expect(html([image()], { [ID]: bad({ avif: `${R}/a.avif 480w onerror=x` }) })).toBe("");
  expect(html([image()], { [ID]: bad({ src: "//evil.example/a.webp" }) })).toBe("");
  expect(html([image()], { [ID]: { ...DATA, crops: {}, fallbackUrl: "data:image/png;base64,AAAA" } })).toBe("");
});

test("text in the data is text: markup in an alt, caption or credit is escaped", () => {
  const out = html([image()], { [ID]: { ...DATA, alt: '"><script>x</script>', caption: "<b>x</b>", credit: null } });
  expect(out).not.toContain("<script>");
  expect(out).toContain("&lt;b&gt;x&lt;/b&gt;</figcaption>");
});

test("the schema keeps only a valid id and a known crop on the node", () => {
  const schema = getSchema(storyExtensions());
  const spec = (attrs: Record<string, unknown>) => schema.nodes.image.spec.toDOM!(schema.nodes.image.create(attrs));
  expect(spec({ id: ID, ratio: "4x3" })).toEqual(["figure", { "data-type": "image", "data-id": ID, "data-ratio": "4x3" }]);
  expect(spec({ id: "../../x", ratio: "21x9" })).toEqual(["figure", { "data-type": "image", "data-id": "", "data-ratio": "16x9" }]);
});

test("an image stands as a block in the plain text, so the revision diff shows it", () => {
  expect(plainText({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Before." }] }, image({ id: ID, ratio: "1x1" })] })).toContain("[Image 3f9a0c21, 1x1]");
});
