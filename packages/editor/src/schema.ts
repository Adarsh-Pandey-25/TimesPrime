import { Node, mergeAttributes, type Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { isRenditionRatio, MEDIA_ID } from "@timesprime/shared/config/media";

/**
 * The Desk's story schema (Panel 2 design §5): one list of Tiptap extensions, used by the back
 * office's editor and, in M3, by the reader site's server-side renderer, so a story is read with the
 * schema it was written in. Stories are stored as this schema's JSON (story_revisions.body).
 *
 * Blocks: paragraph, heading (levels 2 and 3: the headline is the page's h1), bullet and numbered
 * lists, quote, link, factbox, related link, embed (YouTube, X, Instagram), an image from the
 * media library (M4) and an ad-slot placeholder. Galleries come later.
 */

/** An https URL, or a path on this site: what a link or a related link may point to. */
export function isAllowedHref(href: string): boolean {
  if (typeof href !== "string") return false;
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

export type EmbedProvider = "youtube" | "x" | "instagram";

const EMBED_HOSTS: Record<string, EmbedProvider> = {
  "youtube.com": "youtube",
  "www.youtube.com": "youtube",
  "m.youtube.com": "youtube",
  "youtu.be": "youtube",
  "x.com": "x",
  "www.x.com": "x",
  "twitter.com": "x",
  "www.twitter.com": "x",
  "mobile.twitter.com": "x",
  "instagram.com": "instagram",
  "www.instagram.com": "instagram",
};

/** The provider of an embeddable https URL, or null: only the three the design names. */
export function embedProvider(url: string): EmbedProvider | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? (EMBED_HOSTS[parsed.hostname.toLowerCase()] ?? null) : null;
  } catch {
    return null;
  }
}

/** A box of facts beside the story: its own paragraphs and lists. */
export const Factbox = Node.create({
  name: "factbox",
  group: "block",
  content: "(paragraph | bulletList | orderedList)+",
  defining: true,
  parseHTML: () => [{ tag: 'aside[data-type="factbox"]' }],
  renderHTML: ({ HTMLAttributes }) => ["aside", mergeAttributes(HTMLAttributes, { "data-type": "factbox" }), 0],
});

/** A link to another story, set apart from the text. Refuses any href but https or a site path. */
export const RelatedLink = Node.create({
  name: "relatedLink",
  group: "block",
  atom: true,
  addAttributes: () => ({
    href: { default: null, parseHTML: (el) => el.querySelector("a")?.getAttribute("href") ?? null },
    title: { default: "", parseHTML: (el) => el.querySelector("a")?.textContent ?? "" },
  }),
  parseHTML: () => [{ tag: 'aside[data-type="related-link"]' }],
  renderHTML: ({ node }) => {
    const href = typeof node.attrs.href === "string" && isAllowedHref(node.attrs.href) ? node.attrs.href : null;
    return ["aside", { "data-type": "related-link" }, ["a", href ? { href } : {}, String(node.attrs.title ?? "")]];
  },
});

/**
 * An embedded post or video, stored as its URL and provider. The reader site renders it as a
 * click-to-load placeholder: no third-party script arrives with the page (design §5).
 */
export const Embed = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  addAttributes: () => ({
    url: { default: null, parseHTML: (el) => el.getAttribute("data-url") },
    provider: { default: null, parseHTML: (el) => el.getAttribute("data-provider") },
  }),
  parseHTML: () => [{ tag: 'div[data-type="embed"]' }],
  renderHTML: ({ node }) => {
    const url = typeof node.attrs.url === "string" ? node.attrs.url : "";
    const provider = embedProvider(url);
    return provider
      ? ["div", { "data-type": "embed", "data-provider": provider, "data-url": url }, ["a", { href: url, rel: "noopener noreferrer nofollow" }, url]]
      : ["div", { "data-type": "embed", "data-provider": "none" }];
  },
});

/**
 * An image from the media library: only its id and the crop to show (16:9, 4:3 or 1:1). Its alt
 * text, caption and credit are the library's, in the story's language, read when the page is drawn,
 * so a correction to the record reaches every story using it. Saving a revision records the image's
 * use (asset_usages), which is what lets readers see it once that revision is published.
 */
export const StoryImage = Node.create({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes: () => ({
    id: { default: null, parseHTML: (el) => el.getAttribute("data-id") },
    ratio: { default: "16x9", parseHTML: (el) => el.getAttribute("data-ratio") ?? "16x9" },
  }),
  parseHTML: () => [{ tag: 'figure[data-type="image"]' }],
  renderHTML: ({ node }) => {
    const id = typeof node.attrs.id === "string" && MEDIA_ID.test(node.attrs.id) ? node.attrs.id : "";
    const ratio = isRenditionRatio(node.attrs.ratio) ? node.attrs.ratio : "16x9";
    return ["figure", { "data-type": "image", "data-id": id, "data-ratio": ratio }];
  },
});

/** Where an advertisement may go later: an empty block with a reserved height on the reader site. */
export const AdSlot = Node.create({
  name: "adSlot",
  group: "block",
  atom: true,
  parseHTML: () => [{ tag: 'div[data-type="ad-slot"]' }],
  renderHTML: () => ["div", { "data-type": "ad-slot" }],
});

/** The schema's extensions. */
export function storyExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      code: false,
      codeBlock: false,
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        isAllowedUri: (url) => isAllowedHref(url),
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: null },
      },
    }),
    Factbox,
    RelatedLink,
    Embed,
    StoryImage,
    AdSlot,
  ];
}

/** An empty story body. */
export const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] } as const;
