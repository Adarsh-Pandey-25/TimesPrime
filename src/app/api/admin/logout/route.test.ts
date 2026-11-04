/**
 * @jest-environment node
 *
 * POST /api/admin/logout: public (D10), so it works with an expired session too. It clears the
 * shared-password cookie as before, and ends a staff session: this device only (scope "local"), as
 * Supabase advises, since signOut() defaults to every device.
 */

jest.mock("@sentry/nextjs", () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));
jest.mock("@/server/auth/supabaseServer", () => ({ createRouteClient: jest.fn() }));
jest.mock("@/server/auth/staffSession", () => ({ readSession: jest.fn() }));
jest.mock("@/server/repositories/auditLog", () => {
  class AuditWriteError extends Error {}
  return { recordAudit: jest.fn(async () => "audit-id"), AuditWriteError };
});

import { NextRequest } from "next/server";
import { POST } from "./route";
import { createRouteClient } from "@/server/auth/supabaseServer";
import { readSession } from "@/server/auth/staffSession";
import { recordAudit } from "@/server/repositories/auditLog";

const signOut = jest.fn(async () => ({ error: null }));

beforeEach(() => {
  jest.clearAllMocks();
  (createRouteClient as jest.Mock).mockResolvedValue({ auth: { signOut } });
});

const logout = () => POST(new NextRequest("http://localhost:3000/api/admin/logout", { method: "POST" }));

test("always clears the shared-password cookie and answers success, even with no session", async () => {
  (readSession as jest.Mock).mockResolvedValue(null);
  const res = await logout();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: "success" });
  expect(res.headers.get("set-cookie")).toMatch(/timesprime_admin_session=;.*Max-Age=0/i);
  expect(recordAudit).not.toHaveBeenCalled();
});

test("a staff session: signed out on this device only, and audited", async () => {
  (readSession as jest.Mock).mockResolvedValue({ kind: "staff", userId: "u-1", aal: "aal2", sessionId: "s-1" });
  expect((await logout()).status).toBe(200);
  expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.sign_out", outcome: "succeeded", actor_id: "u-1" }));
});

test("a failed staff sign-out still clears the cookie and answers success", async () => {
  (readSession as jest.Mock).mockResolvedValue({ kind: "staff", userId: "u-1", aal: "aal2", sessionId: "s-1" });
  signOut.mockRejectedValueOnce(new Error("network"));
  const res = await logout();
  expect(res.status).toBe(200);
  expect(res.headers.get("set-cookie")).toMatch(/timesprime_admin_session=/);
});
