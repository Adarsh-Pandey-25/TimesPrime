import "server-only";

import type { AuthorFields } from "@timesprime/server/repositories/authors";
import { AUTHOR_KINDS, type AuthorKind } from "@timesprime/shared/config/desk";

// What an author record may hold (Panel 2 design §7), checked before it reaches the database: the
// routes that create and edit one share it.

const NAME_MAX = 120;
const BIO_MAX = 1000;
const BEAT_MAX = 80;
const LINKS_MAX = 5;
const LINK_MAX = 300;

type Body = Record<string, unknown>;

/** A trimmed string of at most `max` characters, null for an empty one, undefined when malformed. */
function optional(value: unknown, max: number): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (text.length > max) return undefined;
  return text || null;
}

const httpsLink = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length > LINK_MAX) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * The fields a request sets, or a message saying what is wrong. Creating needs an English name and a
 * kind; an edit sets only what it names. Agency bylines wait for a wire licence (Phase K).
 */
export function authorFields(body: Body, creating: boolean): { ok: true; fields: AuthorFields } | { ok: false; error: string } {
  const fields: AuthorFields = {};
  if (creating || "display_name_en" in body) {
    const name = optional(body.display_name_en, NAME_MAX);
    if (!name) return { ok: false, error: `display_name_en: the name in English, 1 to ${NAME_MAX} characters.` };
    fields.display_name_en = name;
  }
  if ("display_name_hi" in body) {
    const name = optional(body.display_name_hi, NAME_MAX);
    if (name === undefined) return { ok: false, error: `display_name_hi: the name in Hindi, at most ${NAME_MAX} characters.` };
    fields.display_name_hi = name;
  }
  if (creating || "kind" in body) {
    if (body.kind === "agency") return { ok: false, error: "Agency bylines wait for a wire licence (Phase K)." };
    if (typeof body.kind !== "string" || !(AUTHOR_KINDS as readonly string[]).includes(body.kind)) {
      return { ok: false, error: `kind: one of ${AUTHOR_KINDS.join(", ")}.` };
    }
    fields.kind = body.kind as AuthorKind;
  }
  for (const [key, max] of [["bio_en", BIO_MAX], ["bio_hi", BIO_MAX], ["beat", BEAT_MAX]] as const) {
    if (!(key in body)) continue;
    const text = optional(body[key], max);
    if (text === undefined) return { ok: false, error: `${key}: at most ${max} characters.` };
    fields[key] = text;
  }
  if ("links" in body) {
    if (!Array.isArray(body.links) || body.links.length > LINKS_MAX || !body.links.every(httpsLink)) {
      return { ok: false, error: `links: at most ${LINKS_MAX} https addresses.` };
    }
    fields.links = body.links as string[];
  }
  if (!creating && "active" in body) {
    if (typeof body.active !== "boolean") return { ok: false, error: "active: true or false." };
    fields.active = body.active;
  }
  if (!creating && Object.keys(fields).length === 0) return { ok: false, error: "Name a field to change." };
  return { ok: true, fields };
}
