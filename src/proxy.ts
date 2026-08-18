import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next.js 16 renamed Middleware to Proxy — this file replaces what would
// previously have been src/middleware.ts. Same runtime, new file name.

const ADMIN_COOKIE = "timesprime_admin_token";

export function proxy(request: NextRequest) {
  const adminSecret = process.env.ADMIN_SECRET_TOKEN;
  const { pathname, searchParams } = request.nextUrl;
  const isApiAdmin = pathname.startsWith("/api/admin/");

  // Fail closed: if no token is configured, admin surface stays locked rather
  // than silently falling back to "open to everyone".
  if (!adminSecret) {
    const message = "Admin access is not configured. Set ADMIN_SECRET_TOKEN in .env.local.";
    return isApiAdmin
      ? NextResponse.json({ error: message }, { status: 503 })
      : new NextResponse(message, { status: 503 });
  }

  const cookieToken = request.cookies.get(ADMIN_COOKIE)?.value;
  const queryToken = searchParams.get("token");
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];

  const providedToken = bearerToken || cookieToken || queryToken;

  if (providedToken !== adminSecret) {
    if (isApiAdmin) {
      return NextResponse.json(
        { error: "Unauthorized: valid admin token required." },
        { status: 401 }
      );
    }
    return new NextResponse(
      "Unauthorized. Visit this page as /admin?token=YOUR_ADMIN_SECRET_TOKEN",
      { status: 401 }
    );
  }

  const response = NextResponse.next();

  // First visit with a valid ?token= sets an httpOnly cookie so the admin
  // page's own client-side fetch() calls to /api/admin/* authenticate
  // automatically afterwards, without embedding the secret in page JS.
  if (queryToken === adminSecret && cookieToken !== adminSecret) {
    response.cookies.set(ADMIN_COOKIE, adminSecret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 4, // 4 hours
    });
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
