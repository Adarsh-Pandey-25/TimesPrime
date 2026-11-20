import "server-only";

import { NextResponse } from "next/server";
import type { Actor } from "@timesprime/server/auth/requirePermission";
import { covers, type Scope, type Target } from "@timesprime/server/auth/scope";
import type { PinRow } from "@timesprime/server/repositories/frontPage";
import { frontPageFrom, type FrontPage } from "@timesprime/shared/config/frontPage";
import { scopesFor } from "../../desk/_lib/desk";

// The Front page's routes (Panel 3 design §3 and §4) share these: the page a request names, the
// scope it is decided in, and what the screen may offer. HTTP answers stay here, in the app.

/** A page as a permission target: its language, and its section (NULL for the home page). */
export const pageTarget = (page: FrontPage): Target => ({ language: page.language, section: page.section });

/** The page named by `?language=en|hi&section=<key>` (no section: the home page), or null. */
export function pageFromQuery(url: URL): FrontPage | null {
  return frontPageFrom(url.searchParams.get("language"), url.searchParams.get("section"));
}

export const PAGE_ERROR = "language must be en or hi, and section one of the site's sections, or none for the home page.";

/**
 * Whether the caller may pin on the page: a live homepage.curate grant, F or S, whose scope covers
 * it. For the screen only (what to offer); every change is decided again by requireTarget.
 */
export function mayPin(actor: Actor, page: FrontPage, now: Date): boolean {
  return scopesFor(actor, "homepage.curate", ["F", "S"], now).some((scope) => covers(scope as Scope, pageTarget(page)));
}

export const conflict = (error: string, code: string) => NextResponse.json({ error, code }, { status: 409 });

/** A pin as its audit rows record it: its page, slot, story and times. */
export const pinRecord = (pin: PinRow) => ({
  pin: pin.id,
  language: pin.language,
  section: pin.section,
  slot: pin.slot,
  story_id: pin.story_id,
  starts_at: pin.starts_at,
  ends_at: pin.ends_at,
});
