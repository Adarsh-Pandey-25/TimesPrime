// Grievances (Panel 7 design §2 to §4, decisions 1 to 5): a reader's complaint about anything
// published gets a ticket at once, and a decision within 15 days; the Grievance Officer's queue keeps
// the clocks. The database keeps the same rules (database/migrations/2026-11-20-compliance-1-
// grievances.sql); these are what the back office and the reader site share.

export const GRIEVANCE_LANGUAGES = ["en", "hi"] as const;
export type GrievanceLanguage = (typeof GRIEVANCE_LANGUAGES)[number];

export function isGrievanceLanguage(value: unknown): value is GrievanceLanguage {
  return value === "en" || value === "hi";
}

/** Decision 5: what a grievance is about. */
export const GRIEVANCE_CATEGORIES = ["factual_error", "defamation_privacy", "obscene_harmful", "copyright", "other"] as const;
export type GrievanceCategory = (typeof GRIEVANCE_CATEGORIES)[number];

export const GRIEVANCE_CATEGORY_LABELS: Record<GrievanceCategory, Record<GrievanceLanguage, string>> = {
  factual_error: { en: "A factual error", hi: "तथ्य की गलती" },
  defamation_privacy: { en: "Defamation or privacy", hi: "मानहानि या निजता" },
  obscene_harmful: { en: "Obscene or harmful content", hi: "अश्लील या हानिकारक सामग्री" },
  copyright: { en: "Copyright", hi: "कॉपीराइट" },
  other: { en: "Something else", hi: "कुछ और" },
};

export function isGrievanceCategory(value: unknown): value is GrievanceCategory {
  return (GRIEVANCE_CATEGORIES as readonly unknown[]).includes(value);
}

/** How a grievance arrived: the form, or a way an officer types it in from. */
export const ENTERED_CHANNELS = ["email", "post", "other"] as const;
export type EnteredChannel = (typeof ENTERED_CHANNELS)[number];
export type GrievanceChannel = "web" | EnteredChannel;

export const GRIEVANCE_CHANNEL_LABELS: Record<GrievanceChannel, string> = {
  web: "The form",
  email: "Email",
  post: "Post",
  other: "Another way",
};

export function isEnteredChannel(value: unknown): value is EnteredChannel {
  return (ENTERED_CHANNELS as readonly unknown[]).includes(value);
}

/** A decision's outcome. The last three close a grievance without deciding its substance. */
export const GRIEVANCE_OUTCOMES = ["upheld", "partly_upheld", "not_upheld", "outside_scope", "withdrawn", "duplicate", "spam"] as const;
export type GrievanceOutcome = (typeof GRIEVANCE_OUTCOMES)[number];

export const GRIEVANCE_OUTCOME_LABELS: Record<GrievanceOutcome, Record<GrievanceLanguage, string>> = {
  upheld: { en: "Upheld", hi: "स्वीकार की गई" },
  partly_upheld: { en: "Partly upheld", hi: "आंशिक रूप से स्वीकार की गई" },
  not_upheld: { en: "Not upheld", hi: "स्वीकार नहीं की गई" },
  outside_scope: { en: "Outside what we can decide", hi: "हमारे दायरे से बाहर" },
  withdrawn: { en: "Withdrawn", hi: "वापस ली गई" },
  duplicate: { en: "A duplicate of another grievance", hi: "दूसरी शिकायत जैसी ही" },
  spam: { en: "Not a grievance (spam)", hi: "शिकायत नहीं (स्पैम)" },
};

export function isGrievanceOutcome(value: unknown): value is GrievanceOutcome {
  return (GRIEVANCE_OUTCOMES as readonly unknown[]).includes(value);
}

export type GrievanceState = "open" | "decided";

/** The longest of each field, in characters, as the table's CHECKs have them. */
export const GRIEVANCE_LIMITS = { name: 120, email: 254, aboutUrl: 500, body: 5000, reply: 5000, note: 2000 } as const;

/** The clocks: acknowledged within 24 hours, decided within 15 days, both from when it arrived. */
export const ACK_HOURS = 24;
export const DECIDE_DAYS = 15;
/** The queue marks an open grievance "due soon" this many days before its decision is due. */
export const DUE_SOON_DAYS = 2;

