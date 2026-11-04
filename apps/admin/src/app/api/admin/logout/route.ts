import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@timesprime/server/auth/adminSession";
import { auditEvent } from "@timesprime/server/auth/requirePermission";
import { readSession } from "@timesprime/server/auth/staffSession";
import { createRouteClient } from "@timesprime/server/auth/supabaseServer";
import { getClientIp } from "@timesprime/server/lib/rateLimit";

// Public (D10, PUBLIC_ADMIN_ROUTES): logout has to succeed even when the session has already
// expired, so clicking it always lands back on the login page instead of erroring on an invalid
// session. It clears the shared-password cookie, as before, and ends a staff session on this device
// only (scope "local"; signOut() would otherwise end it on every device). Nothing here can fail
// the request: the cookie is cleared whatever happens.
export async function POST(request: NextRequest) {
  const session = await readSession(request);
  if (session?.kind === "staff") {
    try {
      const client = await createRouteClient();
      await client?.auth.signOut({ scope: "local" });
    } catch (err) {
      console.error("Staff sign-out failed:", err);
    }
    await auditEvent(
      {
        kind: "staff",
        userId: session.userId,
        label: session.userId,
        aal: session.aal,
        roles: [],
        via: [],
        record: null,
        meta: { ip: getClientIp(request), userAgent: request.headers.get("user-agent"), requestId: request.headers.get("x-vercel-id") || crypto.randomUUID() },
      },
      "auth.sign_out",
      "succeeded"
    );
  }

  const response = NextResponse.json({ status: "success" });
  response.cookies.set(ADMIN_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
