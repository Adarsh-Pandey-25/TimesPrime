/**
 * @jest-environment node
 *
 * The access matrix: every admin route and method, through its real handler and the real gate
 * (requirePermission + decide), for each of these callers:
 *   allowed       the least-privileged role the matrix gives the permission, in scope, aal2
 *   no session    401
 *   no grants     a signed-in staff member with no assignments: 403
 *   expired       the allowed assignment, expired: 403
 *   wrong scope   the allowed role in another language (or scoped, for a site-wide target): 403
 *   no MFA        the allowed assignment in an aal1 session: 403 mfa_required
 *   legacy        the shared password: allowed only for LEGACY_PERMISSIONS (Q3)
 *
 * This is the only gate on the app's path (service_role bypasses RLS), so the denied cases also
 * prove nothing was written. Grants come from the generated catalogue SQL, the matrix itself, so
 * the "allowed" role is allowed because the plan says so, not because a fixture says so.
 */

jest.mock("@sentry/nextjs", () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));
jest.mock("@/backend/auth/staffSession", () => ({ readSession: jest.fn() }));
jest.mock("@/backend/repositories/staff", () => {
  class StaffLookupError extends Error {}
  return { loadStaffRecord: jest.fn(), StaffLookupError };
});
jest.mock("@/backend/repositories/auditLog", () => {
  class AuditWriteError extends Error {}
  return { recordAudit: jest.fn(async () => "audit-id"), recordSystemAudit: jest.fn(), logAdminAction: jest.fn(), AuditWriteError };
});
jest.mock("@/backend/lib/supabase", () => ({ supabase: { from: jest.fn() }, isSupabaseConfigured: jest.fn(() => true) }));

import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { readSession } from "@/backend/auth/staffSession";
import { loadStaffRecord } from "@/backend/repositories/staff";
import { recordAudit } from "@/backend/repositories/auditLog";
import { ADMIN_ROUTE_RULES, type RouteRule } from "@/backend/auth/adminRoutePolicy";
import { LEGACY_PERMISSIONS, type Assignment, type Grant, type StaffRecord } from "@/backend/auth/decide";
import type { AccessCode, PermissionKey, RoleKey, ScopeLanguage } from "@/shared/config/permissions";
import * as articles from "./articles";
import * as bulk from "./articles-bulk";
import * as breakingNews from "./breaking-news";

const { supabase } = jest.requireMock("@/backend/lib/supabase") as { supabase: { from: jest.Mock } };

// ---- the catalogue, read from the generated SQL (the matrix) -------------------------------

const catalog = fs.readFileSync(path.join(process.cwd(), "database", "migrations", "2026-11-02-access-2-catalog.sql"), "utf8");
const tuples = (table: string) => {
  const block = catalog.match(new RegExp(`INSERT INTO public\\.${table} \\([^)]*\\) VALUES\\r?\\n([\\s\\S]*?)(?:\\r?\\nON CONFLICT|;\\r?\\n)`));
  if (!block) throw new Error(`no ${table} in the catalogue`);
  return block[1].split(/\r?\n/).map((l) => [...l.matchAll(/'((?:[^']|'')*)'|\b(true|false)\b/g)].map((m) => m[1] ?? m[2]));
};
const AAL2 = new Map(tuples("roles").map(([key, , , aal2]) => [key, aal2 === "true"]));
const GRANTS = new Map<string, Grant[]>();
for (const [role, permission, access, breakGlass] of tuples("role_permissions")) {
  GRANTS.set(role, [...(GRANTS.get(role) ?? []), { permission: permission as PermissionKey, access: access as AccessCode, breakGlassOnly: breakGlass === "true" }]);
}

// ---- callers -------------------------------------------------------------------------------

interface Grantee {
  role: RoleKey;
  language: ScopeLanguage | null;
  section?: string | null;
}

const FUTURE = "2099-01-01T00:00:00Z";
const PAST = "2020-01-01T00:00:00Z";

