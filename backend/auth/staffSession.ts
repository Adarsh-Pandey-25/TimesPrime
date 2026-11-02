import "server-only";

import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "./adminSession";
import type { Aal } from "./decide";
import { createRouteClient } from "./supabaseServer";

// Who is asking, for requirePermission (design §3). Two kinds of session, during the cut-over only:
//   - staff: a Supabase Auth session. getClaims() verifies the JWT's signature and expiry and gives
//     the user id and assurance level (aal). getUser() then asks Supabase whether the session still
//     exists: "an unexpired token stays valid even when the session behind it was revoked. Call
//     getUser() where that gap matters." Here it matters, so both run on every request.
//   - legacy: the shared password's HMAC cookie, until it is retired (adminSession.ts, Q3).
// A staff session wins when both cookies are present. Any error reading the staff session is "no
// staff session", never an error that lets the request through.

export type Session = { kind: "staff"; userId: string; aal: Aal; sessionId: string } | { kind: "legacy" };

async function readStaffSession(): Promise<Session | null> {
  const client = await createRouteClient();
  if (!client) return null;
  try {
    const { data } = await client.auth.getClaims();
    const claims = data?.claims;
    if (!claims || typeof claims.sub !== "string") return null;
    const { data: userData, error } = await client.auth.getUser();
    if (error || userData.user?.id !== claims.sub) return null;
    return {
      kind: "staff",
      userId: claims.sub,
      aal: claims.aal === "aal2" ? "aal2" : "aal1",
      sessionId: typeof claims.session_id === "string" ? claims.session_id : "",
    };
  } catch {
    return null;
  }
}

export async function readSession(request: NextRequest): Promise<Session | null> {
  const staff = await readStaffSession();
  if (staff) return staff;
  if (verifySessionToken(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) return { kind: "legacy" };
  return null;
}