/**
 * Decision 3: the form's limits. Per address, 3 an hour and 10 a day; 500 a day across the site,
 * which the database's grievance_submit also holds. The status page, 20 an hour per address.
 */
export const FORM_PER_HOUR = 3;
export const FORM_PER_DAY = 10;
export const FORM_DAILY_CAP = 500;
export const STATUS_PER_HOUR = 20;

/** G-<year>-<number>, for example G-2026-00042. */
export const TICKET_PATTERN = /^G-\d{4}-\d{5,}$/;

/** A ticket as typed (spaces, lower case) in its stored form. */
export function normaliseTicket(value: string): string {
  return value.trim().toUpperCase();
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isEmail(value: unknown): value is string {
  return typeof value === "string" && value.trim().length <= GRIEVANCE_LIMITS.email && EMAIL.test(value.trim());
}

/** An email for the Managing Editor's read-only view (decision 4): its first letter and its domain. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  return `${email[0]}•••${email.slice(at)}`;
}

/** What a grievance's sender gives, checked: by the form, or by an officer typing one in. */
export interface GrievanceFields {
  language: GrievanceLanguage;
  name: string;
  email: string;
  aboutUrl: string | null;
  category: GrievanceCategory;
  body: string;
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** The fields of a request body (`language`, `name`, `email`, `about_url`, `category`, `body`), or the first problem. */
export function grievanceFields(input: Record<string, unknown>): { ok: true; fields: GrievanceFields } | { ok: false; error: string } {
  const language = input.language;
  if (!isGrievanceLanguage(language)) return { ok: false, error: "language must be en or hi." };
  const name = text(input.name);
  if (!name || name.length > GRIEVANCE_LIMITS.name) return { ok: false, error: `A name of 1 to ${GRIEVANCE_LIMITS.name} characters is required.` };
  if (!isEmail(input.email)) return { ok: false, error: "An email address we can reply to is required." };
  const email = text(input.email);
  if (input.about_url !== undefined && input.about_url !== null && typeof input.about_url !== "string") {
    return { ok: false, error: "about_url must be text." };
  }
  const aboutUrl = text(input.about_url) || null;
  if (aboutUrl !== null && aboutUrl.length > GRIEVANCE_LIMITS.aboutUrl) return { ok: false, error: `The address is at most ${GRIEVANCE_LIMITS.aboutUrl} characters.` };
  if (!isGrievanceCategory(input.category)) return { ok: false, error: "category must be one of the listed kinds." };
  const body = text(input.body);
  if (!body || body.length > GRIEVANCE_LIMITS.body) return { ok: false, error: `The grievance is 1 to ${GRIEVANCE_LIMITS.body} characters.` };
  return { ok: true, fields: { language, name, email, aboutUrl, category: input.category, body } };
}

/** The times a grievance's clock is read from. */
export interface ClockFields {
  state: GrievanceState;
  acknowledged_at: string | null;
  ack_due_at: string;
  decide_due_at: string;
  decided_at: string | null;
}

/**
 * Where a grievance stands against its clocks, most urgent first: "late" (no decision by its due
 * time); "ack_late" (typed in, and not acknowledged within 24 hours); "ack_due"; "due_soon" (within
 * DUE_SOON_DAYS); "due"; or "decided", on time or not.
 */
export type GrievanceClock =
  | { kind: "late" | "ack_late" | "ack_due" | "due_soon" | "due"; at: string }
  | { kind: "decided"; at: string; onTime: boolean };

const DAY = 86_400_000;

export function grievanceClock(g: ClockFields, now: number): GrievanceClock {
  if (g.state === "decided" && g.decided_at) {
    return { kind: "decided", at: g.decided_at, onTime: Date.parse(g.decided_at) <= Date.parse(g.decide_due_at) };
  }
  const decideDue = Date.parse(g.decide_due_at);
  if (decideDue <= now) return { kind: "late", at: g.decide_due_at };
  if (!g.acknowledged_at) return { kind: Date.parse(g.ack_due_at) <= now ? "ack_late" : "ack_due", at: g.ack_due_at };
  return { kind: decideDue - now <= DUE_SOON_DAYS * DAY ? "due_soon" : "due", at: g.decide_due_at };
}
