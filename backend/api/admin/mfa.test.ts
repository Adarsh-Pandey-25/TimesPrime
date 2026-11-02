/**
 * @jest-environment node
 *
 * POST /api/admin/mfa: a staff member's second factor (design §5). Session-only: an aal1 session
 * must reach it to become aal2. { action: "enroll" } starts a TOTP enrolment; { action: "verify",
 * code } checks one code, which upgrades the session. Supabase's MFA API is stubbed here.
 */

jest.mock("@sentry/nextjs", () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));
jest.mock("@/backend/auth/staffSession", () => ({ readSession: jest.fn() }));
jest.mock("@/backend/repositories/staff", () => {
  class StaffLookupError extends Error {}
  return { loadStaffRecord: jest.fn(), StaffLookupError };
});
jest.mock("@/backend/repositories/auditLog", () => {
  class AuditWriteError extends Error {}
  return { recordAudit: jest.fn(async () => "audit-id"), AuditWriteError };
});
jest.mock("@/backend/auth/supabaseServer", () => ({ createRouteClient: jest.fn() }));

import { NextRequest } from "next/server";
import { POST } from "./mfa";
import { readSession } from "@/backend/auth/staffSession";
import { loadStaffRecord } from "@/backend/repositories/staff";
import { recordAudit } from "@/backend/repositories/auditLog";
import { createRouteClient } from "@/backend/auth/supabaseServer";

const mfa = { listFactors: jest.fn(), enroll: jest.fn(), unenroll: jest.fn(), challengeAndVerify: jest.fn() };
let user = 0;

beforeEach(() => {
  jest.clearAllMocks();
  user += 1; // a fresh user per test, so the per-user verify limit does not carry over
  (readSession as jest.Mock).mockResolvedValue({ kind: "staff", userId: `u-${user}`, aal: "aal1", sessionId: "s-1" });
  (loadStaffRecord as jest.Mock).mockImplementation(async (id: string) => ({ userId: id, displayName: "Asha", status: "active", mfaRequired: true, assignments: [] }));
  (createRouteClient as jest.Mock).mockResolvedValue({ auth: { mfa } });
  mfa.listFactors.mockResolvedValue({ data: { all: [] }, error: null });
  mfa.enroll.mockResolvedValue({ data: { id: "f-new", type: "totp", totp: { qr_code: "data:image/svg+xml;utf-8,<svg/>", secret: "JBSWY3DP", uri: "otpauth://..." } }, error: null });
  mfa.unenroll.mockResolvedValue({ data: {}, error: null });
  mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost:3000/api/admin/mfa", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.4" }, body: JSON.stringify(body) }));
const audited = () => (recordAudit as jest.Mock).mock.calls.map(([row]) => `${row.action}:${row.outcome}`);

test("no session: 401", async () => {
  (readSession as jest.Mock).mockResolvedValue(null);
  expect((await post({ action: "enroll" })).status).toBe(401);
});

test("the shared password has no second factor: 400", async () => {
  (readSession as jest.Mock).mockResolvedValue({ kind: "legacy" });
  expect((await post({ action: "enroll" })).status).toBe(400);
});

test("a signed-in user who is not staff: 403", async () => {
  (loadStaffRecord as jest.Mock).mockResolvedValue(null);
  expect((await post({ action: "enroll" })).status).toBe(403);
});

describe("enroll", () => {
  test("starts a TOTP enrolment and returns the QR code and the secret; audited", async () => {
    const res = await post({ action: "enroll" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ factorId: "f-new", qrCode: "data:image/svg+xml;utf-8,<svg/>", secret: "JBSWY3DP" });
    expect(mfa.enroll).toHaveBeenCalledWith(expect.objectContaining({ factorType: "totp" }));
    expect(audited()).toEqual(["auth.mfa_enroll_started:succeeded"]);
  });

  test("replaces an unconfirmed enrolment", async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [{ id: "f-old", factor_type: "totp", status: "unverified" }] }, error: null });
    await post({ action: "enroll" });
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: "f-old" });
  });

  test("refused once a factor is verified: resetting is for an admin (409)", async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [{ id: "f-1", factor_type: "totp", status: "verified" }] }, error: null });
    expect((await post({ action: "enroll" })).status).toBe(409);
    expect(mfa.enroll).not.toHaveBeenCalled();
  });
});

describe("verify", () => {
  test("confirms a new enrolment with its code: aal2, audited as enrolled", async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [{ id: "f-new", factor_type: "totp", status: "unverified" }] }, error: null });
    const res = await post({ action: "verify", factorId: "f-new", code: "123456" });
    expect(res.status).toBe(200);
    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: "f-new", code: "123456" });
    expect(audited()).toEqual(["auth.mfa_enrolled:succeeded"]);
  });

  test("at each sign-in, verifies against the user's verified factor, whatever the body says", async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [{ id: "f-1", factor_type: "totp", status: "verified" }] }, error: null });
    await post({ action: "verify", factorId: "someone-elses", code: "123456" });
    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: "f-1", code: "123456" });
    expect(audited()).toEqual(["auth.mfa_verified:succeeded"]);
  });

  test("a factor that is not this user's is refused (400)", async () => {
    expect((await post({ action: "verify", factorId: "f-unknown", code: "123456" })).status).toBe(400);
    expect(mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  test("a wrong code: 401, audited as failed", async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [{ id: "f-1", factor_type: "totp", status: "verified" }] }, error: null });
    mfa.challengeAndVerify.mockResolvedValue({ data: null, error: { message: "Invalid TOTP code entered" } });
    expect((await post({ action: "verify", code: "000000" })).status).toBe(401);
    expect(audited()).toEqual(["auth.mfa_failed:failed"]);
  });

  test.each([["12345"], ["abcdef"], [""], [123456]])("a malformed code (%j): 400, nothing sent", async (code) => {
    expect((await post({ action: "verify", code })).status).toBe(400);
    expect(mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  test("five tries per user in 15 minutes; the sixth is 429", async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [{ id: "f-1", factor_type: "totp", status: "verified" }] }, error: null });
    mfa.challengeAndVerify.mockResolvedValue({ data: null, error: { message: "Invalid TOTP code entered" } });
    for (let i = 0; i < 5; i++) expect((await post({ action: "verify", code: "000000" })).status).toBe(401);
    const res = await post({ action: "verify", code: "000000" });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).not.toBeNull();
  });
});

test("an unknown action: 400", async () => {
  expect((await post({ action: "disable" })).status).toBe(400);
});
