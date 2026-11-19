import "server-only";

import type { RequestKind } from "@timesprime/shared/config/people";
import { supabase } from "../lib/supabase";

/**
 * Staff and their access (Panel 1, Administration; design §2): the profiles, the role assignments
 * with their history, a Super Admin's requests, and what Supabase Auth knows of each account (the
 * email, whether a second factor is set, the last sign-in). Read and written as service_role; who
 * may do what is decided before (requirePermission, and the reach rules in services/people). The
 * database keeps its own rules whatever is asked here (migrations 2026-11-02-access-1 and
 * 2026-11-19-admin-1): assignments are history, a privileged role needs two Super Admins, and a
 * request is decided once.
 */

export class PeopleStoreError extends Error {
  constructor(
    readonly status: 404 | 409 | 422 | 500,
    message: string
  ) {
    super(message);
    this.name = "PeopleStoreError";
  }
}

/** Postgres's error codes from the access functions, triggers and constraints, as statuses. */
export function peopleError(error: { code?: string; message: string }): PeopleStoreError {
  switch (error.code) {
    case "40001": // serialization_failure: decided, lapsed or changed since it was read
      return new PeopleStoreError(409, error.message.replace(/^access: /, ""));
    case "23505": // unique_violation: the one-row index
      return new PeopleStoreError(409, "This person already holds this role in this scope.");
    case "P0002": // no_data_found
      return new PeopleStoreError(404, error.message.replace(/^access: /, ""));
    case "P0001": // raise_exception: the guard trigger's rules (the two-admin rule, a scope)
    case "23514": // check_violation
    case "23503": // foreign_key_violation
    case "22P02": // invalid_text_representation (a malformed id)
      return new PeopleStoreError(422, error.message.replace(/^(access|role_assignments): /, ""));
    default:
      return new PeopleStoreError(500, error.message);
  }
}

export interface ProfileRow {
  user_id: string;
  display_name: string;
  status: "active" | "suspended";
  mfa_required: boolean;
  created_at: string;
  created_by: string | null;
  last_sign_in_at: string | null;
}

export interface AssignmentRow {
  id: string;
  user_id: string;
  role_key: string;
  language: "en" | "hi" | null;
  section: string | null;
  is_break_glass: boolean;
  granted_by: string | null;
  approved_by: string | null;
  reason: string;
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
}

export interface RequestRow {
  id: string;
  kind: RequestKind;
  user_id: string | null;
  details: Record<string, unknown>;
  reason: string;
  requested_by: string;
  requested_at: string;
  lapses_at: string;
  decided_by: string | null;
  decided_at: string | null;
  outcome: "approved" | "declined" | "cancelled" | null;
  note: string | null;
}

/** What Supabase Auth knows of a staff account. */
export interface AuthAccount {
  email: string | null;
  /** A verified second factor is set. */
  hasFactor: boolean;
  lastSignInAt: string | null;
}

export interface HistoryRow {
  at: string;
  actor_label: string;
  action: string;
  outcome: string;
  reason: string | null;
  after: Record<string, unknown> | null;
}

const PROFILE = "user_id, display_name, status, mfa_required, created_at, created_by, last_sign_in_at";
const ASSIGNMENT =
  "id, user_id, role_key, language, section, is_break_glass, granted_by, approved_by, reason, granted_at, expires_at, revoked_at, revoked_by, revoke_reason";
const REQUEST = "id, kind, user_id, details, reason, requested_by, requested_at, lapses_at, decided_by, decided_at, outcome, note";

async function rows<T>(query: PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw peopleError(error);
  return Array.isArray(data) ? (data as T[]) : [];
}

async function one<T>(query: PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw peopleError(error);
  return (data as T | null) ?? null;
}

// ---- profiles ---------------------------------------------------------------------------------

export const listProfiles = () => rows<ProfileRow>(supabase.from("staff_profiles").select(PROFILE).order("display_name"));

export const getProfile = (userId: string) => one<ProfileRow>(supabase.from("staff_profiles").select(PROFILE).eq("user_id", userId).maybeSingle());

async function updateProfile(userId: string, fields: Partial<Pick<ProfileRow, "status" | "display_name">>): Promise<ProfileRow> {
  const row = await one<ProfileRow>(supabase.from("staff_profiles").update(fields).eq("user_id", userId).select(PROFILE).maybeSingle());
  if (!row) throw new PeopleStoreError(404, "Staff member not found.");
  return row;
}

