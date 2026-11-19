import "server-only";

import type { NextRequest } from "next/server";
import type { Aal } from "./decide";
import { createRouteClient } from "./supabaseServer";

// Who is asking, for requirePermission (design §3): a Supabase Auth staff session, the only kind
// since the shared admin password was retired (Panel 1, M4). getClaims() verifies the JWT's
// signature and expiry and gives the user id and assurance level (aal). getUser() then asks
// Supabase whether the session still exists: "an unexpired token stays valid even when the session
// behind it was revoked. Call getUser() where that gap matters." Here it matters, so both run on
// every request. Any error reading the session is "no session", never an error that lets the
// request through.

export type Session = { kind: "staff"; userId: string; aal: Aal; sessionId: string };

/** The request's staff session, or null. The request is kept for the callers' shape: the cookies come from next/headers. */
export async function readSession(request?: NextRequest): Promise<Session | null> {
  void request;
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
