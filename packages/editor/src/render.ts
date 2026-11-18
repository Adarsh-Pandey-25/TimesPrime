import { createElement, Fragment, type ReactNode } from "react";
import { getSchema } from "@tiptap/core";
import type { DOMOutputSpec, Schema } from "@tiptap/pm/model";
import { isRenditionRatio } from "@timesprime/shared/config/media";
import type { StoryImageData } from "@timesprime/shared/types";
import { isAllowedHref, storyExtensions } from "./schema";

/**
 * A story's body as React elements, for the reader site's server (Panel 2 design §0 and §6). Each
 * node and mark is drawn by the schema's own renderHTML, the one the Desk's editor uses, so a story
 * reads as it was written. The page renders this on the server: no editor code reaches a reader.
 *
 * The stored JSON is not trusted. A node or mark the schema does not know is left out; only the tags
 * and attributes listed here reach the page; every link is checked again; and nesting stops at a
 * fixed depth.
 *
 * An image is drawn from the data the page passes in (`images`, read from the library by the
 * server), never from the body: an image the page was not given is left out.
 */

/** The tags the schema's renderHTML produces. Any other tag is dropped, keeping its text. */
const TAGS = new Set(["p", "h2", "h3", "ul", "ol", "li", "blockquote", "strong", "em", "s", "u", "a", "br", "hr", "aside", "div"]);
const VOID_TAGS = new Set(["br", "hr"]);
const MAX_DEPTH = 32;

let cached: Schema | null = null;
function storySchema(): Schema {
  cached ??= getSchema(storyExtensions());
  return cached;
}

type Json = Record<string, unknown>;
type Images = Readonly<Record<string, StoryImageData>> | undefined;

/** How wide an image is drawn: the story's column on a wide screen, the screen's width below it. */
const IMAGE_SIZES = "(min-width: 768px) 720px, 100vw";
const isRecord = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

/** The attributes a tag may carry on the reader's page, and nothing else (no class, style or handlers). */
function propsFor(tag: string, attrs: Json): Record<string, string | number> {
  const props: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(attrs)) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    const text = String(value);
    if (tag === "a" && name === "href" && isAllowedHref(text)) {
      props.href = text;
      // The site's own pages are followed; any other address is not vouched for.
      if (!text.startsWith("/")) props.rel = "noopener noreferrer nofollow";
    } else if (tag === "ol" && name === "start" && Number.isInteger(Number(value)) && Number(value) !== 1) {
      props.start = Number(value);
    } else if ((name === "data-type" || name === "data-provider") && /^[a-z-]{1,40}$/.test(text)) {
      props[name] = text;
    }
  }
  return props;
}

/** An address an image may load from: https, or a path on this site. */
export function isImageUrl(url: unknown): url is string {
  return typeof url === "string" && (/^https:\/\/[^\s"'<>]+$/.test(url) || /^\/[^/\s"'<>][^\s"'<>]*$/.test(url));
}

/** A srcset of image addresses with widths ("… 480w, … 960w"). */
export function isSrcSet(value: unknown): value is string {
  return typeof value === "string" && value.split(",").every((part) => {
    const [url, width, ...rest] = part.trim().split(/\s+/);
    return rest.length === 0 && isImageUrl(url) && /^\d{1,5}w$/.test(width ?? "");
  });
}