export const setStatus = (userId: string, status: ProfileRow["status"]) => updateProfile(userId, { status });
export const rename = (userId: string, displayName: string) => updateProfile(userId, { display_name: displayName });

// ---- assignments ------------------------------------------------------------------------------

/** Every assignment of these people (or of everyone), live or not, newest first. */
export function listAssignments(userIds?: readonly string[]): Promise<AssignmentRow[]> {
  const query = supabase.from("role_assignments").select(ASSIGNMENT);
  return rows<AssignmentRow>((userIds ? query.in("user_id", [...userIds]) : query).order("granted_at", { ascending: false }));
}

/**
 * True when someone other than `userId` is an active Super Admin: the database's own test
 * (is_active_super_admin: an unrevoked, unexpired super_admin row that is not break-glass, on an
 * active profile), asked for each other holder of a super_admin row.
 */
export async function anotherActiveSuperAdmin(userId: string, now: Date): Promise<boolean> {
  const found = await rows<Pick<AssignmentRow, "user_id" | "role_key" | "is_break_glass" | "revoked_at" | "expires_at">>(
    supabase
      .from("role_assignments")
      .select("user_id, role_key, is_break_glass, revoked_at, expires_at")
      .eq("role_key", "super_admin")
      .eq("is_break_glass", false)
      .is("revoked_at", null)
      .gt("expires_at", now.toISOString())
  );
  const others = new Set(
    found
      .filter((r) => r.role_key === "super_admin" && !r.is_break_glass && r.revoked_at === null && Date.parse(r.expires_at) > now.getTime())
      .map((r) => r.user_id)
      .filter((id) => id !== userId)
  );
  for (const id of others) {
    const { data, error } = await supabase.rpc("is_active_super_admin", { p_user: id });
    if (error) throw peopleError(error);
    if (data === true) return true;
  }
  return false;
}

export interface GrantArgs {
  userId: string;
  role: string;
  language: string | null;
  section: string | null;
  days: number;
  reason: string;
  grantedBy: string;
  approvedBy: string | null;
  /** The assignment a renewal replaces. */
  replaces: string | null;
}

/** A grant or a renewal, through access_grant: one transaction (migration admin-1). */
export async function grant(a: GrantArgs): Promise<AssignmentRow> {
  const row = await one<AssignmentRow>(
    supabase.rpc("access_grant", {
      p_user: a.userId,
      p_role: a.role,
      p_language: a.language,
      p_section: a.section,
      p_days: a.days,
      p_reason: a.reason,
      p_granted_by: a.grantedBy,
      p_approved_by: a.approvedBy,
      p_replaces: a.replaces,
    })
  );
  if (!row) throw new PeopleStoreError(500, "The grant returned nothing.");
  return row;
}

/** Revokes one assignment. Rows are history: the update may only revoke, once (the guard trigger). */
export async function revoke(id: string, by: string, reason: string): Promise<AssignmentRow> {
  const row = await one<AssignmentRow>(
    supabase
      .from("role_assignments")
      .update({ revoked_at: new Date().toISOString(), revoked_by: by, revoke_reason: reason })
      .eq("id", id)
      .is("revoked_at", null)
      .select(ASSIGNMENT)
      .maybeSingle()
  );
  if (!row) throw new PeopleStoreError(409, "This role was already revoked.");
  return row;
}

// ---- break-glass (M3; design §5) ----------------------------------------------------------------

/**
 * Starts a Super Admin's own break-glass: a super_admin row with is_break_glass, granted by
 * themselves, ending `hours` later. The database allows it only for an active Super Admin starting
 * their own (admin-1's guard), for at most 2 hours (access-1's CHECK, which compares the two times
 * written here), and one at a time (the one-row index).
 */
export async function startBreakGlass(userId: string, reason: string, now: Date, hours: number): Promise<AssignmentRow> {
  const row = await one<AssignmentRow>(
    supabase
      .from("role_assignments")
      .insert({
        user_id: userId,
        role_key: "super_admin",
        language: null,
        section: null,
        is_break_glass: true,
        granted_by: userId,
        approved_by: null,
        reason,
        granted_at: now.toISOString(),
        expires_at: new Date(now.getTime() + hours * 3_600_000).toISOString(),
      })
      .select(ASSIGNMENT)
      .single()
  );
  if (!row) throw new PeopleStoreError(500, "Break-glass was not recorded.");
  return row;
}

