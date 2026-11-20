// A live blog as readers get it (Panel 3 design §5, M3): its updates, newest first, already shaped
// for the page by the server (packages/server/src/services/front/live.ts), so the reader's browser
// needs no editor code: the story page renders them, and /api/live/[publicId] serves the same feed
// for the page's check for new ones.

/** How often a reader's open page checks for new updates, while the tab is visible (decision 9). */
export const LIVE_POLL_SECONDS = 15;
/** How long the edge keeps the feed, and serves it stale while it fetches a fresh one (decision 9). */
export const LIVE_EDGE_SECONDS = 10;
export const LIVE_EDGE_STALE_SECONDS = 20;
/** The feed's Redis entry (decision 9): one database read per story every few seconds. */
export const LIVE_CACHE_SECONDS = 5;
/** The updates a page shows and the feed holds: the newest. */
export const LIVE_PAGE_UPDATES = 50;

/** A run of text in a paragraph, or a line break. */
export type LiveRun = { text: string; bold?: boolean; italic?: boolean; href?: string } | { br: true };

/** One block of an update: a paragraph, or the library image with its 4:3, 16:9 or square crop. */
export type LiveBlock =
  | { kind: "p"; runs: LiveRun[] }
  | { kind: "image"; alt: string; caption: string | null; credit: string | null; avif: string; webp: string; src: string; width: number; height: number };

export interface LiveUpdateView {
  id: string;
  headline: string | null;
  blocks: LiveBlock[];
  keyEvent: boolean;
  pinned: boolean;
  postedAt: string;
  editedAt: string | null;
  /** When it was posted, written out in the story's language, in IST. */
  time: string;
}

export interface LiveFeed {
  /** When the desk ended the blog, or null while it is live. */
  endedAt: string | null;
  /** The newest updates first, removed ones never. */
  updates: LiveUpdateView[];
}

/** An update's text alone, for its search-engine markup. */
export function liveText(blocks: readonly LiveBlock[]): string {
  return blocks
    .filter((b): b is Extract<LiveBlock, { kind: "p" }> => b.kind === "p")
    .map((b) => b.runs.map((r) => ("br" in r ? " " : r.text)).join("").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
}

export const LIVE_LABELS = {
  en: { live: "Live", ended: "Ended", keyEvents: "Key events", keyEvent: "Key event", pinned: "Pinned", updated: "Updated", noUpdates: "No updates yet.", newUpdates: (n: number) => (n === 1 ? "1 new update" : `${n} new updates`), show: "Show" },
  hi: { live: "लाइव", ended: "समाप्त", keyEvents: "मुख्य घटनाएँ", keyEvent: "मुख्य घटना", pinned: "पिन किया गया", updated: "अपडेट किया गया", noUpdates: "अभी कोई अपडेट नहीं।", newUpdates: (n: number) => (n === 1 ? "1 नया अपडेट" : `${n} नए अपडेट`), show: "देखें" },
} as const;
