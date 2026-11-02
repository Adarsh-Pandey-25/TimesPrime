/**
 * @jest-environment node
 *
 * requirePermission and requireTarget: the only gate on the app's request path (design,
 * "Approval"). The app talks to Supabase as service_role, which bypasses RLS, so nothing behind
 * this gate checks again. Here the session and the staff record are stubbed; decide() is real.
 */

jest.mock("@sentry/nextjs", () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));
jest.mock("./staffSession", () => ({ readSession: jest.fn() }));
jest.mock("@/backend/repositories/staff", () => {
  class StaffLookupError extends Error {}
  return { loadStaffRecord: jest.fn(), StaffLookupError };
});
jest.mock("@/backend/repositories/auditLog", () => {
  class AuditWriteError extends Error {}
  return { recordAudit: jest.fn(async () => "audit-row"), AuditWriteError };
});

import { NextRequest } from "next/server";
import { requirePermission, requireTarget, beginAudit, finishAudit, type GateResult } from "./requirePermission";
import type { Assignment, StaffRecord } from "./decide";
import { readSession } from "./staffSession";
import { loadStaffRecord, StaffLookupError } from "@/backend/repositories/staff";
import { recordAudit } from "@/backend/repositories/auditLog";

const session = readSession as jest.Mock;
const load = loadStaffRecord as jest.Mock;
const audit = recordAudit as jest.Mock;

const EDIT = { permissions: ["article.edit"], mode: "act", target: "article" } as const;
const STATS = { permissions: ["stats.view"], mode: "read", target: "none" } as const;
const AUDIT_READ = { permissions: ["audit.read"], mode: "read", target: "none" } as const;
const HI_SPORTS = { language: "hi" as const, section: "sports" };

function desk(over: Partial<Assignment> = {}): Assignment {
  return {
    id: "as-1",
    role: "desk_editor",
    language: "hi",
    section: null,
    isBreakGlass: false,
    expiresAt: "2099-01-01T00:00:00Z",
    revokedAt: null,
    requiresAal2: true,
    grants: [
      { permission: "article.edit", access: "S", breakGlassOnly: false },
      { permission: "stats.view", access: "S", breakGlassOnly: false },
    ],
    ...over,
  };
}
const record = (assignments: Assignment[]): StaffRecord => ({ userId: "u-1", displayName: "Asha", status: "active", mfaRequired: true, assignments });

const request = () =>
  new NextRequest("http://localhost:3000/api/admin/articles", {
    headers: { "x-forwarded-for": "203.0.113.9", "user-agent": "jest", "x-vercel-id": "bom1::abc" },
  });

async function body(result: GateResult) {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("unreachable");
  return { status: result.response.status, json: await result.response.json() };
}

beforeEach(() => {
  jest.clearAllMocks();
  session.mockResolvedValue({ kind: "staff", userId: "u-1", aal: "aal2", sessionId: "s-1" });
  load.mockResolvedValue(record([desk()]));
  audit.mockResolvedValue("audit-row");
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("who is asking", () => {
  test("no session: 401, and the staff record is never read", async () => {
    session.mockResolvedValue(null);
    expect(await body(await requirePermission(request(), EDIT, HI_SPORTS))).toEqual({ status: 401, json: { error: "Unauthorized: please log in." } });
    expect(load).not.toHaveBeenCalled();
  });

  test("the staff record cannot be read: 503, nothing changed", async () => {
    load.mockRejectedValue(new StaffLookupError("down"));
    const r = await body(await requirePermission(request(), EDIT, HI_SPORTS));
    expect(r.status).toBe(503);
    expect(r.json.error).toMatch(/nothing was changed/i);
  });

  test("a signed-in user who is not staff: 403 not_staff", async () => {
    load.mockResolvedValue(null);
    expect((await body(await requirePermission(request(), EDIT, HI_SPORTS))).json.code).toBe("not_staff");
  });
});

describe("allowed", () => {
  test("returns the actor: who, aal, live roles and the request's metadata", async () => {
    const r = await requirePermission(request(), EDIT, HI_SPORTS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.actor).toMatchObject({
      kind: "staff",
      userId: "u-1",
      label: "Asha",
      aal: "aal2",
      roles: [{ role: "desk_editor", language: "hi", section: null }],
      meta: { ip: "203.0.113.9", userAgent: "jest", requestId: "bom1::abc" },
    });
    expect(audit).not.toHaveBeenCalled();
  });

  test("a read with no target", async () => {
    expect((await requirePermission(request(), STATS)).ok).toBe(true);
  });
});

describe("denied, and the denial is audited", () => {
  test("403 with the error, the code and the permission that was missing", async () => {
    const r = await body(await requirePermission(request(), AUDIT_READ));
    expect(r).toEqual({ status: 403, json: { error: "You don't have permission for this action.", code: "forbidden", required: "audit.read" } });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ actor_type: "staff", actor_id: "u-1", action: "audit.read", outcome: "denied", reason: "forbidden", ip: "203.0.113.9" })
    );
  });

  test("wrong scope: 403, audited with the target's scope", async () => {
    const r = await body(await requirePermission(request(), EDIT, { language: "en", section: "sports" }));
    expect(r.json.code).toBe("forbidden");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ language: "en", section: "sports", outcome: "denied" }));
  });

  test("expired: 403", async () => {
    load.mockResolvedValue(record([desk({ expiresAt: "2020-01-01T00:00:00Z" })]));
    expect((await body(await requirePermission(request(), EDIT, HI_SPORTS))).status).toBe(403);
  });

  test("missing MFA: 403 mfa_required with a message that says what to do", async () => {
    session.mockResolvedValue({ kind: "staff", userId: "u-1", aal: "aal1", sessionId: "s-1" });
    const r = await body(await requirePermission(request(), EDIT, HI_SPORTS));
    expect(r.json.code).toBe("mfa_required");
    expect(r.json.error).toMatch(/second factor/i);
  });

  test("a rule with two permissions needs both", async () => {
    const both = { permissions: ["article.edit", "article.unpublish"], mode: "act", target: "article" } as const;
    const r = await body(await requirePermission(request(), both, HI_SPORTS));
    expect(r.json.required).toBe("article.unpublish");
  });

  test("if the denial cannot be audited, it is still a denial", async () => {
    audit.mockRejectedValue(new Error("audit down"));
    expect((await body(await requirePermission(request(), AUDIT_READ))).status).toBe(403);
  });
});