/** Ends every live break-glass row of the person (early, or with their Super Admin role). */
export function endBreakGlass(userId: string, by: string, reason: string, now: Date): Promise<AssignmentRow[]> {
  return rows<AssignmentRow>(
    supabase
      .from("role_assignments")
      .update({ revoked_at: now.toISOString(), revoked_by: by, revoke_reason: reason })
      .eq("user_id", userId)
      .eq("is_break_glass", true)
      .is("revoked_at", null)
      .gt("expires_at", now.toISOString())
      .select(ASSIGNMENT)
  );
}

/** Every live break-glass row, for the other Super Admins' alert. */
export function activeBreakGlass(now: Date): Promise<AssignmentRow[]> {
  return rows<AssignmentRow>(
    supabase.from("role_assignments").select(ASSIGNMENT).eq("is_break_glass", true).is("revoked_at", null).gt("expires_at", now.toISOString())
  );
}

// ---- the access review (M3; design §6, migration admin-2) --------------------------------------

export interface ReviewRow {
  id: string;
  completed_by: string;
  completed_at: string;
  note: string | null;
}

/** The last completed review, or null if there has been none. */
export const lastReview = () =>
  one<ReviewRow>(supabase.from("access_reviews").select("id, completed_by, completed_at, note").order("completed_at", { ascending: false }).limit(1).maybeSingle());

/** Records a completed review. Reviews are append-only (admin-2's triggers). */
export async function recordReview(by: string, note: string | null, snapshot: unknown[]): Promise<ReviewRow> {
  const row = await one<ReviewRow>(
    supabase.from("access_reviews").insert({ completed_by: by, note, snapshot }).select("id, completed_by, completed_at, note").single()
  );
  if (!row) throw new PeopleStoreError(500, "The review was not recorded.");
  return row;
}

/** Signs a staff member out everywhere (staff_end_sessions, migration admin-1). Returns the count. */
export async function endSessions(userId: string): Promise<number> {
  const { data, error } = await supabase.rpc("staff_end_sessions", { p_user: userId });
  if (error) throw peopleError(error);
  return typeof data === "number" ? data : 0;
}

// ---- requests (the matrix's A) ----------------------------------------------------------------

export interface NewRequest {
  kind: RequestKind;
  userId: string | null;
  details: Record<string, unknown>;
  reason: string;
  requestedBy: string;
}

export async function createRequest(r: NewRequest): Promise<RequestRow> {
  const row = await one<RequestRow>(
    supabase
      .from("access_requests")
      .insert({ kind: r.kind, user_id: r.userId, details: r.details, reason: r.reason, requested_by: r.requestedBy })
      .select(REQUEST)
      .single()
  );
  if (!row) throw new PeopleStoreError(500, "The request was not recorded.");
  return row;
}

export const getRequest = (id: string) => one<RequestRow>(supabase.from("access_requests").select(REQUEST).eq("id", id).maybeSingle());

/** The open requests, and those decided since `since`, newest first; one person's if named. */
export function listRequests(since: Date, userId?: string): Promise<RequestRow[]> {
  let query = supabase.from("access_requests").select(REQUEST).or(`decided_at.is.null,decided_at.gte.${since.toISOString()}`);
  if (userId) query = query.eq("user_id", userId);
  return rows<RequestRow>(query.order("requested_at", { ascending: false }).limit(200));
}

export interface DecideArgs {
  requestId: string;
  deciderId: string;
  outcome: "approved" | "declined" | "cancelled";
  note: string | null;
  /** For add_person: the account made in Supabase Auth first (Panel 1, M2). */
  userId?: string | null;
}

/** A decision, and an approved change, through access_decide: one transaction (migration admin-1). */
export async function decide(a: DecideArgs): Promise<RequestRow> {
  const row = await one<RequestRow>(
    supabase.rpc("access_decide", { p_request: a.requestId, p_decider: a.deciderId, p_outcome: a.outcome, p_note: a.note, p_user: a.userId ?? null })
  );
  if (!row) throw new PeopleStoreError(500, "The decision returned nothing.");
  return row;
}

