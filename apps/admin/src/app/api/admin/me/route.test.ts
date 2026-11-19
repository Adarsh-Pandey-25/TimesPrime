/**
 * @jest-environment node
 *
 * GET /api/admin/me: a session-only route (no permission needed). It tells the admin UI who is
 * signed in and what they hold now, so it can hide what they lack, and whether they still have an
 * MFA step to do. UX only: every route checks again on the server.
 */

jest.mock("@sentry/nextjs", () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));
jest.mock("@timesprime/server/auth/staffSession", () => ({ readSession: jest.fn() }));
jest.mock("@timesprime/server/repositories/staff", () => {
  class StaffLookupError extends Error {}
  return { loadStaffRecord: jest.fn(), StaffLookupError };
});
jest.mock("@timesprime/server/repositories/auditLog", () => {
  class AuditWriteError extends Error {}
  return { recordAudit: jest.fn(async () => "audit-id"), AuditWriteError };
});
jest.mock("@timesprime/server/auth/supabaseServer", () => ({ createRouteClient: jest.fn() }));

import { NextRequest } from "next/server";
import { GET } from "./route";
import { readSession } from "@timesprime/server/auth/staffSession";
import { loadStaffRecord } from "@timesprime/server/repositories/staff";
import { createRouteClient } from "@timesprime/server/auth/supabaseServer";
import type { Assignment } from "@timesprime/server/auth/decide";

const listFactors = jest.fn();
const desk: Assignment = {
  id: "as-1",
  role: "desk_editor",
  language: "hi",
  section: "sports",
  isBreakGlass: false,
  expiresAt: "2099-01-01T00:00:00Z",
  revokedAt: null,
  requiresAal2: true,
  grants: [
    { permission: "article.edit", access: "S", breakGlassOnly: false },
    { permission: "sync.view", access: "R", breakGlassOnly: false },
    { permission: "article.restore", access: "A", breakGlassOnly: false },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  (createRouteClient as jest.Mock).mockResolvedValue({ auth: { mfa: { listFactors } } });
  listFactors.mockResolvedValue({ data: { all: [{ id: "f-1", factor_type: "totp", status: "verified" }] }, error: null });
  (loadStaffRecord as jest.Mock).mockResolvedValue({ userId: "u-1", displayName: "Asha", status: "active", mfaRequired: true, assignments: [desk] });
});

const get = () => GET(new NextRequest("http://localhost:3000/api/admin/me"));

test("no session: 401", async () => {
  (readSession as jest.Mock).mockResolvedValue(null);
  expect((await get()).status).toBe(401);
});

test("staff, aal2: name, live roles, and each permission held now as act, read or ask", async () => {
  (readSession as jest.Mock).mockResolvedValue({ kind: "staff", userId: "u-1", aal: "aal2", sessionId: "s-1" });
  const res = await get();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    kind: "staff",
    displayName: "Asha",
    aal: "aal2",
    roles: [{ role: "desk_editor", language: "hi", section: "sports", expiresAt: "2099-01-01T00:00:00Z" }],
    // R is read-only; A (restore) is "ask": they may ask, and a second person decides.
    permissions: { "article.edit": "act", "sync.view": "read", "article.restore": "ask" },
    mfa: { required: true, enrolled: true },
  });
});

test("staff, aal1: nothing is held yet, and the MFA step is reported", async () => {
  (readSession as jest.Mock).mockResolvedValue({ kind: "staff", userId: "u-1", aal: "aal1", sessionId: "s-1" });
  listFactors.mockResolvedValue({ data: { all: [] }, error: null });
  const body = await (await get()).json();
  expect(body.permissions).toEqual({});
  expect(body.mfa).toEqual({ required: true, enrolled: false });
});

test("a signed-in user who is not staff: 403 not_staff", async () => {
  (readSession as jest.Mock).mockResolvedValue({ kind: "staff", userId: "u-9", aal: "aal2", sessionId: "s-9" });
  (loadStaffRecord as jest.Mock).mockResolvedValue(null);
  const res = await get();
  expect(res.status).toBe(403);
  expect((await res.json()).code).toBe("not_staff");
});

test("a suspended staff member: 403 suspended", async () => {
  (readSession as jest.Mock).mockResolvedValue({ kind: "staff", userId: "u-1", aal: "aal2", sessionId: "s-1" });
  (loadStaffRecord as jest.Mock).mockResolvedValue({ userId: "u-1", displayName: "Asha", status: "suspended", mfaRequired: true, assignments: [desk] });
  const res = await get();
  expect(res.status).toBe(403);
  expect((await res.json()).code).toBe("suspended");
});
