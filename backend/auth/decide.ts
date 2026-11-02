import "server-only";

import type { AccessCode, PermissionKey, RoleKey, ScopeLanguage } from "@/shared/config/permissions";
import { covers, type Target } from "./scope";

// The permission rule, as a pure function: no I/O, no clock of its own, so every rule is tested
// directly (decide.test.ts). requirePermission.ts loads the inputs and turns the answer into a
// response. Design §3, "decide(), in order".
//
// Deny by default. The answer is "yes" only for a live assignment (not revoked, not expired) whose
// role grants the permission with a code that allows the mode, whose scope covers the target, and
// whose MFA requirement the session meets. Everything else, including anything unexpected in the
// data, is "no".

export type Mode = "read" | "act";
export type Aal = "aal1" | "aal2";

export interface Grant {
  permission: PermissionKey;
  access: AccessCode;
  breakGlassOnly: boolean;
}

/** One role assignment, with its role's grants and MFA flag joined in. */
export interface Assignment {
  id: string;
  role: RoleKey;
  language: ScopeLanguage | null;
  section: string | null;
  isBreakGlass: boolean;
  expiresAt: string;
  revokedAt: string | null;
  requiresAal2: boolean;
  grants: Grant[];
}

export interface StaffRecord {
  userId: string;
  displayName: string;
  status: "active" | "suspended";
  mfaRequired: boolean;
  /** Every assignment the user has, live or not: decide() filters. */
  assignments: Assignment[];
}

export type DenyCode = "not_staff" | "suspended" | "mfa_required" | "needs_approval" | "forbidden";

export type Decision = { allowed: true; via: string[] } | { allowed: false; status: 403; code: DenyCode };

// R and M are read-only; Own needs the item's owner, which Panel 2 adds; A needs a second person,
// whose approval flow comes with the panel that uses it. Until then both are refused.
const ALLOWS: Record<Mode, ReadonlySet<AccessCode>> = {
  read: new Set<AccessCode>(["F", "S", "R", "M"]),
  act: new Set<AccessCode>(["F", "S"]),
};

const deny = (code: DenyCode): Decision => ({ allowed: false, status: 403, code });

/**
 * "Held in some scope": the pre-check a route makes before it loads its target (an article it must
 * read first), so that a caller with no grant at all is refused before any database read. It is
 * never the final answer for a change: the route then decides again with the real target.
 */
export const ANY_SCOPE = "any" as const;

export function decide(input: {
  staff: StaffRecord | null;
  aal: Aal;
  permission: PermissionKey;
  mode: Mode;
  /** Required to act. Omitted for a read that lists or totals: then any scope will do. */
  target?: Target | typeof ANY_SCOPE;
  now: Date;
}): Decision {
  const { staff, aal, permission, mode, target, now } = input;
  if (!staff) return deny("not_staff");
  if (staff.status !== "active") return deny("suspended");
  if (mode === "act" && !target) return deny("forbidden");

  let needsApproval = false;
  let needsMfa = false;
  const via: string[] = [];

  for (const a of staff.assignments) {
    const expires = Date.parse(a.expiresAt);
    if (a.revokedAt !== null || !Number.isFinite(expires) || expires <= now.getTime()) continue;

    const grant = a.grants.find((g) => g.permission === permission);
    if (!grant) continue;
    if (grant.breakGlassOnly && !a.isBreakGlass) continue;
    if (target && target !== ANY_SCOPE && !covers(a, target)) continue;
    if (!ALLOWS[mode].has(grant.access)) {
      if (mode === "act" && grant.access === "A") needsApproval = true;
      continue;
    }
    if ((a.requiresAal2 || staff.mfaRequired) && aal !== "aal2") {
      needsMfa = true;
      continue;
    }
    via.push(a.id);
  }

  if (via.length > 0) return { allowed: true, via };
  if (needsMfa) return deny("mfa_required");
  if (needsApproval) return deny("needs_approval");
  return deny("forbidden");
}

/**
 * What the shared admin password may do during the cut-over (owner decision Q3): today's editorial
 * and sync work, in every scope, and nothing else. Never user.manage or role.assign, so the old
 * password cannot mint admins in the new system; never audit or settings permissions; never the
 * purge (Q5). It is not a person, so it holds no role and needs no MFA.
 */
export const LEGACY_PERMISSIONS: ReadonlySet<PermissionKey> = new Set<PermissionKey>([
  "article.view_admin",
  "article.create",
  "article.edit",
  "article.unpublish",
  "article.bulk_action",
  "article.publish_direct",
  "breaking_banner.manage",
  "sync.run",
  "sync.view",
  "stats.view",
]);

export function decideLegacy(permission: PermissionKey): Decision {
  return LEGACY_PERMISSIONS.has(permission) ? { allowed: true, via: ["legacy"] } : deny("forbidden");
}