// ---- history (the audit log) ------------------------------------------------------------------

/** What was done to a person in Panel 1, newest first: the outcomes, not the attempts. */
export const personHistory = (userId: string) =>
  rows<HistoryRow>(
    supabase
      .from("audit_log")
      .select("at, actor_label, action, outcome, reason, after")
      .eq("entity_type", "staff")
      .eq("entity_id", userId)
      .in("outcome", ["succeeded", "failed"])
      .order("seq", { ascending: false })
      .limit(50)
  );

// ---- Supabase Auth ----------------------------------------------------------------------------

interface AuthUser {
  id: string;
  email?: string | null;
  last_sign_in_at?: string | null;
  factors?: Array<{ status?: string }> | null;
}

const toAccount = (u: AuthUser): AuthAccount => ({
  email: u.email ?? null,
  hasFactor: (u.factors ?? []).some((f) => f.status === "verified"),
  lastSignInAt: u.last_sign_in_at ?? null,
});

const PAGE = 1000;

/** Every account's email, second factor and last sign-in, by user id (Supabase Auth's admin API). */
export async function authAccounts(): Promise<Map<string, AuthAccount>> {
  const found = new Map<string, AuthAccount>();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new PeopleStoreError(500, `Supabase Auth: ${error.message}`);
    const users = (data?.users ?? []) as AuthUser[];
    for (const u of users) found.set(u.id, toAccount(u));
    if (users.length < PAGE) break;
  }
  return found;
}

/** The account with this email, if Supabase Auth has one (its admin API has no lookup by email). */
export async function findAuthUser(email: string): Promise<{ id: string; email: string } | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new PeopleStoreError(500, `Supabase Auth: ${error.message}`);
    const users = (data?.users ?? []) as AuthUser[];
    const found = users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (found) return { id: found.id, email };
    if (users.length < PAGE) break;
  }
  return null;
}

/**
 * The account for a person being added (Panel 1, M2): made with the email confirmed and no
 * password, so nobody can sign in to it until they set one with their link. If the email already
 * has an account (a retry, or someone who is not staff), that one is used. Safe to repeat.
 */
export async function ensureAuthUser(email: string): Promise<string> {
  const existing = await findAuthUser(email);
  if (existing) return existing.id;
  const { data, error } = await supabase.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data?.user) throw new PeopleStoreError(500, `Supabase Auth: ${error?.message ?? "no user made"}`);
  return data.user.id;
}

/**
 * A one-time "set your password" token for the account (generateLink, type recovery): the app
 * builds its own welcome link from it (welcomePath), and never stores or logs it. It works once,
 * until Supabase's email-link expiry.
 */
export async function recoveryToken(email: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.generateLink({ type: "recovery", email });
  const token = data?.properties?.hashed_token;
  if (error || !token) throw new PeopleStoreError(500, `Supabase Auth: ${error?.message ?? "no link made"}`);
  return token;
}

/** Deletes every second factor of the account (a lost device). Returns how many. Safe to repeat. */
export async function removeFactors(userId: string): Promise<number> {
  const { data, error } = await supabase.auth.admin.mfa.listFactors({ userId });
  if (error) throw new PeopleStoreError(500, `Supabase Auth: ${error.message}`);
  const factors = (data?.factors ?? []) as Array<{ id: string }>;
  for (const f of factors) {
    const removed = await supabase.auth.admin.mfa.deleteFactor({ id: f.id, userId });
    if (removed.error) throw new PeopleStoreError(500, `Supabase Auth: ${removed.error.message}`);
  }
  return factors.length;
}

/** Makes a staff profile for a new account, or leaves an existing one as it is. */
export async function addProfile(userId: string, displayName: string, createdBy: string): Promise<void> {
  const { error } = await supabase
    .from("staff_profiles")
    .upsert({ user_id: userId, display_name: displayName, status: "active", mfa_required: true, created_by: createdBy }, { onConflict: "user_id", ignoreDuplicates: true });
  if (error) throw peopleError(error);
}

export async function authAccount(userId: string): Promise<AuthAccount | null> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) throw new PeopleStoreError(500, `Supabase Auth: ${error.message}`);
  return data?.user ? toAccount(data.user as AuthUser) : null;
}
