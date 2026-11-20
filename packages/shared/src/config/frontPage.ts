// The front page's pinned slots (Panel 3 design §2 and §5, decisions 1 to 3): an editor pins a
// published Desk story above the automatic order of the home page or a section page, in one
// language, for a set time. The database keeps the same rules (database/migrations/
// 2026-11-20-front-2-pins.sql); these are what the back office and the reader site share.

import { isSection, type SectionId } from "./sections";

export const PIN_LANGUAGES = ["en", "hi"] as const;
export type PinLanguage = (typeof PIN_LANGUAGES)[number];

export function isPinLanguage(value: unknown): value is PinLanguage {
  return value === "en" || value === "hi";
}

/**
 * A page that takes pins: one language's home page (section null) or one of its section pages, by
 * the section's key. A request's page is checked with frontPageFrom; a stored pin's is its own.
 */
export interface FrontPage {
  language: PinLanguage;
  section: string | null;
}

/** Decision 2: 3 slots on the home page and 2 on each section page, per language. */
export const HOME_SLOTS = 3;
export const SECTION_SLOTS = 2;

export function slotsOf(section: string | null): number {
  return section === null ? HOME_SLOTS : SECTION_SLOTS;
}

/** Decision 3: how long a pin lasts, in hours. Always with an end. */
export const PIN_HOURS = [6, 24, 72, 168] as const;
export type PinHours = (typeof PIN_HOURS)[number];
export const DEFAULT_PIN_HOURS: PinHours = 24;

export function isPinHours(value: unknown): value is PinHours {
  return (PIN_HOURS as readonly unknown[]).includes(value);
}

export const PIN_HOURS_LABELS: Record<PinHours, string> = { 6: "6 hours", 24: "24 hours", 72: "72 hours", 168: "7 days" };

/** How far ahead a pin may be set to start. */
export const PIN_START_AHEAD_DAYS = 7;

/**
 * The page a request names: `language` en or hi, and `section` a section's key, or absent, empty or
 * "home" for the home page. Null when either is something else.
 */
export function frontPageFrom(language: unknown, section: unknown): (FrontPage & { section: SectionId | null }) | null {
  if (!isPinLanguage(language)) return null;
  if (section === undefined || section === null || section === "" || section === "home") return { language, section: null };
  return typeof section === "string" && isSection(section) ? { language, section } : null;
}

/** A pinned story as the reader's pinned row draws it: everything formatted on the server. */
export interface PinnedStory {
  slot: number;
  /** The story's own page (deskStoryPath). */
  path: string;
  language: PinLanguage;
  headline: string;
  dek: string | null;
  /** The byline's names, in the story's language. */
  bylines: string[];
  /** When it was published, written out in the story's language, in IST; null if not known. */
  time: string | null;
  /** The story's first image, as its 4:3 crop's renditions, or null. */
  image: { alt: string; avif: string; webp: string; src: string; width: number; height: number } | null;
  /** Without an image: the section's own 4:3 drawing (B-03), never a stock photo. */
  drawing: string;
  /** When the pin stops showing: its end, or the start of the pin that replaces it. */
  until: string;
}

/** The pinned row's heading, in the page's language. */
export const PINNED_ROW_LABEL: Record<PinLanguage, string> = { en: "Editors' picks", hi: "संपादकों की पसंद" };