function staff(grantees: Grantee[], expiresAt = FUTURE): StaffRecord {
  const assignments: Assignment[] = grantees.map((g, i) => ({
    id: `as-${i}`,
    role: g.role,
    language: g.language,
    section: g.section ?? null,
    isBreakGlass: false,
    expiresAt,
    revokedAt: null,
    requiresAal2: AAL2.get(g.role) ?? true,
    grants: GRANTS.get(g.role) ?? [],
  }));
  return { userId: "u-1", displayName: "Asha", status: "active", mfaRequired: true, assignments };
}

type Caller = "allowed" | "no session" | "no grants" | "expired" | "wrong scope" | "no MFA" | "legacy";

function signIn(caller: Caller, c: Case) {
  const session = readSession as jest.Mock;
  const load = loadStaffRecord as jest.Mock;
  const staffSession = (aal: "aal1" | "aal2") => ({ kind: "staff", userId: "u-1", aal, sessionId: "s-1" });
  switch (caller) {
    case "no session":
      session.mockResolvedValue(null);
      return;
    case "legacy":
      session.mockResolvedValue({ kind: "legacy" });
      return;
    case "no grants":
      session.mockResolvedValue(staffSession("aal2"));
      load.mockResolvedValue(staff([]));
      return;
    case "allowed":
      session.mockResolvedValue(staffSession("aal2"));
      load.mockResolvedValue(staff([c.allowed]));
      return;
    case "expired":
      session.mockResolvedValue(staffSession("aal2"));
      load.mockResolvedValue(staff([c.allowed], PAST));
      return;
    case "no MFA":
      session.mockResolvedValue(staffSession("aal1"));
      load.mockResolvedValue(staff([c.allowed]));
      return;
    case "wrong scope":
      session.mockResolvedValue(staffSession("aal2"));
      load.mockResolvedValue(staff([c.wrongScope ?? c.allowed]));
      return;
  }
}

// ---- the database stand-in -----------------------------------------------------------------

const WRITES = new Set(["insert", "update", "delete", "upsert"]);
let tables: Record<string, { data: unknown; error: unknown; count?: number }>;
let calls: Array<[string, string, unknown[]]>;

function table(name: string): object {
  const b: object = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve(tables[name] ?? { data: null, error: null });
        return (...args: unknown[]) => {
          calls.push([name, prop, args]);
          return b;
        };
      },
    }
  );
  return b;
}
const wrote = () => calls.filter(([, method]) => WRITES.has(method));

// ---- the cases -----------------------------------------------------------------------------

type Method = "GET" | "POST" | "PATCH" | "DELETE";

interface Case {
  path: keyof typeof ADMIN_ROUTE_RULES;
  method: Method;
  handler: (request: NextRequest) => Promise<Response>;
  body?: unknown;
  query?: string;
  /** The least-privileged holder the matrix gives every permission the rule needs. */
  allowed: Grantee;
  /** The same role out of scope; omitted for a read in any scope (scope cannot refuse it). */
  wrongScope?: Grantee;
  /** Database rows the handler reads, by table. */
  data?: Record<string, { data: unknown; error: unknown; count?: number }>;
  /** True if the allowed call changes something (so a write must happen, and an audit pair). */
  changes: boolean;
}

const HINDI_SPORTS = { article_id: "a-1", title: "Old title", description: "d", image_url: null, source_name: "s", category: ["sports", "top"], language: "hindi", link: "https://example.com/a" };

