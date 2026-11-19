import { ROLE_LABELS } from "@timesprime/shared/lib/staffRoles";
import type { RoleKey } from "@timesprime/shared/config/permissions";

// Panel 1's screens (design §4) talk to /api/admin/people/… and decide nothing themselves: what a
// person may do comes from the API (`can`, `caller`), and the server decides every request again.
// These are the shapes it sends, and the words the screens use.

export type Plan = "act" | "ask" | null;

export interface RoleView {
  id: string;
  role: string;
  language: "en" | "hi" | null;
  section: string | null;
  isBreakGlass: boolean;
  grantedBy: string | null;
  approvedBy: string | null;
  grantedByName?: string | null;
  approvedByName?: string | null;
  reason: string;
  grantedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  state: "live" | "expired" | "revoked";
}

export interface PersonView {
  userId: string;
  name: string;
  status: "active" | "suspended";
  email: string | null;
  hasFactor: boolean | null;
  lastSignInAt: string | null;
  createdAt: string;
  roles: RoleView[];
}

export interface CallerView {
  userId: string | null;
  asks: boolean;
  scopes: Array<{ language: "en" | "hi" | null; section: string | null }>;
  grantable: string[];
}

export interface RequestView {
  id: string;
  kind: string;
  userId: string | null;
  userName: string | null;
  details: Record<string, unknown>;
  reason: string;
  requestedBy: string;
  requestedByName: string | null;
  requestedAt: string;
  lapsesAt: string;
  lapsed: boolean;
  decidedByName: string | null;
  decidedAt: string | null;
  outcome: "approved" | "declined" | "cancelled" | null;
  note: string | null;
  mine: boolean;
  canDecide: boolean;
  canCancel: boolean;
}

export interface HistoryView {
  at: string;
  actor_label: string;
  action: string;
  outcome: string;
  reason: string | null;
}

export const roleLabel = (role: string) => ROLE_LABELS[role as RoleKey] ?? role.replace(/_/g, " ");
export const LANGUAGE_LABELS: Record<string, string> = { en: "English", hi: "Hindi" };
const sectionLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Hindi · Sports", "English", or "All desks". */
export function deskLabel(scope: { language: string | null; section: string | null }): string {
  const parts = [scope.language ? (LANGUAGE_LABELS[scope.language] ?? scope.language) : null, scope.section ? sectionLabel(scope.section) : null].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "All desks";
}

export { sectionLabel };

/** "18 May 2027", in IST. */
export function day(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
}

/** What a request asks for, in words. */
export function describeRequest(r: Pick<RequestView, "kind" | "details" | "userName">): string {
  const d = r.details as { role?: string; language?: string | null; section?: string | null; days?: number; display_name?: string };
  const who = r.userName ?? "someone";
  switch (r.kind) {
    case "grant":
      return `Grant ${who} ${roleLabel(d.role ?? "")} (${deskLabel({ language: d.language ?? null, section: d.section ?? null })}) for ${d.days ?? "?"} days`;
    case "renew":
      return `Renew ${who}'s ${roleLabel(d.role ?? "")} (${deskLabel({ language: d.language ?? null, section: d.section ?? null })}) for ${d.days ?? "?"} days`;
    case "rename":
      return `Rename ${who} to "${d.display_name ?? ""}"`;
    case "reactivate":
      return `Reactivate ${who}`;
    case "add_person":
      return `Add ${d.display_name ?? "a person"} as ${roleLabel(d.role ?? "")}`;
    case "password_link":
      return `A new password link for ${who}`;
    case "mfa_reset":
      return `Reset ${who}'s second factor`;
    default:
      return r.kind;
  }
}

/** What an answer means, for the screen's message: done at once, or asked of a second Super Admin. */
export function doneOrAsked(status: number, done: string): string {
  return status === 202 ? "Asked. A second Super Admin decides it within 72 hours." : done;
}
