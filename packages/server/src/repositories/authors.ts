import "server-only";

import type { AuthorKind } from "@timesprime/shared/config/desk";
import { supabase } from "../lib/supabase";
import { storeError } from "./stories";

/**
 * Author records (Panel 2 design §2 and §7): the names a story credits. Authors are not staff
 * accounts: a columnist or a freelancer has a record and no sign-in. Read and written as
 * service_role; who may do so is decided before (requirePermission: author.manage to change one).
 * Records are never deleted: an author who stops writing is retired (`active` false), and stays
 * credited on what they wrote.
 */

export interface AuthorRow {
  id: string;
  display_name_en: string;
  display_name_hi: string | null;
  kind: AuthorKind | "agency";
  bio_en: string | null;
  bio_hi: string | null;
  beat: string | null;
  links: string[];
  /** A library image shown beside the byline (migration desk-8), or none. */
  photo_id: string | null;
  active: boolean;
  created_at: string;
}

/** What a create or an edit may set (staff_user_id waits for Panel 1's staff directory). */
export interface AuthorFields {
  display_name_en?: string;
  display_name_hi?: string | null;
  kind?: AuthorKind;
  bio_en?: string | null;
  bio_hi?: string | null;
  beat?: string | null;
  links?: string[];
  photo_id?: string | null;
  active?: boolean;
}

const COLUMNS = "id, display_name_en, display_name_hi, kind, bio_en, bio_hi, beat, links, photo_id, active, created_at";

/** Every author, by English name; retired ones too when asked. */
export async function listAuthors(includeRetired: boolean): Promise<AuthorRow[]> {
  let query = supabase.from("authors").select(COLUMNS).order("display_name_en", { ascending: true });
  if (!includeRetired) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw storeError(error);
  return (data ?? []) as AuthorRow[];
}

export async function getAuthor(id: string): Promise<AuthorRow | null> {
  const { data, error } = await supabase.from("authors").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw storeError(error);
  return (data as AuthorRow | null) ?? null;
}

export async function createAuthor(fields: AuthorFields & { display_name_en: string; kind: AuthorKind }): Promise<AuthorRow> {
  const { data, error } = await supabase.from("authors").insert(fields).select(COLUMNS).single();
  if (error) throw storeError(error);
  return data as AuthorRow;
}

/** Changes an author's record; null when there is no such author. */
export async function updateAuthor(id: string, fields: AuthorFields): Promise<AuthorRow | null> {
  const { data, error } = await supabase.from("authors").update(fields).eq("id", id).select(COLUMNS).maybeSingle();
  if (error) throw storeError(error);
  return (data as AuthorRow | null) ?? null;
}