describe("revocation applies to the next request (design, 'Approval')", () => {
  test("revoked between two requests: the second is refused; the record is read again, not cached", async () => {
    expect((await requirePermission(request(), EDIT, HI_SPORTS)).ok).toBe(true);
    load.mockResolvedValue(record([desk({ revokedAt: new Date().toISOString() })]));
    expect((await body(await requirePermission(request(), EDIT, HI_SPORTS))).status).toBe(403);
    expect(load).toHaveBeenCalledTimes(2);
  });

  test("suspended between two requests: refused", async () => {
    expect((await requirePermission(request(), EDIT, HI_SPORTS)).ok).toBe(true);
    load.mockResolvedValue({ ...record([desk()]), status: "suspended" });
    expect((await body(await requirePermission(request(), EDIT, HI_SPORTS))).json.code).toBe("suspended");
  });
});

describe("the legacy shared password (Q3)", () => {
  beforeEach(() => session.mockResolvedValue({ kind: "legacy" }));

  test("may do today's editorial work, in any scope, without a staff record", async () => {
    const r = await requirePermission(request(), EDIT, { language: "en", section: "politics" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.actor).toMatchObject({ kind: "legacy", userId: null, label: "legacy:shared-password", aal: null, roles: [] });
    expect(load).not.toHaveBeenCalled();
  });

  test.each([["audit.read"], ["health.view"], ["user.manage"], ["role.assign"], ["settings.manage"], ["content.purge"]] as const)(
    "never %s: 403, audited as legacy",
    async (permission) => {
      const r = await body(await requirePermission(request(), { permissions: [permission], mode: "act", target: "site" }, { language: null, section: null }));
      expect(r.status).toBe(403);
      expect(audit).toHaveBeenCalledWith(expect.objectContaining({ actor_type: "legacy", actor_id: null, actor_label: "legacy:shared-password", outcome: "denied" }));
    }
  );
});

describe("requireTarget: the second check, once the route has loaded its target", () => {
  test("the pre-check passes in some scope; the article's own scope then decides", async () => {
    const pre = await requirePermission(request(), EDIT, "any");
    expect(pre.ok).toBe(true);
    if (!pre.ok) return;
    expect((await requireTarget(pre.actor, EDIT, HI_SPORTS)).ok).toBe(true);
    const out = await requireTarget(pre.actor, EDIT, { language: "en", section: null });
    expect((await body(out)).json.code).toBe("forbidden");
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("beginAudit / finishAudit (Q2: attempted, then outcome; fail closed)", () => {
  async function actor() {
    const r = await requirePermission(request(), EDIT, HI_SPORTS);
    if (!r.ok) throw new Error("expected allowed");
    return r.actor;
  }

  test("begin writes an 'attempted' row and returns its id; finish links the outcome to it", async () => {
    const a = await actor();
    audit.mockResolvedValueOnce("attempt-1");
    const id = await beginAudit(a, { action: "article.edit", entityType: "article", entityId: "a-1", target: HI_SPORTS, before: { title: "Old" } });
    expect(id).toBe("attempt-1");
    expect(audit).toHaveBeenLastCalledWith(
      expect.objectContaining({ outcome: "attempted", action: "article.edit", entity_id: "a-1", language: "hi", section: "sports", before: { title: "Old" }, actor_roles: [{ role: "desk_editor", language: "hi", section: null }] })
    );
    await finishAudit(a, "attempt-1", "succeeded", { action: "article.edit", entityType: "article", entityId: "a-1", after: { title: "New" } });
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: "succeeded", attempt_id: "attempt-1", after: { title: "New" } }));
  });

  test("begin returns null when the row cannot be written, so the caller refuses the change", async () => {
    const a = await actor();
    audit.mockRejectedValueOnce(new Error("audit down"));
    expect(await beginAudit(a, { action: "article.edit", entityType: "article", entityId: "a-1" })).toBeNull();
  });

  test("finish never throws: an attempt with no outcome stays visible instead", async () => {
    const a = await actor();
    audit.mockRejectedValueOnce(new Error("audit down"));
    await expect(finishAudit(a, "attempt-1", "failed", { action: "article.edit", entityType: "article", entityId: "a-1" })).resolves.toBeUndefined();
  });
});
