import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { LEGACY_LOGIN_ENDS_AT } from "@/backend/auth/adminSession";
import { ANY_SCOPE, decide, LEGACY_PERMISSIONS, type Mode } from "@/backend/auth/decide";
import { getMfaState } from "@/backend/auth/mfa";
import { requireSession } from "@/backend/auth/requirePermission";
import { createRouteClient } from "@/backend/auth/supabaseServer";
import { PERMISSION_KEYS } from "@/shared/config/permissions";
import type { AdminMe } from "@/shared/types";

// Who is signed in and what they hold now (design §4). Session-only (SESSION_ONLY_ADMIN_ROUTES): an
// aal1 session must reach it to learn it has an MFA step to do. The admin UI uses it to hide what
// the user lacks; that is UX, never a security boundary: every route decides again on the server.

export async function GET(request: NextRequest) {
  const gate = await requireSession(request);
  if (!gate.ok) return gate.response;
  const actor = gate.actor;

  if (actor.kind === "legacy") {
    const body: AdminMe = {
      kind: "legacy",
      displayName: "Shared admin password",
      retiresAt: LEGACY_LOGIN_ENDS_AT.toISOString(),
      permissions: Object.fromEntries([...LEGACY_PERMISSIONS].map((p) => [p, "act"])),
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  }

  const record = actor.record;
  const now = new Date();
  const held = (permission: (typeof PERMISSION_KEYS)[number], mode: Mode) =>
    decide({ staff: record, aal: actor.aal ?? "aal1", permission, mode, target: mode === "act" ? ANY_SCOPE : undefined, now }).allowed;
  const permissions: Record<string, "act" | "read"> = {};
  for (const key of PERMISSION_KEYS) {
    if (held(key, "act")) permissions[key] = "act";
    else if (held(key, "read")) permissions[key] = "read";
  }

  const client = await createRouteClient();
  const mfa = client ? await getMfaState(client) : null;
  const live = (record?.assignments ?? []).filter((a) => a.revokedAt === null && Date.parse(a.expiresAt) > now.getTime());

  const body: AdminMe = {
    kind: "staff",
    displayName: actor.label,
    aal: actor.aal ?? "aal1",
    roles: live.map((a) => ({ role: a.role, language: a.language, section: a.section, expiresAt: a.expiresAt })),
    permissions,
    mfa: {
      required: Boolean(record?.mfaRequired) || live.some((a) => a.requiresAal2),
      enrolled: Boolean(mfa?.enrolled),
    },
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
