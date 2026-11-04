import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/backend/auth/adminSession";

// Next.js 16 renamed Middleware to Proxy — this file replaces what would
// previously have been middleware.ts. Same runtime, new file name.

// Routes the admin surface itself needs to reach before a session exists
// (or after it's just been cleared): the login page, the endpoint that
// creates the session cookie, and the endpoint that clears it. Everything
// else under /admin/* and /api/admin/* requires a valid session.
const PUBLIC_ADMIN_PATHS = new Set(["/admin/login", "/api/admin/login", "/api/admin/logout"]);

// Breaking news is read by the public-facing homepage banner
// (frontend/features/news/BreakingNewsBanner.tsx), which has no admin session —
// so only GET on this one path is public. POST/DELETE (admin management,
// same route file) still require a session like every other /api/admin/*
// endpoint; the check below is method-aware specifically for this reason.
const PUBLIC_GET_ADMIN_PATHS = new Set(["/api/admin/breaking-news"]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_ADMIN_PATHS.has(pathname)) {
    return NextResponse.next();
  }
  if (request.method === "GET" && PUBLIC_GET_ADMIN_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const isApiAdmin = pathname.startsWith("/api/admin/");
  const sessionToken = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;

  if (!verifySessionToken(sessionToken)) {
    if (isApiAdmin) {
      return NextResponse.json({ error: "Unauthorized: please log in." }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
