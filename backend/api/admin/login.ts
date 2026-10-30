import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, createSessionToken, sessionCookieOptions, verifyAdminPassword } from "@/backend/auth/adminSession";

export async function POST(request: NextRequest) {
  if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_SESSION_SECRET) {
    return NextResponse.json(
      { error: "Admin login is not configured. Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET in .env.local." },
      { status: 503 }
    );
  }

  let password: unknown;
  try {
    const body = await request.json();
    password = body?.password;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof password !== "string" || !verifyAdminPassword(password)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const token = createSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Admin login is not configured." }, { status: 503 });
  }

  const response = NextResponse.json({ status: "success" });
  response.cookies.set(ADMIN_SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
