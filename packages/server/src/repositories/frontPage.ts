import "server-only";

import { embargoed, type StoryState } from "@timesprime/shared/config/desk";
import type { FrontPage, PinHours, PinLanguage } from "@timesprime/shared/config/frontPage";
import { supabase } from "../lib/supabase";
import { DeskStoreError } from "./stories";

/**
 * The front page's pins (Panel 3 design §2), read and written as service_role. A pin is made and
 * ended only through the database's front_pin and front_unpin functions
 * (database/migrations/2026-11-20-front-2-pins.sql), each one transaction. Who may pin is decided
 * before any of this is called (requirePermission, in the page's language and section).
 */

export interface PinRow {
  id: string;
  language: PinLanguage;
  /** A section's key, or null for the home page. */
  section: string | null;
  slot: number;
  story_id: string;
  starts_at: string;
  ends_at: string;
  pinned_by: string;
  pinned_at: string;
  ended_by: string | null;
  ended_at: string | null;
  end_reason: "unpinned" | "replaced" | null;
}

const PIN_COLUMNS = "id, language, section, slot, story_id, starts_at, ends_at, pinned_by, pinned_at, ended_by, ended_at, end_reason";

/** When a pin stops showing: its end, or the earlier time it was unpinned or replaced at. */
export function pinUntil(pin: Pick<PinRow, "ends_at" | "ended_at">): string {
  return pin.ended_at && Date.parse(pin.ended_at) < Date.parse(pin.ends_at) ? pin.ended_at : pin.ends_at;
}

const onPage = (pin: Pick<PinRow, "language" | "section">, page: FrontPage) => pin.language === page.language && pin.section === page.section;

/**
 * The database's refusals from front_pin and front_unpin as statuses (design §3): 409 for a wrong
 * state (not published, no such slot, already ended or pinned), 422 for a story of another page.
 * The routes check each of these first, with their own words; these are the backstop.
 */
export function frontError(error: { code?: string; message: string }, what: "pin" | "unpin"): DeskStoreError {
  switch (error.code) {
    case "P0002": // no_data_found
      return new DeskStoreError(404, what === "pin" ? "Story not found." : "Pin not found.");
    case "55000": // object_not_in_prerequisite_state
      return new DeskStoreError(409, what === "pin" ? "Only a published story can be pinned, to a slot the page has." : "This pin has already ended.");
    case "23505": // unique_violation
      return new DeskStoreError(409, "The story is already pinned on this page. Unpin it there first.");
    case "23514": // check_violation
      return new DeskStoreError(422, "The story is not of this page: it is in another language or section.");
    case "22023": // invalid_parameter_value
    case "22P02": // invalid_text_representation (a malformed id)
      return new DeskStoreError(422, error.message);
    default:
      return new DeskStoreError(500, error.message);
  }
}

