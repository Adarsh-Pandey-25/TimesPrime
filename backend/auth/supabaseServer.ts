import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// The Supabase Auth client for a staff session in a route body (design §3). Supabase's server-side
// auth needs cookie storage, which @supabase/ssr provides ("Server-Side Rendering (SSR) with
// Supabase requires cookie-based session storage"). It is made per request and never at module
// scope, because it reads that request's cookies. It uses the public anon key: this client only
// verifies and refreshes the session. Data is read with the service-role client in
// backend/lib/supabase.ts, behind requirePermission.
//
// There is no browser Supabase client: sign-in, MFA and sign-out run in server routes. So no
// browser code needs to read the session cookie, and every cookie this client writes is HttpOnly,
// SameSite=Lax and, in production, Secure. Supabase says HttpOnly is "not necessary"; for an admin
// session it is cheap protection against a script reading the token.

/** The flags every staff session cookie gets, whatever @supabase/ssr proposes. */
export function hardenCookie(options: CookieOptions = {}): CookieOptions {
  return { ...options, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: options.path ?? "/" };
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
