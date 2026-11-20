import { isRenditionRatio, MEDIA_ID } from "@timesprime/shared/config/media";
import { isAllowedHref } from "./schema";

/**
 * A live blog's update (Panel 3 design §2, M3) is written in a smaller schema than a story: paragraphs
 * (with line breaks) whose text may be bold, italic or a link, and at most one image from the media
 * library. It is stored as Tiptap JSON (live_updates.body). The back office checks every update
 * against these rules before it is stored, so the reader's page draws only what they allow.
 */

/** The most paragraphs an update holds. */
export const LIVE_BLOCKS_MAX = 30;
/** The most characters of text an update holds. */
export const LIVE_TEXT_MAX = 5000;
/** The most library images an update holds. */
export const LIVE_IMAGES_MAX = 1;

const MARKS = new Set(["bold", "italic", "link"]);
/** A link mark's attributes, as Tiptap writes them; only the address is used. */
const LINK_ATTRS = new Set(["href", "target", "rel", "class"]);

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

/** What is wrong with an update's body, in words to show the editor, or null when it is fine. */
export function liveBodyProblem(body: unknown): string | null {
  if (!isObject(body) || body.type !== "doc" || !Array.isArray(body.content)) return "The update must be a document.";
  if (body.content.length === 0 || body.content.length > LIVE_BLOCKS_MAX) return `An update has 1 to ${LIVE_BLOCKS_MAX} paragraphs.`;
  let characters = 0;
  let written = false;
  let images = 0;
  for (const block of body.content) {
    if (!isObject(block)) return "The update must be a document.";
    if (block.type === "image") {
      images++;
      const attrs = block.attrs;
      if (!isObject(attrs) || typeof attrs.id !== "string" || !MEDIA_ID.test(attrs.id) || (attrs.ratio !== undefined && !isRenditionRatio(attrs.ratio))) {
        return "An image must be one of the media library's, with one of its crops.";
      }
      continue;
    }
    if (block.type !== "paragraph") return "An update holds paragraphs and at most one image: no headings, lists, quotes or embeds.";
    if (block.content === undefined) continue;
    if (!Array.isArray(block.content)) return "The update must be a document.";
    for (const inline of block.content) {
      if (!isObject(inline)) return "The update must be a document.";
      if (inline.type === "hardBreak") continue;
      if (inline.type !== "text" || typeof inline.text !== "string") return "A paragraph holds text only.";
      characters += [...inline.text].length;
      if (inline.text.trim()) written = true;
      if (inline.marks === undefined) continue;
      if (!Array.isArray(inline.marks)) return "The update must be a document.";
      for (const mark of inline.marks) {
        if (!isObject(mark) || !MARKS.has(String(mark.type))) return "Text may be bold, italic or a link, and nothing else.";
        if (mark.type !== "link") continue;
        const attrs = mark.attrs;
        if (!isObject(attrs) || typeof attrs.href !== "string" || !isAllowedHref(attrs.href) || Object.keys(attrs).some((key) => !LINK_ATTRS.has(key))) {
          return "A link must be an https address, an email address or a path on this site.";
        }
      }
    }
  }
  if (images > LIVE_IMAGES_MAX) return `An update has at most ${LIVE_IMAGES_MAX} image.`;
  if (characters > LIVE_TEXT_MAX) return `An update has at most ${LIVE_TEXT_MAX} characters.`;
  if (!written) return "An update needs some text.";
  return null;
}