/** A page's pins that have not run out: the one showing in each slot and any set to start later. */
export async function listPagePins(page: FrontPage, now: Date): Promise<PinRow[]> {
  const at = now.toISOString();
  let query = supabase
    .from("front_page_pins")
    .select(PIN_COLUMNS)
    .eq("language", page.language)
    .gt("ends_at", at)
    .or(`ended_at.is.null,ended_at.gt."${at}"`);
  query = page.section === null ? query.is("section", null) : query.eq("section", page.section);
  const { data, error } = await query.order("slot", { ascending: true }).order("starts_at", { ascending: true });
  if (error) throw frontError(error, "pin");
  return ((data ?? []) as PinRow[])
    .filter((pin) => onPage(pin, page) && Date.parse(pinUntil(pin)) > now.getTime())
    .sort((a, b) => a.slot - b.slot || Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

export async function getPin(id: string): Promise<PinRow | null> {
  const { data, error } = await supabase.from("front_page_pins").select(PIN_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw frontError(error, "unpin");
  return (data as PinRow | null) ?? null;
}

/**
 * Pins a story (front_pin): a start of null means now. Returns the new pin and the ids of the pins
 * of its slot that it ended.
 */
export async function pinStory(input: { actorId: string; page: FrontPage; slot: number; storyId: string; startsAt: string | null; hours: PinHours }): Promise<{ pin: PinRow; replaced: string[] }> {
  const { data, error } = await supabase.rpc("front_pin", {
    p_actor: input.actorId,
    p_language: input.page.language,
    p_section: input.page.section,
    p_slot: input.slot,
    p_story: input.storyId,
    p_starts_at: input.startsAt,
    p_hours: input.hours,
  });
  if (error) throw frontError(error, "pin");
  const result = data as { pin?: PinRow; replaced?: string[] } | null;
  if (!result?.pin) throw new DeskStoreError(500, "front_pin returned nothing.");
  return { pin: result.pin, replaced: Array.isArray(result.replaced) ? result.replaced : [] };
}

/** Ends a pin now (front_unpin). */
export async function unpin(id: string, actorId: string): Promise<PinRow> {
  const { data, error } = await supabase.rpc("front_unpin", { p_pin: id, p_actor: actorId });
  if (error) throw frontError(error, "unpin");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new DeskStoreError(500, "front_unpin returned nothing.");
  return row as PinRow;
}

/** A pin as the Front page screen shows it: its story's live headline and who pinned it. */
export interface PinView extends PinRow {
  headline: string | null;
  story_state: StoryState | null;
  pinned_by_name: string;
}

/** Adds the stories' headlines and the pinners' names: plain reads, filtered here (as listTakedowns). */
export async function describePins(pins: readonly PinRow[]): Promise<PinView[]> {
  if (pins.length === 0) return [];
  const storyRead = await supabase
    .from("stories")
    .select("id, workflow_state, revision:story_revisions!stories_published_revision_fk(headline)")
    .in("id", [...new Set(pins.map((p) => p.story_id))]);
  if (storyRead.error) throw frontError(storyRead.error, "pin");
  type Story = { id: string; workflow_state: StoryState; revision: { headline: string } | null };
  const stories = new Map(((storyRead.data ?? []) as unknown as Story[]).map((s) => [s.id, s]));

  const names = new Map<string, string>();
  const people = await supabase.from("staff_profiles").select("user_id, display_name").in("user_id", [...new Set(pins.map((p) => p.pinned_by))]);
  if (people.error) throw frontError(people.error, "pin");
  for (const p of (people.data ?? []) as Array<{ user_id: string; display_name: string | null }>) {
    if (p.display_name) names.set(p.user_id, p.display_name);
  }

  return pins.map((pin) => {
    const story = stories.get(pin.story_id);
    return { ...pin, headline: story?.revision?.headline ?? null, story_state: story?.workflow_state ?? null, pinned_by_name: names.get(pin.pinned_by) ?? "a staff member" };
  });
}

/** How many of the newest published stories the picker reads before it matches the search. */
export const PINNABLE_READ = 200;
/** The most stories the picker offers at once. */
export const PINNABLE_LIMIT = 20;

export interface PinnableStory {
  id: string;
  public_id: number;
  language: PinLanguage;
  section: string;
  slug: string | null;
  headline: string;
  published_at: string | null;
}

/**
 * The stories a page can take (decision 1: Desk stories only): published, past any embargo, in the
 * page's language and, on a section page, its section; newest first, those whose headline has every
 * word of `q` (any case).
 */
export async function listPinnable(page: FrontPage, q: string, now: Date): Promise<PinnableStory[]> {
  let query = supabase
    .from("stories")
    .select("id, public_id, language, section, slug, published_at, embargo_until, workflow_state, revision:story_revisions!stories_published_revision_fk(headline)")
    .eq("workflow_state", "published")
    .eq("language", page.language);
  if (page.section !== null) query = query.eq("section", page.section);
  const { data, error } = await query.order("published_at", { ascending: false }).limit(PINNABLE_READ);
  if (error) throw frontError(error, "pin");
  type Row = Omit<PinnableStory, "headline"> & { embargo_until: string | null; workflow_state: string; revision: { headline: string } | null };
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return ((data ?? []) as unknown as Row[])
    .filter((row) => row.workflow_state === "published" && !embargoed(row.embargo_until, now) && row.language === page.language && (page.section === null || row.section === page.section))
    .filter((row) => row.revision?.headline && words.every((w) => row.revision!.headline.toLowerCase().includes(w)))
    .slice(0, PINNABLE_LIMIT)
    .map((row) => ({ id: row.id, public_id: row.public_id, language: row.language, section: row.section, slug: row.slug, headline: row.revision!.headline, published_at: row.published_at }));
}

/** Postgres's and PostgREST's answers for a table that is not there: front-2 is not applied yet. */
const NO_TABLE = new Set(["42P01", "PGRST205"]);

/**
 * The pins a page shows now, one per slot, for the reader (the reader policy, applied again here).
 * Before the owner applies front-2 there is no table, and no pin: the page shows without the row.
 */
export async function livePins(page: FrontPage, now: Date): Promise<Array<{ slot: number; story_id: string; until: string }>> {
  const at = now.toISOString();
  let query = supabase
    .from("front_page_pins")
    .select("language, section, slot, story_id, starts_at, ends_at, ended_at")
    .eq("language", page.language)
    .lte("starts_at", at)
    .gt("ends_at", at)
    .or(`ended_at.is.null,ended_at.gt."${at}"`);
  query = page.section === null ? query.is("section", null) : query.eq("section", page.section);
  const { data, error } = await query.order("slot", { ascending: true }).order("starts_at", { ascending: false });
  if (error && NO_TABLE.has(error.code ?? "")) return [];
  if (error) throw frontError(error, "pin");
  const bySlot = new Map<number, { slot: number; story_id: string; until: string }>();
  for (const pin of (data ?? []) as Array<Pick<PinRow, "language" | "section" | "slot" | "story_id" | "starts_at" | "ends_at" | "ended_at">>) {
    const live = onPage(pin, page) && Date.parse(pin.starts_at) <= now.getTime() && Date.parse(pinUntil(pin)) > now.getTime();
    if (live && !bySlot.has(pin.slot)) bySlot.set(pin.slot, { slot: pin.slot, story_id: pin.story_id, until: pinUntil(pin) });
  }
  return [...bySlot.values()].sort((a, b) => a.slot - b.slot);
}
