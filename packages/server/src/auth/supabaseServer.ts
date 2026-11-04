import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

// The Supabase Auth client for a staff session in a route body (design §3). Supabase's server-side
// auth needs cookie storage, which @supabase/ssr provides ("Server-Side Rendering (SSR) with
// Supabase requires cookie-based session storage"). It is made per request and never at module
// scope, because it reads that request's cookies. It uses the public anon key: this client only
// verifies and refreshes the session. Data is read with the service-role client in
// src/server/lib/supabase.ts, behind requirePermission.
//
// There is no browser Supabase client: sign-in, MFA and sign-out run in server routes. So no
// browser code needs to read the session cookie, and every cookie this client writes is HttpOnly,
// SameSite=Lax and, in production, Secure. Supabase says HttpOnly is "not necessary"; for an admin
// session it is cheap protection against a script reading the token.

/** The flags every staff session cookie gets, whatever @supabase/ssr proposes. */
export function hardenCookie(options: CookieOptions = {}): CookieOptions {
  return { ...options, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: options.path ?? "/" };
}

/**
 * The proxy's client, per Supabase's Next.js pattern: getClaims() refreshes the token when it is
 * due, and setAll writes the new cookies both onto the request (so the route handler sees them and
 * does not refresh, and spend, the single-use refresh token a second time) and onto the response
 * (so the browser keeps them), with the cache headers @supabase/ssr supplies so no CDN caches a
 * session. `response()` is the response the proxy must return, or copy cookies from. Null when
 * Supabase is not configured.
 */
export function createProxyClient(request: NextRequest): { client: SupabaseClient; response: () => NextResponse } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  let response = NextResponse.next({ request });
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, hardenCookie(options));
        for (const [header, value] of Object.entries(headers ?? {})) response.headers.set(header, value);
      },
    },
  });
  return { client, response: () => response };
}

/** A per-request auth client for a route body, or null when Supabase is not configured. */
export async function createRouteClient(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        for (const { name, value, options } of list) {
          try {
            store.set(name, value, hardenCookie(options));
          } catch {
            // Only Server Components cannot set cookies; route handlers can. Nothing to do here.
          }
        }
      },
    },
  });
}
