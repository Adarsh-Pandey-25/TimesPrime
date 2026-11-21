// The legal-orders register (Panel 7 design §2 and §3, M4, decision 8): court, government, police and
// self-regulatory orders, confidential to holders of legal_order.manage. The database keeps the same
// values (database/migrations/2026-11-21-compliance-4-legal-orders.sql).

export const AUTHORITY_TYPES = ["court", "government", "police", "self_regulatory_body", "other"] as const;
export type AuthorityType = (typeof AUTHORITY_TYPES)[number];
export const AUTHORITY_TYPE_LABELS: Record<AuthorityType, string> = {
  court: "A court",
  government: "The government (MIB or another ministry)",
  police: "The police or an agency",
  self_regulatory_body: "A self-regulatory body",
  other: "Another authority",
};

export const RECEIVED_VIA = ["email", "post", "portal", "in_person", "other"] as const;
export type ReceivedVia = (typeof RECEIVED_VIA)[number];
export const RECEIVED_VIA_LABELS: Record<ReceivedVia, string> = { email: "Email", post: "Post", portal: "A portal", in_person: "In person", other: "Another way" };

export const ORDER_ASKS = ["remove_or_block", "preserve_records", "give_information", "publish_correction_or_apology", "other"] as const;
export type OrderAsk = (typeof ORDER_ASKS)[number];
export const ORDER_ASK_LABELS: Record<OrderAsk, string> = {
  remove_or_block: "Remove or block content",
  preserve_records: "Preserve records",
  give_information: "Give information",
  publish_correction_or_apology: "Publish a correction or apology",
  other: "Something else",
};

export const ORDER_STATUSES = ["open", "complied", "partly_complied", "challenged", "closed"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  open: "Open",
  complied: "Complied",
  partly_complied: "Partly complied",
  challenged: "Challenged",
  closed: "Closed",
};

/** The longest of each field, in characters, as the table's CHECKs have them. */
export const LEGAL_ORDER_LIMITS = { reference: 200, authority: 200, summary: 4000, originalKeptAt: 500, action: 2000, stories: 20 } as const;

const includes = <T extends string>(list: readonly T[], value: unknown): value is T => (list as readonly unknown[]).includes(value);
export const isAuthorityType = (v: unknown): v is AuthorityType => includes(AUTHORITY_TYPES, v);
export const isReceivedVia = (v: unknown): v is ReceivedVia => includes(RECEIVED_VIA, v);
export const isOrderAsk = (v: unknown): v is OrderAsk => includes(ORDER_ASKS, v);
export const isOrderStatus = (v: unknown): v is OrderStatus => includes(ORDER_STATUSES, v);

/** An order as Legal enters it, checked. Story addresses are resolved by the route. */
export interface LegalOrderFields {
  reference: string;
  authorityType: AuthorityType;
  authority: string;
  orderDate: string | null;
  receivedAt: string;
  receivedVia: ReceivedVia;
  asks: OrderAsk[];
  summary: string;
  dueAt: string | null;
  originalKeptAt: string;
  storyAddresses: string[];
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A time from the body, or null when absent; undefined when it is not a time. */
function time(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  const at = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(at) ? new Date(at).toISOString() : undefined;
}

/** The story addresses of a body: a list of text, at most LEGAL_ORDER_LIMITS.stories. */
export function storyAddresses(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) return null;
  const list = (value as string[]).map((v) => v.trim()).filter(Boolean);
  return list.length <= LEGAL_ORDER_LIMITS.stories ? [...new Set(list)] : null;
}

/** The fields of a new order (`reference`, `authority_type`, …), or the first problem. */
export function legalOrderFields(input: Record<string, unknown>, now: number): { ok: true; fields: LegalOrderFields } | { ok: false; error: string } {
  const reference = text(input.reference);
  if (!reference || reference.length > LEGAL_ORDER_LIMITS.reference) return { ok: false, error: `The order's reference is 1 to ${LEGAL_ORDER_LIMITS.reference} characters.` };
  if (!isAuthorityType(input.authority_type)) return { ok: false, error: "authority_type must be one of the listed kinds." };
  const authority = text(input.authority);
  if (!authority || authority.length > LEGAL_ORDER_LIMITS.authority) return { ok: false, error: `The authority's name is 1 to ${LEGAL_ORDER_LIMITS.authority} characters.` };
  const orderDate = input.order_date === undefined || input.order_date === null || input.order_date === "" ? null : text(input.order_date);
  if (orderDate !== null && (!DAY.test(orderDate) || !Number.isFinite(Date.parse(orderDate)))) return { ok: false, error: "order_date must be a date, like 2026-11-20." };
  const receivedAt = time(input.received_at);
  if (!receivedAt) return { ok: false, error: "received_at, when the order reached us, is required." };
  if (Date.parse(receivedAt) > now) return { ok: false, error: "received_at cannot be in the future." };
  if (!isReceivedVia(input.received_via)) return { ok: false, error: "received_via must be one of the listed ways." };
  const asks = Array.isArray(input.asks) ? [...new Set(input.asks)] : [];
  if (asks.length === 0 || !asks.every(isOrderAsk)) return { ok: false, error: "asks: at least one of the listed kinds." };
  const summary = text(input.summary);
  if (!summary || summary.length > LEGAL_ORDER_LIMITS.summary) return { ok: false, error: `The summary is 1 to ${LEGAL_ORDER_LIMITS.summary} characters.` };
  const dueAt = time(input.due_at);
  if (dueAt === undefined) return { ok: false, error: "due_at must be a time, or absent." };
  const originalKeptAt = text(input.original_kept_at);
  if (!originalKeptAt || originalKeptAt.length > LEGAL_ORDER_LIMITS.originalKeptAt) return { ok: false, error: `Where the original is kept is 1 to ${LEGAL_ORDER_LIMITS.originalKeptAt} characters.` };
  const stories = storyAddresses(input.stories);
  if (stories === null) return { ok: false, error: `stories: a list of at most ${LEGAL_ORDER_LIMITS.stories} story addresses.` };
  return {
    ok: true,
    fields: { reference, authorityType: input.authority_type, authority, orderDate, receivedAt, receivedVia: input.received_via, asks: asks as OrderAsk[], summary, dueAt, originalKeptAt, storyAddresses: stories },
  };
}

/** Where an open order stands against its deadline: none, due, due within 2 days, or late. */
export function orderClock(order: { status: OrderStatus; due_at: string | null }, now: number): "none" | "due" | "due_soon" | "late" | "done" {
  if (order.status === "closed" || order.status === "complied") return "done";
  if (!order.due_at) return "none";
  const due = Date.parse(order.due_at);
  if (due <= now) return "late";
  return due - now <= 2 * 86_400_000 ? "due_soon" : "due";
}
