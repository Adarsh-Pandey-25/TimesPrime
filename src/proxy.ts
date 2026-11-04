import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/server/auth/adminSession";
import { isPublicAdminRequest } from "@/server/auth/adminRoutePolicy";
import { createProxyClient } from "@/server/auth/supabaseServer";

// Next.js 16 renamed Middleware to Proxy — this file replaces what would
// previously have been middleware.ts. Same runtime, new file name.
//
// The optimistic check (Panel 0). Next's guidance: Proxy runs on every matched request, prefetches
// included, so it reads only the session from the cookie and makes no database call; it "should not
// be your only line of defense". The real decision is requirePermission in every admin route body
// (src/server/auth/requirePermission.ts), which reads the staff record live. This file only answers
// "is there a session at all?", and sends everyone else to the sign-in page (or a 401 for the API).
//
// Two sessions are accepted, so no one is locked out during the cut-over (owner's condition):
//   - the shared password's HMAC cookie, until it is retired (adminSession.ts, Q3);
//   - a Supabase staff session: getClaims() verifies its JWT and refreshes it when due, and the
//     refreshed cookies go to the browser and on to the route (src/server/auth/supabaseServer.ts).
//
// What may pass with no session is one list, shared with the route-walk test: the sign-in page,
// POST login, POST logout, and GET breaking-news for the homepage banner (owner decision D10,
// PUBLIC_ADMIN_ROUTES in src/server/auth/adminRoutePolicy.ts).

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicAdminRequest(pathname, request.method)) {
    return NextResponse.next();
  }

  if (verifySessionToken(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  const supabase = createProxyClient(request);
  if (supabase) {
    let signedIn = false;
    try {
      const { data } = await supabase.client.auth.getClaims();
      signedIn = typeof data?.claims?.sub === "string";
    } catch {
      signedIn = false;
    }
    if (signedIn) return supabase.response();
  }

  const denied = pathname.startsWith("/api/admin/")
    ? NextResponse.json({ error: "Unauthorized: please log in." }, { status: 401 })
    : NextResponse.redirect(new URL("/admin/login", request.url));
  // A failed refresh clears the staff cookies; carry that onto the response actually sent.
  for (const cookie of supabase?.response().cookies.getAll() ?? []) denied.cookies.set(cookie);
  return denied;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