const CASES: Case[] = [
  {
    path: "/api/admin/articles",
    method: "GET",
    handler: articles.GET,
    allowed: { role: "writer", language: "en" },
    data: { articles: { data: [], error: null, count: 0 } },
    changes: false,
  },
  {
    path: "/api/admin/articles",
    method: "PATCH",
    handler: articles.PATCH,
    body: { article_id: "a-1", title: "New title" },
    allowed: { role: "sub_editor", language: "hi", section: "sports" },
    wrongScope: { role: "sub_editor", language: "en", section: "sports" },
    data: { articles: { data: HINDI_SPORTS, error: null } },
    changes: true,
  },
  {
    path: "/api/admin/articles",
    method: "DELETE",
    handler: articles.DELETE,
    body: { article_id: "a-1" },
    allowed: { role: "desk_editor", language: "hi", section: "sports" },
    wrongScope: { role: "desk_editor", language: "hi", section: "politics" },
    data: { articles: { data: HINDI_SPORTS, error: null } },
    changes: true,
  },
  {
    path: "/api/admin/articles/bulk",
    method: "DELETE",
    handler: bulk.DELETE,
    body: { article_ids: ["a-1", "a-2"] },
    allowed: { role: "desk_editor", language: "hi", section: "sports" },
    wrongScope: { role: "desk_editor", language: "en" },
    data: { articles: { data: [HINDI_SPORTS, { ...HINDI_SPORTS, article_id: "a-2" }], error: null } },
    changes: true,
  },
  // The banner is site-wide, so only an unscoped grant covers it. A Desk Editor always has a
  // language (scope_required), so in practice it is the Managing Editor's until banners get a
  // language (Panel 3).
  {
    path: "/api/admin/breaking-news",
    method: "POST",
    handler: breakingNews.POST,
    body: { text: "Flood alert", expires_in_hours: 2 },
    allowed: { role: "managing_editor", language: null },
    wrongScope: { role: "desk_editor", language: "hi" },
    data: { breaking_news: { data: { id: "b-1", text: "Flood alert", is_active: true, expires_at: null, created_at: "2026-11-10T00:00:00Z" }, error: null } },
    changes: true,
  },
  {
    path: "/api/admin/breaking-news",
    method: "DELETE",
    handler: breakingNews.DELETE,
    body: { id: "b-1" },
    allowed: { role: "managing_editor", language: null },
    wrongScope: { role: "desk_editor", language: "hi" },
    data: { breaking_news: { data: null, error: null } },
    changes: true,
  },
];

function request(c: Case): NextRequest {
  const init: { method: string; headers: Record<string, string>; body?: string } = { method: c.method, headers: { "x-forwarded-for": "203.0.113.7" } };
  if (c.body !== undefined) {
    init.body = JSON.stringify(c.body);
    init.headers["content-type"] = "application/json";
  }
  return new NextRequest(`http://localhost:3000${c.path}${c.query ?? ""}`, init);
}

const rule = (c: Case): RouteRule => (ADMIN_ROUTE_RULES[c.path] as Partial<Record<Method, RouteRule>>)[c.method] as RouteRule;

