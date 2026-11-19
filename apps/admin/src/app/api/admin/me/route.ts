import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { ANY_SCOPE, decide, type Mode } from "@timesprime/server/auth/decide";
import { getMfaState } from "@timesprime/server/auth/mfa";
import { requireSession } from "@timesprime/server/auth/requirePermission";
import { createRouteClient } from "@timesprime/server/auth/supabaseServer";
import { PERMISSION_KEYS } from "@timesprime/shared/config/permissions";
import type { AdminMe } from "@timesprime/shared/types";

// Who is signed in and what they hold now (design §4). Session-only (SESSION_ONLY_ADMIN_ROUTES): an
// aal1 session must reach it to learn it has an MFA step to do. The admin UI uses it to hide what
// the user lacks; that is UX, never a security boundary: every route decides again on the server.

export async function GET(request: NextRequest) {
  const gate = await requireSession(request);
  if (!gate.ok) return gate.response;
  const actor = gate.actor;

  const record = actor.record;
  const now = new Date();
  const decision = (permission: (typeof PERMISSION_KEYS)[number], mode: Mode) =>
    decide({ staff: record, aal: actor.aal ?? "aal1", permission, mode, target: mode === "act" ? ANY_SCOPE : undefined, now });
  const permissions: Record<string, "act" | "read" | "ask"> = {};
  for (const key of PERMISSION_KEYS) {
    const act = decision(key, "act");
    if (act.allowed) permissions[key] = "act";
    // The matrix's A: they may ask, and a second person decides (Panel 2's restore and correction,
    // Panel 1's people). Before read, because A also counts as read (Panel 1 approval, 19 Nov 2026).
    else if (act.code === "needs_approval") permissions[key] = "ask";
    else if (decision(key, "read").allowed) permissions[key] = "read";
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
