import "server-only";

import type { AuthorityType, LegalOrderFields, OrderAsk, OrderStatus, ReceivedVia } from "@timesprime/shared/config/legalOrders";
import { supabase } from "../lib/supabase";
import { GrievanceStoreError } from "./grievances";

/**
 * The legal-orders register (Panel 7 design §2, M4), read and written as service_role, confidential:
 * no reader has any right on it (database/migrations/2026-11-21-compliance-4-legal-orders.sql). The
 * guard trigger keeps what an order is from changing, and a closed order final; who may act
 * (legal_order.manage) and the fields are decided before any of this is called.
 */

export interface LegalOrderRow {
  id: string;
  reference: string;
  authority_type: AuthorityType;
  authority: string;
  order_date: string | null;
  received_at: string;
  received_via: ReceivedVia;
  asks: OrderAsk[];
  summary: string;
  story_ids: string[];
  due_at: string | null;
  status: OrderStatus;
  original_kept_at: string;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
}

export interface LegalOrderActionRow {
  id: string;
  order_id: string;
  body: string;
  author_id: string;
  created_at: string;
}

const COLUMNS =
  "id, reference, authority_type, authority, order_date, received_at, received_via, asks, summary, story_ids, due_at, status, original_kept_at, created_by, created_at, updated_by, updated_at";
const ACTION_COLUMNS = "id, order_id, body, author_id, created_at";

/** Codes for "not there yet": compliance-4 not applied. */
const NOT_APPLIED = new Set(["42P01", "PGRST205"]);

/** The database's refusals: 409 for a closed order (the guard); 422 for a value the table refuses. */
export function legalOrderError(error: { code?: string; message: string }): GrievanceStoreError {
  if (/is closed/.test(error.message)) return new GrievanceStoreError(409, "This order is closed: a closed order is final.");
  switch (error.code) {
    case "23514":
    case "23502":
    case "23503":
    case "22P02":
    case "22007":
    case "22008":
      return new GrievanceStoreError(422, error.message);
    default:
      return new GrievanceStoreError(500, error.message);
  }
}

/** The register: open orders (every status but closed) by their deadline, the undated last; or all, newest first. null before compliance-4. */
export async function listLegalOrders(filter: "open" | "all"): Promise<LegalOrderRow[] | null> {
  let query = supabase.from("legal_orders").select(COLUMNS);
  query = filter === "open" ? query.neq("status", "closed").order("due_at", { ascending: true, nullsFirst: false }) : query.order("received_at", { ascending: false });
  const { data, error } = await query.limit(500);
  if (error) {
    if (error.code && NOT_APPLIED.has(error.code)) return null;
    throw legalOrderError(error);
  }
  return (data ?? []) as LegalOrderRow[];
}

export async function getLegalOrder(id: string): Promise<LegalOrderRow | null> {
  const { data, error } = await supabase.from("legal_orders").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw legalOrderError(error);
  return (data as LegalOrderRow | null) ?? null;
}

/** An order's actions, oldest first. */
export async function listLegalOrderActions(id: string): Promise<LegalOrderActionRow[]> {
  const { data, error } = await supabase.from("legal_order_actions").select(ACTION_COLUMNS).eq("order_id", id).order("created_at", { ascending: true });
  if (error) throw legalOrderError(error);
  return ((data ?? []) as LegalOrderActionRow[]).filter((a) => a.order_id === id);
}

/** Enters an order. */
export async function createLegalOrder(fields: LegalOrderFields, storyIds: string[], actorId: string): Promise<LegalOrderRow> {
  const { data, error } = await supabase
    .from("legal_orders")
    .insert({
      reference: fields.reference,
      authority_type: fields.authorityType,
      authority: fields.authority,
      order_date: fields.orderDate,
      received_at: fields.receivedAt,
      received_via: fields.receivedVia,
      asks: fields.asks,
      summary: fields.summary,
      story_ids: storyIds,
      due_at: fields.dueAt,
      original_kept_at: fields.originalKeptAt,
      created_by: actorId,
    })
    .select(COLUMNS)
    .single();
  if (error) throw legalOrderError(error);
  return data as LegalOrderRow;
}

/** What may change on an order that is not closed: its state, deadline, stories and where the original is kept. */
export interface LegalOrderChange {
  status?: OrderStatus;
  due_at?: string | null;
  story_ids?: string[];
  original_kept_at?: string;
}

/** Changes an order, naming who and when. Only while it is not closed (the guard refuses after). */
export async function updateLegalOrder(id: string, change: LegalOrderChange, actorId: string): Promise<LegalOrderRow> {
  const { data, error } = await supabase
    .from("legal_orders")
    .update({ ...change, updated_by: actorId, updated_at: new Date().toISOString() })
    .eq("id", id)
    .neq("status", "closed")
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw legalOrderError(error);
  if (!data) throw new GrievanceStoreError(409, "This order is closed: a closed order is final.");
  return data as LegalOrderRow;
}

/** Records what was done about an order. */
export async function addLegalOrderAction(id: string, body: string, actorId: string): Promise<LegalOrderActionRow> {
  const { data, error } = await supabase.from("legal_order_actions").insert({ order_id: id, body, author_id: actorId }).select(ACTION_COLUMNS).single();
  if (error) throw legalOrderError(error);
  return data as LegalOrderActionRow;
}

/** The Desk stories an order names: their state and live headline, by id. */
export async function orderStories(ids: readonly string[]): Promise<Array<{ id: string; workflow_state: string; headline: string | null }>> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("stories").select("id, workflow_state, revision:story_revisions!stories_published_revision_fk(headline)").in("id", [...ids]);
  if (error) throw legalOrderError(error);
  return ((data ?? []) as unknown as Array<{ id: string; workflow_state: string; revision: { headline: string } | null }>).map((s) => ({
    id: s.id,
    workflow_state: s.workflow_state,
    headline: s.revision?.headline ?? null,
  }));
}