beforeEach(() => {
  jest.clearAllMocks();
  calls = [];
  tables = {};
  supabase.from.mockImplementation((name: string) => table(name));
  (recordAudit as jest.Mock).mockResolvedValue("audit-id");
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("route-specific rules", () => {
  const caseFor = (method: Method, path: string) => CASES.find((c) => c.method === method && c.path === path) as Case;

  test("PATCH /api/admin/articles: moving an article to a section outside the editor's scope is refused (ADR 0003)", async () => {
    const c = caseFor("PATCH", "/api/admin/articles");
    tables = { articles: { data: HINDI_SPORTS, error: null } };
    signIn("allowed", c);
    const res = await c.handler(request({ ...c, body: { article_id: "a-1", category: ["politics", "sports"] } }));
    expect(res.status).toBe(403);
    expect(wrote()).toEqual([]);
  });

  test("PATCH /api/admin/articles: moving within the editor's scope is allowed", async () => {
    const c = caseFor("PATCH", "/api/admin/articles");
    tables = { articles: { data: HINDI_SPORTS, error: null } };
    signIn("allowed", c);
    const res = await c.handler(request({ ...c, body: { article_id: "a-1", category: ["sports"] } }));
    expect(res.status).toBe(200);
  });

  test("a change whose 'attempted' audit row cannot be written is refused with 503, and nothing is written (Q2)", async () => {
    const c = caseFor("DELETE", "/api/admin/articles");
    tables = { articles: { data: HINDI_SPORTS, error: null } };
    signIn("allowed", c);
    (recordAudit as jest.Mock).mockRejectedValueOnce(new Error("audit down"));
    const res = await c.handler(request(c));
    expect(res.status).toBe(503);
    expect(wrote()).toEqual([]);
  });

  test("DELETE /api/admin/articles/bulk: one article outside the editor's scope refuses the whole request", async () => {
    const c = caseFor("DELETE", "/api/admin/articles/bulk");
    tables = { articles: { data: [HINDI_SPORTS, { ...HINDI_SPORTS, article_id: "a-2", category: ["politics"] }], error: null } };
    signIn("allowed", c);
    expect((await c.handler(request(c))).status).toBe(403);
    expect(wrote()).toEqual([]);
  });

  test("DELETE /api/admin/articles/bulk: a Sub-editor (no article.bulk_action) is refused", async () => {
    const c = caseFor("DELETE", "/api/admin/articles/bulk");
    tables = { articles: { data: [HINDI_SPORTS], error: null } };
    signIn("allowed", { ...c, allowed: { role: "sub_editor", language: "hi" } });
    const res = await c.handler(request(c));
    expect(res.status).toBe(403);
    expect((await res.json()).required).toBe("article.bulk_action");
  });

  test("GET /api/admin/breaking-news stays public: no session, 200 (CR-08, D10)", async () => {
    tables = { breaking_news: { data: [], error: null } };
    (readSession as jest.Mock).mockResolvedValue(null);
    const res = await breakingNews.GET();
    expect(res.status).toBe(200);
    expect(readSession).not.toHaveBeenCalled();
  });

  test("DELETE /api/admin/articles: an unknown article is 404 (no scope to check it against)", async () => {
    const c = caseFor("DELETE", "/api/admin/articles");
    tables = { articles: { data: null, error: null } };
    signIn("allowed", c);
    expect((await c.handler(request(c))).status).toBe(404);
    expect(wrote()).toEqual([]);
  });
});

describe.each(CASES.map((c) => [`${c.method} ${c.path}`, c] as const))("%s", (_name, c) => {
  async function run(caller: Caller) {
    tables = { ...(c.data ?? {}) };
    signIn(caller, c);
    const res = await c.handler(request(c));
    return { status: res.status, json: await res.json().catch(() => null) };
  }

  test("allowed: the matrix's least-privileged holder, in scope, aal2", async () => {
    const r = await run("allowed");
    expect(r.status).toBeGreaterThanOrEqual(200);
    expect(r.status).toBeLessThan(300);
    if (c.changes) {
      expect(wrote().length).toBeGreaterThan(0);
      const outcomes = (recordAudit as jest.Mock).mock.calls.map(([row]) => row.outcome);
      expect(outcomes).toEqual(["attempted", "succeeded"]);
    }
  });

  test("no session: 401, nothing read or written", async () => {
    const r = await run("no session");
    expect(r.status).toBe(401);
    expect(calls).toEqual([]);
  });

  test.each(["no grants", "expired", "no MFA"] as const)("%s: 403, nothing written", async (caller) => {
    const r = await run(caller);
    expect(r.status).toBe(403);
    expect(r.json.code).toBe(caller === "no MFA" ? "mfa_required" : "forbidden");
    expect(wrote()).toEqual([]);
  });

  if (c.wrongScope) {
    test("wrong scope: 403, nothing written", async () => {
      const r = await run("wrong scope");
      expect(r.status).toBe(403);
      expect(r.json.code).toBe("forbidden");
      expect(wrote()).toEqual([]);
    });
  } else {
    test("wrong scope: not applicable, a read in any scope: another language's holder is allowed", async () => {
      const r = await run("wrong scope");
      expect(r.status).toBeLessThan(300);
    });
  }

  const legacyAllowed = rule(c).permissions.every((p) => LEGACY_PERMISSIONS.has(p));
  test(`legacy shared password: ${legacyAllowed ? "allowed" : "403"}`, async () => {
    const r = await run("legacy");
    if (legacyAllowed) {
      expect(r.status).toBeLessThan(300);
    } else {
      expect(r.status).toBe(403);
      expect(wrote()).toEqual([]);
    }
  });
});