/** An image node, as a figure: its crop's AVIF and WebP renditions, its caption and credit. */
function renderImage(json: Json, images: Images): ReactNode {
  const attrs = isRecord(json.attrs) ? json.attrs : {};
  const data = typeof attrs.id === "string" ? images?.[attrs.id] : undefined;
  if (!data) return null;
  const crop = data.crops[isRenditionRatio(attrs.ratio) ? attrs.ratio : "16x9"];
  const alt = typeof data.alt === "string" ? data.alt : "";
  let picture: ReactNode = null;
  if (crop && isImageUrl(crop.src) && isSrcSet(crop.avif) && isSrcSet(crop.webp)) {
    picture = createElement(
      "picture",
      null,
      createElement("source", { type: "image/avif", srcSet: crop.avif, sizes: IMAGE_SIZES }),
      createElement("source", { type: "image/webp", srcSet: crop.webp, sizes: IMAGE_SIZES }),
      createElement("img", { src: crop.src, alt, width: crop.width, height: crop.height, loading: "lazy", decoding: "async" })
    );
  } else if (isImageUrl(data.fallbackUrl)) {
    picture = createElement("img", { src: data.fallbackUrl, alt, loading: "lazy", decoding: "async" });
  }
  if (!picture) return null;
  const caption = typeof data.caption === "string" && data.caption ? data.caption : null;
  const credit = typeof data.credit === "string" && data.credit ? data.credit : null;
  return createElement(
    "figure",
    { "data-type": "image" },
    picture,
    caption || credit
      ? createElement("figcaption", null, caption, caption && credit ? " " : null, credit ? createElement("span", { "data-type": "credit" }, credit) : null)
      : null
  );
}

/** A renderHTML result (ProseMirror's DOMOutputSpec) as an element; `hole` fills its content slot, the 0. */
function fromSpec(spec: DOMOutputSpec, hole: ReactNode[]): ReactNode {
  if (typeof spec === "string") return spec;
  // A DOM node or a { dom } object: this schema produces neither, and the server has no DOM.
  if (!Array.isArray(spec)) return null;
  const [tag, ...rest] = spec as readonly unknown[];
  const attrs = isRecord(rest[0]) ? rest[0] : {};
  const children = rest.slice(isRecord(rest[0]) ? 1 : 0).flatMap((child) => (child === 0 ? hole : [fromSpec(child as DOMOutputSpec, hole)]));
  if (typeof tag !== "string" || !TAGS.has(tag)) return createElement(Fragment, null, ...children);
  return VOID_TAGS.has(tag) ? createElement(tag, propsFor(tag, attrs)) : createElement(tag, propsFor(tag, attrs), ...children);
}

/** A text node, inside its marks: the first mark is the outermost, as ProseMirror draws them. */
function renderText(json: Json, schema: Schema): ReactNode {
  let out: ReactNode = typeof json.text === "string" ? json.text : "";
  const marks = Array.isArray(json.marks) ? json.marks : [];
  for (let i = marks.length - 1; i >= 0; i--) {
    const mark = marks[i];
    const type = isRecord(mark) && typeof mark.type === "string" ? schema.marks[mark.type] : undefined;
    const toDOM = type?.spec.toDOM;
    if (!type || !toDOM || !isRecord(mark)) continue;
    try {
      out = fromSpec(toDOM(type.create(isRecord(mark.attrs) ? mark.attrs : undefined), true), [out]);
    } catch {
      // A mark the schema cannot build: the text stays, without it.
    }
  }
  return out;
}

function renderNode(json: unknown, schema: Schema, depth: number, images: Images): ReactNode {
  if (!isRecord(json) || typeof json.type !== "string" || depth > MAX_DEPTH) return null;
  if (json.type === "text") return renderText(json, schema);
  if (json.type === "image") return renderImage(json, images);
  const type = schema.nodes[json.type];
  const toDOM = type?.spec.toDOM;
  if (!type || !toDOM) return null;
  const content = !type.isLeaf && Array.isArray(json.content) ? json.content : [];
  const children = content.map((child) => renderNode(child, schema, depth + 1, images));
  try {
    return fromSpec(toDOM(type.create(isRecord(json.attrs) ? json.attrs : undefined)), children);
  } catch {
    // A node the schema cannot build from these attributes is left out.
    return null;
  }
}

/**
 * A stored story body (a Tiptap document) as the reader's page shows it; null for anything else.
 * `images`: the library's images it may draw, by id (the reader's page passes only those of the
 * published revision, with renditions).
 */
export function renderStory(body: unknown, options: { images?: Readonly<Record<string, StoryImageData>> } = {}): ReactNode {
  if (!isRecord(body) || body.type !== "doc" || !Array.isArray(body.content)) return null;
  const schema = storySchema();
  return createElement(Fragment, null, ...body.content.map((node) => renderNode(node, schema, 0, options.images)));
}
