import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/adminSession";

// Deliberately not gated by src/proxy.ts's session check (see the
// PUBLIC_ADMIN_PATHS bypass there) — logout has to succeed even when the
// session cookie has already expired, so clicking it always lands back on
// the login page instead of erroring on an already-invalid session.
export async function POST() {
  const response = NextResponse.json({ status: "success" });
  response.cookies.set(ADMIN_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
