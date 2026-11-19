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
 *   old cookie    the retired shared password's cookie (Panel 1, M4): no session, 401
 *
 * This is the only gate on the app's path (service_role bypasses RLS), so the denied cases also
 * prove nothing was written. Grants come from the generated catalogue SQL, the matrix itself, so
 * the "allowed" role is allowed because the plan says so, not because a fixture says so.
 */

jest.mock("@sentry/nextjs", () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));
jest.mock("@timesprime/server/auth/staffSession", () => ({ readSession: jest.fn() }));
jest.mock("@timesprime/server/repositories/staff", () => {
  class StaffLookupError extends Error {}
  return { loadStaffRecord: jest.fn(), StaffLookupError };
});
jest.mock("@timesprime/server/repositories/auditLog", () => {
  class AuditWriteError extends Error {}
  return { recordAudit: jest.fn(async () => "audit-id"), recordSystemAudit: jest.fn(), AuditWriteError };
});
// The media library keeps files through the storage; here a stand-in records what was put, and
// holds one original (a JPEG's first bytes) for the back office to show.
jest.mock("@timesprime/server/lib/mediaStorage", () => {
  const put = jest.fn(async () => undefined);
  const get = jest.fn(async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0]));
  return { mediaStorage: () => ({ kind: "local", put, get }), mediaUrl: (key: string) => `/media/${key}`, put, get };
});
// Supabase Auth's admin API (Panel 1): each account's email, second factor and last sign-in.
jest.mock("@timesprime/server/lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
    auth: {
      admin: {
        listUsers: jest.fn(async () => ({ data: { users: [] }, error: null })),
        getUserById: jest.fn(async (id: string) => ({ data: { user: { id, email: "person@example.com", factors: [] } }, error: null })),
        // M2: adding a person, a one-time link, a lost factor.
        createUser: jest.fn(async () => ({ data: { user: { id: "0a1b2c3d-0000-4000-8000-0000000000c1" } }, error: null })),
        generateLink: jest.fn(async () => ({ data: { properties: { hashed_token: "TOKEN_abcdef0123456789" } }, error: null })),
        mfa: {
          listFactors: jest.fn(async () => ({ data: { factors: [{ id: "f-1" }, { id: "f-2" }] }, error: null })),
          deleteFactor: jest.fn(async () => ({ data: {}, error: null })),
        },
      },
    },
  },
  isSupabaseConfigured: jest.fn(() => true),
}));
jest.mock("@timesprime/server/services/health/health", () => ({
  getHealth: jest.fn(async () => ({ status: "ok", checkedAt: "2026-11-10T00:00:00Z", dependencies: {} })),
}));
// The news service writes through its own client; here its writes are recorded like the tables'.
jest.mock("@timesprime/server/services/news", () => ({
  saveArticlesToDB: jest.fn(async () => {
    calls.push(["articles", "upsert", []]);
    return [{}];
  }),
  getDBStats: jest.fn(async () => ({ configured: true, totalStoredArticles: 0 })),
  purgeOldArticles: jest.fn(async () => {
    calls.push(["articles", "delete", []]);
    return 0;
  }),
}));

import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { readSession } from "@timesprime/server/auth/staffSession";
import { loadStaffRecord } from "@timesprime/server/repositories/staff";
import { recordAudit } from "@timesprime/server/repositories/auditLog";
import { ADMIN_ROUTE_RULES, PUBLIC_ADMIN_ROUTES, SESSION_ONLY_ADMIN_ROUTES, type RouteRule } from "@timesprime/server/auth/adminRoutePolicy";
import type { Assignment, Grant, StaffRecord } from "@timesprime/server/auth/decide";
import type { AccessCode, PermissionKey, RoleKey, ScopeLanguage } from "@timesprime/shared/config/permissions";
import * as articles from "./articles/route";
import * as bulk from "./articles/bulk/route";
import * as breakingNews from "./breaking-news/route";
import * as publish from "./publish-article/route";
import * as seed from "./seed-supabase/route";
import * as dbStats from "./db-stats/route";
import * as stats from "./stats/route";
import * as health from "./health/route";
import * as logs from "./logs/route";
import * as deskStories from "./desk/stories/route";
import * as deskStory from "./desk/stories/[id]/route";
import * as deskRevisions from "./desk/stories/[id]/revisions/route";
import * as deskRevision from "./desk/stories/[id]/revisions/[revisionId]/route";
import * as deskLock from "./desk/stories/[id]/lock/route";
import * as deskAssign from "./desk/stories/[id]/assign/route";
import * as deskSubmit from "./desk/stories/[id]/submit/route";
import * as deskSendBack from "./desk/stories/[id]/send-back/route";
import * as deskApprove from "./desk/stories/[id]/approve/route";
import * as deskSchedule from "./desk/stories/[id]/schedule/route";
import * as deskUnschedule from "./desk/stories/[id]/unschedule/route";
import * as deskPublish from "./desk/stories/[id]/publish/route";
import * as deskPublishDirect from "./desk/stories/[id]/publish-direct/route";
import * as deskUnpublish from "./desk/stories/[id]/unpublish/route";
import * as deskRetract from "./desk/stories/[id]/retract/route";
import * as deskKill from "./desk/stories/[id]/kill/route";
import * as deskDetails from "./desk/stories/[id]/details/route";
import * as deskRestore from "./desk/stories/[id]/restore/route";
import * as deskDecide from "./desk/pending/[actionId]/decide/route";
import * as deskCorrect from "./desk/stories/[id]/correct/route";
import * as deskAlerts from "./desk/alerts/route";
import * as deskAuthors from "./desk/authors/route";
import * as deskAuthor from "./desk/authors/[id]/route";
import * as deskCredits from "./desk/stories/[id]/credits/route";
import * as deskMedia from "./desk/media/route";
import * as deskMediaOne from "./desk/media/[id]/route";
import * as deskMediaOriginal from "./desk/media/[id]/original/route";
import * as people from "./people/route";
import * as person from "./people/[id]/route";
import * as personSuspend from "./people/[id]/suspend/route";
import * as personReactivate from "./people/[id]/reactivate/route";
import * as personSignOut from "./people/[id]/sign-out/route";
import * as personRoles from "./people/[id]/roles/route";
import * as personRenew from "./people/[id]/roles/[assignmentId]/renew/route";
import * as personRevoke from "./people/[id]/roles/[assignmentId]/revoke/route";
import * as accessRequests from "./people/requests/route";
import * as requestApprove from "./people/requests/[requestId]/approve/route";
import * as requestDecline from "./people/requests/[requestId]/decline/route";
import * as requestCancel from "./people/requests/[requestId]/cancel/route";
import * as personPasswordLink from "./people/[id]/password-link/route";
import * as personMfaReset from "./people/[id]/mfa-reset/route";
import * as peopleAlerts from "./people/alerts/route";
import * as breakGlass from "./people/break-glass/route";
import * as accessReview from "./people/review/route";

const { supabase } = jest.requireMock("@timesprime/server/lib/supabase") as {
  supabase: {
    from: jest.Mock;
    rpc: jest.Mock;
    auth: { admin: { listUsers: jest.Mock; getUserById: jest.Mock; createUser: jest.Mock; generateLink: jest.Mock; mfa: { listFactors: jest.Mock; deleteFactor: jest.Mock } } };
  };
};
const authAdmin = supabase.auth.admin;

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

type Caller = "allowed" | "no session" | "no grants" | "expired" | "wrong scope" | "no MFA";

function signIn(caller: Caller, c: Case) {
  const session = readSession as jest.Mock;
  const load = loadStaffRecord as jest.Mock;
  const staffSession = (aal: "aal1" | "aal2") => ({ kind: "staff", userId: "u-1", aal, sessionId: "s-1" });
  switch (caller) {
    case "no session":
      session.mockResolvedValue(null);
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

// A database function (rpc) counts as a write: the Desk changes stories only through its desk_* functions.
const WRITES = new Set(["insert", "update", "delete", "upsert", "rpc"]);
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
  /** A form body (an upload) instead of JSON. */
  form?: () => FormData;
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
  // The banner (Panel 3, M1): an item is decided in its language, every section, so a Desk Editor
  // (S) runs their own desk's banner. An item for both languages is site-wide: below, in "the
  // banner's language".
  // The manager's list: a read in any scope, so a scoped Desk Editor holds it.
  {
    path: "/api/admin/breaking-news",
    method: "GET",
    handler: breakingNews.GET,
    allowed: { role: "desk_editor", language: "hi" },
    data: { breaking_news: { data: [], error: null } },
    changes: false,
  },
  {
    path: "/api/admin/breaking-news",
    method: "POST",
    handler: breakingNews.POST,
    body: { text: "Flood alert", expires_in_hours: 2, language: "hi" },
    allowed: { role: "desk_editor", language: "hi" },
    wrongScope: { role: "desk_editor", language: "en" },
    data: { breaking_news: { data: { id: "b-1", text: "Flood alert", is_active: true, expires_at: null, created_at: "2026-11-10T00:00:00Z", language: "hi" }, error: null } },
    changes: true,
  },
  {
    path: "/api/admin/breaking-news",
    method: "DELETE",
    handler: breakingNews.DELETE,
    body: { id: "b-1" },
    allowed: { role: "desk_editor", language: "hi" },
    wrongScope: { role: "desk_editor", language: "en" },
    data: { breaking_news: { data: { id: "b-1", text: "Flood alert", language: "hi" }, error: null } },
    changes: true,
  },
  // The editorial publish route stores language "english" (BL-004 era code), so its target is
  // en + the chosen category.
  {
    path: "/api/admin/publish-article",
    method: "POST",
    handler: publish.POST,
    body: { title: "Local results", link: "https://example.com/r", category: "sports", description: "d" },
    allowed: { role: "desk_editor", language: "en", section: "sports" },
    wrongScope: { role: "desk_editor", language: "hi", section: "sports" },
    data: { articles: { data: { article_id: "admin-local-results-1" }, error: null } },
    changes: true,
  },
  // A full sync is site-wide: an Ingestion Ops grant limited to one language does not cover it.
  {
    path: "/api/admin/seed-supabase",
    method: "POST",
    handler: seed.POST,
    allowed: { role: "ingestion_ops", language: null },
    wrongScope: { role: "ingestion_ops", language: "hi" },
    changes: true,
  },
  {
    path: "/api/admin/db-stats",
    method: "GET",
    handler: dbStats.GET,
    allowed: { role: "writer", language: "en" },
    changes: false,
  },
  {
    path: "/api/admin/stats",
    method: "GET",
    handler: stats.GET,
    allowed: { role: "writer", language: "en" },
    data: { articles: { data: [], error: null, count: 0 } },
    changes: false,
  },
  // Ingestion Ops holds health.view as R.
  {
    path: "/api/admin/health",
    method: "GET",
    handler: health.GET,
    allowed: { role: "ingestion_ops", language: null },
    changes: false,
  },
  // The activity log: audit.read.
  {
    path: "/api/admin/logs",
    method: "GET",
    handler: logs.GET,
    allowed: { role: "security_lead", language: null },
    data: { audit_log: { data: [], error: null, count: 0 } },
    changes: false,
  },
];

// ---- Panel 2, the Desk: one story in the Hindi sports desk, by someone else unless a case says so ----
const STORY_ROW = {
  id: "s-1", public_id: 1, language: "hi", section: "sports", format: "news", workflow_state: "draft",
  translation_group_id: null, slug: "match-report", created_by: "u-9", assigned_to: null, last_edited_by: "u-9",
  approved_by: null, approved_revision_id: null, published_by: null, current_revision_id: "r-1",
  published_revision_id: null, scheduled_at: null, embargo_until: null, legal_hold: false,
  legal_review_required: false, content_label: null, breaking: false, post_hoc_review_due: false,
  correction_note: null, first_published_at: null, published_at: null,
  created_at: "2026-11-17T09:00:00Z", updated_at: "2026-11-17T09:00:00Z",
};
const REVISION_ROW = {
  id: "r-1", story_id: "s-1", body: { type: "doc", content: [] }, headline: "Match report", dek: "India won.",
  seo_title: "Match report", seo_description: null, editor_id: "u-9", is_substantive: true, created_at: "2026-11-17T09:00:00Z",
};
const story = (over: Record<string, unknown> = {}) => ({ data: { ...STORY_ROW, ...over }, error: null });
const IN_DESK = { story_revisions: { data: REVISION_ROW, error: null }, workflow_transitions: { data: [], error: null } };
const moved = { "rpc:desk_transition": story({ workflow_state: "draft" }) };
type DeskHandler = (r: NextRequest, c: { params: Promise<Record<string, string>> }) => Promise<Response>;
const withId = (handler: DeskHandler, params: Record<string, string> = { id: "s-1" }) => (r: NextRequest) =>
  handler(r, { params: Promise.resolve(params) });
const HI_WRITER: Grantee = { role: "writer", language: "hi", section: "sports" };
const EN_WRITER: Grantee = { role: "writer", language: "en", section: "sports" };
const HI_SUB: Grantee = { role: "sub_editor", language: "hi", section: "sports" };
const EN_SUB: Grantee = { role: "sub_editor", language: "en", section: "sports" };
const HI_DESK: Grantee = { role: "desk_editor", language: "hi", section: "sports" };
const EN_DESK: Grantee = { role: "desk_editor", language: "en", section: "sports" };
const S = "/api/admin/desk/stories/[id]" as const;
const FUTURE_AT = "2099-01-01T00:00:00.000Z";

const DESK_CASES: Case[] = [
  { path: "/api/admin/desk/stories", method: "GET", handler: deskStories.GET, allowed: { role: "writer", language: "en" }, data: { stories: { data: [], error: null, count: 0 } }, changes: false },
  {
    path: "/api/admin/desk/stories", method: "POST", handler: deskStories.POST, body: { language: "hi", section: "sports", headline: "Match report" },
    allowed: HI_WRITER, wrongScope: EN_WRITER, data: { "rpc:desk_create_story": story({ created_by: "u-1" }) }, changes: true,
  },
  { path: S, method: "GET", handler: withId(deskStory.GET), allowed: HI_WRITER, wrongScope: EN_WRITER, data: { stories: story(), ...IN_DESK }, changes: false },
  { path: `${S}/revisions`, method: "GET", handler: withId(deskRevisions.GET), allowed: HI_WRITER, wrongScope: EN_WRITER, data: { stories: story(), story_revisions: { data: [], error: null } }, changes: false },
  {
    path: `${S}/revisions`, method: "POST", handler: withId(deskRevisions.POST), body: { headline: "Match report", body: { type: "doc" }, expected_revision_id: "r-1" },
    allowed: HI_WRITER, wrongScope: EN_WRITER, data: { stories: story({ created_by: "u-1" }), "rpc:desk_save_revision": story({ created_by: "u-1" }) }, changes: true,
  },
  {
    path: `${S}/revisions/[revisionId]`, method: "GET", handler: withId(deskRevision.GET, { id: "s-1", revisionId: "r-1" }),
    allowed: HI_WRITER, wrongScope: EN_WRITER, data: { stories: story(), ...IN_DESK }, changes: false,
  },
  { path: `${S}/lock`, method: "POST", handler: withId(deskLock.POST), allowed: HI_WRITER, wrongScope: EN_WRITER, data: { stories: story({ created_by: "u-1" }) }, changes: false },
  { path: `${S}/lock`, method: "DELETE", handler: withId(deskLock.DELETE), allowed: HI_WRITER, wrongScope: EN_WRITER, data: { stories: story({ created_by: "u-1" }) }, changes: false },
  {
    path: `${S}/assign`, method: "POST", handler: withId(deskAssign.POST), body: { assignee: "u-2" },
    allowed: HI_WRITER, wrongScope: EN_WRITER, data: { stories: story({ created_by: "u-1", workflow_state: "pitch" }), ...moved }, changes: true,
  },
  { path: `${S}/submit`, method: "POST", handler: withId(deskSubmit.POST), allowed: HI_WRITER, wrongScope: EN_WRITER, data: { stories: story({ created_by: "u-1" }), ...moved }, changes: true },
  {
    path: `${S}/send-back`, method: "POST", handler: withId(deskSendBack.POST), body: { reason: "Needs a second source." },
    allowed: HI_SUB, wrongScope: EN_SUB, data: { stories: story({ workflow_state: "in_review" }), ...moved }, changes: true,
  },
  { path: `${S}/approve`, method: "POST", handler: withId(deskApprove.POST), allowed: HI_DESK, wrongScope: EN_DESK, data: { stories: story({ workflow_state: "desk_review" }), ...IN_DESK, ...moved }, changes: true },
  {
    path: `${S}/schedule`, method: "POST", handler: withId(deskSchedule.POST), body: { scheduled_at: FUTURE_AT },
    allowed: HI_SUB, wrongScope: EN_SUB, data: { stories: story({ workflow_state: "approved", approved_revision_id: "r-1" }), ...moved }, changes: true,
  },
  {
    path: `${S}/unschedule`, method: "POST", handler: withId(deskUnschedule.POST),
    allowed: HI_SUB, wrongScope: EN_SUB, data: { stories: story({ workflow_state: "scheduled", scheduled_at: FUTURE_AT, approved_revision_id: "r-1" }), ...moved }, changes: true,
  },
  {
    path: `${S}/publish`, method: "POST", handler: withId(deskPublish.POST),
    allowed: HI_SUB, wrongScope: EN_SUB, data: { stories: story({ workflow_state: "approved", approved_revision_id: "r-1" }), ...moved }, changes: true,
  },
  { path: `${S}/publish-direct`, method: "POST", handler: withId(deskPublishDirect.POST), allowed: HI_DESK, wrongScope: EN_DESK, data: { stories: story(), ...IN_DESK, ...moved }, changes: true },
  {
    path: `${S}/unpublish`, method: "POST", handler: withId(deskUnpublish.POST), body: { reason_code: "error", reason: "Wrong score." },
    allowed: HI_DESK, wrongScope: EN_DESK, data: { stories: story({ workflow_state: "published", published_revision_id: "r-1" }), ...moved }, changes: true,
  },
  {
    path: `${S}/retract`, method: "POST", handler: withId(deskRetract.POST), body: { reason_code: "legal", reason: "Court order." },
    allowed: HI_DESK, wrongScope: EN_DESK, data: { stories: story({ workflow_state: "published", published_revision_id: "r-1" }), ...moved }, changes: true,
  },
  { path: `${S}/kill`, method: "POST", handler: withId(deskKill.POST), body: { reason: "Dropped." }, allowed: HI_WRITER, wrongScope: EN_WRITER, data: { stories: story({ created_by: "u-1" }), ...moved }, changes: true },
];
CASES.push(...DESK_CASES);

describe("the Desk's own rules (Panel 2 design §3)", () => {
  const caseFor = (method: Method, path: string) => DESK_CASES.find((c) => c.method === method && c.path === path) as Case;
  async function call(c: Case, caller: Grantee, data: Case["data"], body?: unknown) {
    tables = { ...(data ?? {}) };
    signIn("allowed", { ...c, allowed: caller });
    const res = await c.handler(request({ ...c, body: body ?? c.body }));
    return { status: res.status, json: await res.json().catch(() => null) };
  }

  test("four-eyes: the story's creator may not approve it, and nothing is written", async () => {
    const c = caseFor("POST", `${S}/approve`);
    const r = await call(c, HI_DESK, { stories: story({ workflow_state: "desk_review", created_by: "u-1" }), ...IN_DESK, ...moved });
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("four_eyes");
    expect(wrote()).toEqual([]);
  });

  test("four-eyes: whoever saved the version may not approve it", async () => {
    const c = caseFor("POST", `${S}/approve`);
    const history = { data: [{ action: "create", actor_id: "u-9" }, { action: "save", actor_id: "u-1" }], error: null };
    const r = await call(c, HI_DESK, { stories: story({ workflow_state: "desk_review" }), story_revisions: IN_DESK.story_revisions, workflow_transitions: history, ...moved });
    expect(r.json.code).toBe("four_eyes");
    expect(wrote()).toEqual([]);
  });

  test("the checklist blocks approval and names what is missing", async () => {
    const c = caseFor("POST", `${S}/approve`);
    const r = await call(c, HI_DESK, { stories: story({ workflow_state: "desk_review", slug: null }), story_revisions: { data: { ...REVISION_ROW, dek: null }, error: null }, workflow_transitions: IN_DESK.workflow_transitions });
    expect(r.status).toBe(422);
    expect(r.json.problems).toEqual(["dek_missing", "slug_missing"]);
    expect(wrote()).toEqual([]);
  });

  // Design §7: every image the revision uses, as the library's record says now.
  const IMAGE_ID = "c0ffee00-0000-4000-8000-000000000002";
  const withImage = { data: { ...REVISION_ROW, body: { type: "doc", content: [{ type: "image", attrs: { id: IMAGE_ID, ratio: "16x9" } }] } }, error: null };
  const imageRecord = (over: Record<string, unknown> = {}) => ({
    data: [{ id: IMAGE_ID, active: true, credit: "Photo: Asha Rao", source: "staff", licence: "Own work", licence_expires_at: null, rights_cleared_at: "2026-11-18T09:00:00Z", alt_en: null, alt_hi: "खिलाड़ी", caption_en: null, caption_hi: "आखिरी ओवर", renditions: [], ...over }],
    error: null,
  });

  test("the checklist blocks approval while an image lacks cleared rights or the story's alt text, and names it", async () => {
    const c = caseFor("POST", `${S}/approve`);
    const r = await call(c, HI_DESK, { stories: story({ workflow_state: "desk_review" }), story_revisions: withImage, workflow_transitions: IN_DESK.workflow_transitions, media_assets: imageRecord({ rights_cleared_at: null, alt_hi: null }) });
    expect(r.status).toBe(422);
    expect(r.json.problems).toEqual(["image_rights_missing", "image_text_missing"]);
    expect(wrote()).toEqual([]);
  });

  test("the checklist blocks approval for an image the library does not have, or a retired one", async () => {
    const c = caseFor("POST", `${S}/approve`);
    const base = { stories: story({ workflow_state: "desk_review" }), story_revisions: withImage, workflow_transitions: IN_DESK.workflow_transitions };
    expect((await call(c, HI_DESK, { ...base, media_assets: { data: [], error: null } })).json.problems).toEqual(["image_unavailable"]);
    expect((await call(c, HI_DESK, { ...base, media_assets: imageRecord({ active: false }) })).json.problems).toEqual(["image_unavailable"]);
  });

  test("a story with ready images passes the checklist", async () => {
    const c = caseFor("POST", `${S}/approve`);
    const r = await call(c, HI_DESK, { stories: story({ workflow_state: "desk_review" }), story_revisions: withImage, workflow_transitions: IN_DESK.workflow_transitions, media_assets: imageRecord(), ...moved });
    expect(r.status).toBe(200);
  });

  test("images are added in the editor: a new story's body with one, or a save naming no library image, is refused", async () => {
    const create = caseFor("POST", "/api/admin/desk/stories");
    const r = await call(create, HI_WRITER, create.data, { ...(create.body as object), body: withImage.data.body });
    expect(r.status).toBe(400);
    const save = caseFor("POST", `${S}/revisions`);
    const bad = { type: "doc", content: [{ type: "image", attrs: { id: "../../x", ratio: "16x9" } }] };
    expect((await call(save, HI_WRITER, save.data, { ...(save.body as object), body: bad })).status).toBe(400);
    expect(wrote()).toEqual([]);
  });

  test("the story screen gets the revision's images for its preview: the original through the back office until renditions exist", async () => {
    const c = caseFor("GET", S);
    const r = await call(c, HI_WRITER, { stories: story(), story_revisions: withImage, workflow_transitions: IN_DESK.workflow_transitions, media_assets: imageRecord() });
    expect(r.status).toBe(200);
    expect(r.json.images[IMAGE_ID]).toMatchObject({ alt: "खिलाड़ी", caption: "आखिरी ओवर", credit: "Photo: Asha Rao", crops: {}, fallbackUrl: `/api/admin/desk/media/${IMAGE_ID}/original` });
  });

  test("Publish Guard: a draft cannot be published (409), only an approved story can", async () => {
    const c = caseFor("POST", `${S}/publish`);
    const r = await call(c, HI_SUB, { stories: story({ workflow_state: "draft" }), ...moved });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("wrong_state");
    expect(wrote()).toEqual([]);
  });

  test("an embargo holds: nothing publishes before it", async () => {
    const c = caseFor("POST", `${S}/publish`);
    const r = await call(c, HI_SUB, { stories: story({ workflow_state: "approved", approved_revision_id: "r-1", embargo_until: FUTURE_AT }), ...moved });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("embargo");
    expect(wrote()).toEqual([]);
  });

  test("a takedown needs a reason code and a note", async () => {
    const c = caseFor("POST", `${S}/unpublish`);
    const published = { stories: story({ workflow_state: "published", published_revision_id: "r-1" }), ...moved };
    expect((await call(c, HI_DESK, published, { reason_code: "error" })).status).toBe(400);
    expect((await call(c, HI_DESK, published, { reason_code: "whim", reason: "x" })).status).toBe(400);
    expect(wrote()).toEqual([]);
  });

  test("Own: a Writer may not touch another writer's story, even in their own desk", async () => {
    const c = caseFor("POST", `${S}/submit`);
    const r = await call(c, HI_WRITER, { stories: story({ created_by: "u-9" }), ...moved });
    expect(r.status).toBe(403);
    expect(wrote()).toEqual([]);
  });

  // The owner's decision (18 Nov 2026): out of review, the step is the desk's, not the Writer's.
  test("a Writer cannot pass their own story on from review, nor send it back; a Sub-editor can", async () => {
    const own = { stories: story({ workflow_state: "in_review", created_by: "u-1" }), ...moved };
    const submit = caseFor("POST", `${S}/submit`);
    const back = caseFor("POST", `${S}/send-back`);
    const passOn = await call(submit, HI_WRITER, own);
    expect(passOn.status).toBe(403);
    expect(passOn.json.required).toBe("article.submit");
    expect((await call(back, HI_WRITER, own, { reason: "Needs a second source." })).status).toBe(403);
    expect(wrote()).toEqual([]);
    expect((await call(submit, HI_SUB, own)).status).toBe(200);
  });

  test("a Writer still submits their own draft to review", async () => {
    const r = await call(caseFor("POST", `${S}/submit`), HI_WRITER, { stories: story({ workflow_state: "draft", created_by: "u-1" }), ...moved });
    expect(r.status).toBe(200);
  });

  test("send back from desk review also needs article.approve: a Sub-editor is refused", async () => {
    const c = caseFor("POST", `${S}/send-back`);
    const r = await call(c, HI_SUB, { stories: story({ workflow_state: "desk_review" }), ...moved });
    expect(r.status).toBe(403);
    expect(r.json.required).toBe("article.approve");
    expect(wrote()).toEqual([]);
  });

  test("a save is refused while someone else holds a live lock", async () => {
    const c = caseFor("POST", `${S}/revisions`);
    const lock = { data: { story_id: "s-1", holder_id: "u-7", heartbeat_at: new Date().toISOString() }, error: null };
    const r = await call(c, HI_WRITER, { stories: story({ created_by: "u-1" }), story_locks: lock, ...moved });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("locked");
    expect(wrote()).toEqual([]);
  });

  test("taking over a live lock is audited", async () => {
    const c = caseFor("POST", `${S}/lock`);
    const lock = { data: { story_id: "s-1", holder_id: "u-7", heartbeat_at: new Date().toISOString() }, error: null };
    const r = await call(c, HI_WRITER, { stories: story({ created_by: "u-1" }), story_locks: lock }, { take_over: true });
    expect(r.status).toBe(200);
    expect((recordAudit as jest.Mock).mock.calls.map(([row]) => [row.action, row.outcome])).toEqual([
      ["story.lock_take_over", "attempted"],
      ["story.lock_take_over", "succeeded"],
    ]);
  });

  test("the list keeps a scoped caller to their own desk", async () => {
    const c = caseFor("GET", "/api/admin/desk/stories");
    await call(c, HI_WRITER, { stories: { data: [], error: null, count: 0 } });
    expect(calls.filter(([t, m]) => t === "stories" && m === "or").map(([, , a]) => a)).toEqual([["and(language.eq.hi,section.eq.sports)"]]);
  });
});


// ---- the two-person restore (the matrix's A: Desk Editor, Managing Editor, Legal) ----
const PENDING_ROW = {
  id: "p-1", story_id: "s-1", action: "restore", requested_by: "u-9", reason: "Cleared by legal.", payload: {},
  requested_at: "2026-11-17T10:00:00Z", decided_by: null, decided_at: null, outcome: null,
};
const TAKEN_DOWN = { stories: story({ workflow_state: "unpublished", published_revision_id: "r-1" }) };
const RESTORE_CASES: Case[] = [
  {
    path: `${S}/restore`, method: "POST", handler: withId(deskRestore.POST), body: { reason: "Cleared by legal." },
    allowed: HI_DESK, wrongScope: EN_DESK, data: { ...TAKEN_DOWN, pending_actions: { data: PENDING_ROW, error: null } }, changes: true,
  },
  {
    path: "/api/admin/desk/pending/[actionId]/decide", method: "POST", handler: withId(deskDecide.POST, { actionId: "p-1" }), body: { outcome: "approved" },
    allowed: HI_DESK, wrongScope: EN_DESK,
    data: { ...TAKEN_DOWN, pending_actions: { data: PENDING_ROW, error: null }, "rpc:desk_decide_pending": story({ workflow_state: "published", published_revision_id: "r-1" }) },
    changes: true,
  },
];
CASES.push(...RESTORE_CASES);

// The story's details (slug, embargo, legal-review flag), before publication.
const DETAILS_CASE: Case = {
  path: `${S}/details`, method: "POST", handler: withId(deskDetails.POST), body: { slug: "match-report" },
  allowed: HI_WRITER, wrongScope: EN_WRITER, data: { stories: story({ created_by: "u-1" }), ...moved }, changes: true,
};
CASES.push(DETAILS_CASE);

describe("a story's details (Panel 2 design §3)", () => {
  async function call(data: Case["data"], body: unknown, caller: Grantee = HI_WRITER) {
    tables = { ...(data ?? {}) };
    signIn("allowed", { ...DETAILS_CASE, allowed: caller });
    const res = await DETAILS_CASE.handler(request({ ...DETAILS_CASE, body }));
    return { status: res.status, json: await res.json().catch(() => null) };
  }

  test("a malformed slug is refused", async () => {
    expect((await call(DETAILS_CASE.data, { slug: "Bad Slug!" })).status).toBe(400);
    expect(wrote()).toEqual([]);
  });

  test("a live story's details are fixed", async () => {
    expect((await call({ stories: story({ created_by: "u-1", workflow_state: "published", published_revision_id: "r-1" }) }, { slug: "x" })).status).toBe(409);
  });

  test("changing an approved story's details voids the approval", async () => {
    await call({ stories: story({ created_by: "u-1", workflow_state: "approved", approved_revision_id: "r-1" }), ...moved }, { slug: "new-slug" });
    expect(supabase.rpc).toHaveBeenCalledWith("desk_transition", expect.objectContaining({ p_from: "approved", p_to: "desk_review", p_fields: expect.objectContaining({ approved_by: null, approved_revision_id: null, slug: "new-slug" }) }));
  });

  test("only a holder of article.approve clears the legal-review flag", async () => {
    const flagged = { stories: story({ created_by: "u-1", legal_review_required: true }), ...moved };
    const writer = await call(flagged, { legal_review_required: false });
    expect(writer.status).toBe(403);
    expect(writer.json.required).toBe("article.approve");
    expect((await call(flagged, { legal_review_required: false }, HI_DESK)).status).toBe(200);
  });
});

describe("the two-person restore (Panel 2 design §3)", () => {
  const restoreCase = RESTORE_CASES[0];
  const decideCase = RESTORE_CASES[1];
  async function call(c: Case, data: Case["data"], body?: unknown, caller: Grantee = HI_DESK) {
    tables = { ...(data ?? {}) };
    signIn("allowed", { ...c, allowed: caller });
    const res = await c.handler(request({ ...c, body: body ?? c.body }));
    return { status: res.status, json: await res.json().catch(() => null) };
  }

  test("a Desk Editor (A) may ask, with a reason, and the request is audited", async () => {
    const r = await call(restoreCase, restoreCase.data);
    expect(r.status).toBe(201);
    expect(r.json.request.id).toBe("p-1");
    expect((recordAudit as jest.Mock).mock.calls.map(([row]) => [row.action, row.outcome])).toEqual([
      ["story.restore_request", "attempted"],
      ["story.restore_request", "succeeded"],
    ]);
  });

  test("only a story that was taken down can be restored; a reason is required", async () => {
    expect((await call(restoreCase, { stories: story({ workflow_state: "published", published_revision_id: "r-1" }) })).status).toBe(409);
    expect((await call(restoreCase, restoreCase.data, { reason: " " })).status).toBe(400);
    expect(wrote()).toEqual([]);
  });

  test("the person who asked cannot decide their own request", async () => {
    const r = await call(decideCase, { ...TAKEN_DOWN, pending_actions: { data: { ...PENDING_ROW, requested_by: "u-1" }, error: null } });
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("four_eyes");
    expect(wrote()).toEqual([]);
  });

  test("a decided request is not decided again", async () => {
    const decided = { ...PENDING_ROW, decided_by: "u-7", decided_at: "2026-11-17T11:00:00Z", outcome: "approved" };
    const r = await call(decideCase, { ...TAKEN_DOWN, pending_actions: { data: decided, error: null } });
    expect(r.status).toBe(409);
    expect(wrote()).toEqual([]);
  });

  test("a decline is recorded as its own action", async () => {
    const r = await call(decideCase, decideCase.data, { outcome: "declined" });
    expect(r.status).toBe(200);
    expect((recordAudit as jest.Mock).mock.calls.map(([row]) => row.action)).toEqual(["story.restore_decline", "story.restore_decline"]);
    expect(supabase.rpc).toHaveBeenCalledWith("desk_decide_pending", expect.objectContaining({ p_outcome: "declined", p_decider: "u-1" }));
  });

  test("an outcome other than approved or declined is refused before anything is read", async () => {
    const r = await call(decideCase, decideCase.data, { outcome: "maybe" });
    expect(r.status).toBe(400);
    expect(calls).toEqual([]);
  });

  test("a Writer (no restore cell) is refused", async () => {
    const r = await call(restoreCase, restoreCase.data, undefined, HI_WRITER);
    expect(r.status).toBe(403);
    expect(wrote()).toEqual([]);
  });
});

// ---- corrections: correction.publish is S for a Desk Editor, F for the Managing Editor, A for a Sub-editor ----
const NOTE = "An earlier version gave the wrong score.";
const LIVE = { stories: story({ workflow_state: "published", published_revision_id: "r-1" }) };
const CORRECTION_PENDING = { ...PENDING_ROW, id: "p-2", action: "correction", requested_by: "u-9", reason: NOTE, payload: { note: NOTE } };
const LEGAL: Grantee = { role: "legal_compliance", language: null };
const CORRECT_CASE: Case = {
  // The least-privileged holder is a Sub-editor (A): the route records the request.
  path: `${S}/correct`, method: "POST", handler: withId(deskCorrect.POST), body: { note: NOTE },
  allowed: HI_SUB, wrongScope: EN_SUB, data: { ...LIVE, pending_actions: { data: CORRECTION_PENDING, error: null } }, changes: true,
};
CASES.push(CORRECT_CASE);

describe("corrections on a live story (Panel 2 design §3)", () => {
  const decideCase = RESTORE_CASES[1];
  async function call(c: Case, data: Case["data"], body: unknown, caller: Grantee) {
    tables = { ...(data ?? {}) };
    signIn("allowed", { ...c, allowed: caller });
    const res = await c.handler(request({ ...c, body }));
    return { status: res.status, json: await res.json().catch(() => null) };
  }
  const actions = () => (recordAudit as jest.Mock).mock.calls.map(([row]) => [row.action, row.outcome]);

  test("a Desk Editor (S) publishes the note at once, through a move that keeps the story live", async () => {
    const r = await call(CORRECT_CASE, { ...LIVE, "rpc:desk_transition": story({ workflow_state: "published", correction_note: NOTE }) }, { note: ` ${NOTE} ` }, HI_DESK);
    expect(r.status).toBe(200);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "desk_transition",
      expect.objectContaining({ p_action: "correct", p_from: "published", p_to: "published", p_reason: NOTE, p_fields: { correction_note: NOTE } })
    );
    expect(actions()).toEqual([
      ["story.correct", "attempted"],
      ["story.correct", "succeeded"],
    ]);
    expect(calls.some(([t]) => t === "pending_actions")).toBe(false);
  });

  test("a Sub-editor (A) asks: a request with the note, for a second person to decide", async () => {
    const r = await call(CORRECT_CASE, CORRECT_CASE.data, { note: NOTE }, HI_SUB);
    expect(r.status).toBe(201);
    expect(r.json.request.id).toBe("p-2");
    const insert = calls.find(([t, m]) => t === "pending_actions" && m === "insert");
    expect(insert?.[2][0]).toEqual({ story_id: "s-1", action: "correction", requested_by: "u-1", reason: NOTE, payload: { note: NOTE } });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(actions()).toEqual([
      ["story.correct_request", "attempted"],
      ["story.correct_request", "succeeded"],
    ]);
  });

  test("only a live story takes a note, of 1 to 600 characters; nothing is written otherwise", async () => {
    expect((await call(CORRECT_CASE, { stories: story({ workflow_state: "draft" }) }, { note: NOTE }, HI_DESK)).status).toBe(409);
    expect((await call(CORRECT_CASE, LIVE, { note: "  " }, HI_DESK)).status).toBe(400);
    expect((await call(CORRECT_CASE, LIVE, { note: "x".repeat(601) }, HI_DESK)).status).toBe(400);
    expect(wrote()).toEqual([]);
  });

  test("no cell, or a read-only one, cannot publish or ask: a Writer, and Legal (R)", async () => {
    expect((await call(CORRECT_CASE, LIVE, { note: NOTE }, HI_WRITER)).status).toBe(403);
    expect((await call(CORRECT_CASE, LIVE, { note: NOTE }, LEGAL)).status).toBe(403);
    expect(wrote()).toEqual([]);
  });

  test("a Desk Editor approves a Sub-editor's request: the database sets the note, audited as its own action", async () => {
    const data = { ...LIVE, pending_actions: { data: CORRECTION_PENDING, error: null }, "rpc:desk_decide_pending": story({ workflow_state: "published", correction_note: NOTE }) };
    const r = await call(decideCase, data, { outcome: "approved" }, HI_DESK);
    expect(r.status).toBe(200);
    expect(supabase.rpc).toHaveBeenCalledWith("desk_decide_pending", expect.objectContaining({ p_action: "p-2", p_outcome: "approved", p_decider: "u-1" }));
    expect(actions()).toEqual([
      ["story.correct_approve", "attempted"],
      ["story.correct_approve", "succeeded"],
    ]);
  });

  test("a correction is decided only by S or F: never by another Sub-editor (A), nor by Legal (R)", async () => {
    const data = { ...LIVE, pending_actions: { data: CORRECTION_PENDING, error: null } };
    expect((await call(decideCase, data, { outcome: "approved" }, HI_SUB)).status).toBe(403);
    const legal = await call(decideCase, data, { outcome: "approved" }, LEGAL);
    expect(legal.status).toBe(403);
    expect(wrote()).toEqual([]);
  });

  test("the refusal is the request's own rule: Legal still decides a restore (article.restore, A)", async () => {
    const r = await call(decideCase, decideCase.data, { outcome: "declined" }, LEGAL);
    expect(r.status).toBe(200);
    expect(actions()).toEqual([
      ["story.restore_decline", "attempted"],
      ["story.restore_decline", "succeeded"],
    ]);
  });

  test("the person who asked cannot decide their own correction", async () => {
    const own = { ...LIVE, pending_actions: { data: { ...CORRECTION_PENDING, requested_by: "u-1" }, error: null } };
    const r = await call(decideCase, own, { outcome: "approved" }, HI_DESK);
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("four_eyes");
    expect(wrote()).toEqual([]);
  });
});

// ---- the alert list: takedowns, for whoever may take stories down (article.unpublish) ----
const TAKEDOWN = (id: number, story: string, action = "unpublish") => ({
  id, story_id: story, action, actor_id: "u-9", actor_label: "staff:u-9", reason: "legal: Court order.", at: "2026-11-17T09:00:00Z",
});
const ALERTS_CASE: Case = {
  path: "/api/admin/desk/alerts", method: "GET", handler: deskAlerts.GET,
  allowed: HI_DESK, data: { workflow_transitions: { data: [], error: null } }, changes: false,
};
CASES.push(ALERTS_CASE);

describe("the Desk's alert list (Panel 2 design §8)", () => {
  const data = {
    workflow_transitions: { data: [TAKEDOWN(2, "s-1", "retract"), TAKEDOWN(1, "s-2")], error: null },
    stories: {
      data: [
        { id: "s-1", language: "hi", section: "sports", workflow_state: "retracted", current: { headline: "Match report" } },
        { id: "s-2", language: "en", section: "world", workflow_state: "unpublished", current: { headline: "Talks" } },
      ],
      error: null,
    },
    staff_profiles: { data: [{ user_id: "u-9", display_name: "Ravi" }], error: null },
  };
  async function call(caller: Grantee) {
    tables = { ...data };
    signIn("allowed", { ...ALERTS_CASE, allowed: caller });
    const res = await ALERTS_CASE.handler(request(ALERTS_CASE));
    return { status: res.status, json: await res.json().catch(() => null) };
  }

  test("a Desk Editor sees their desk's takedowns only, with who took each down", async () => {
    const r = await call(HI_DESK);
    expect(r.status).toBe(200);
    expect(r.json.days).toBe(30);
    expect(r.json.alerts.map((a: { story: { id: string }; by: string; action: string }) => [a.story.id, a.action, a.by])).toEqual([["s-1", "retract", "Ravi"]]);
  });

  test("Legal sees every desk's takedowns", async () => {
    const r = await call(LEGAL);
    expect(r.json.alerts.map((a: { story: { id: string } }) => a.story.id)).toEqual(["s-1", "s-2"]);
  });

  test("whoever may not take stories down sees no alert list: a Sub-editor, a Writer", async () => {
    expect((await call(HI_SUB)).status).toBe(403);
    expect((await call(HI_WRITER)).status).toBe(403);
    expect(calls).toEqual([]);
  });
});

// ---- authors and credits (design §7): author.manage is F for the Managing Editor and a Desk Editor ----
const AUTHOR_ID = "a1b2c3d4-0000-4000-8000-000000000001";
const AUTHOR_ROW = {
  id: AUTHOR_ID, display_name_en: "Asha Rao", display_name_hi: "आशा राव", kind: "staff", bio_en: null, bio_hi: null,
  beat: "sports", links: [], active: true, created_at: "2026-11-18T09:00:00Z",
};
const AUTHORS_GET: Case = { path: "/api/admin/desk/authors", method: "GET", handler: deskAuthors.GET, allowed: HI_WRITER, data: { authors: { data: [AUTHOR_ROW], error: null } }, changes: false };
const AUTHORS_POST: Case = {
  path: "/api/admin/desk/authors", method: "POST", handler: deskAuthors.POST, body: { display_name_en: "Asha Rao", display_name_hi: "आशा राव", kind: "staff" },
  allowed: HI_DESK, data: { authors: { data: AUTHOR_ROW, error: null } }, changes: true,
};
const AUTHOR_PATCH: Case = {
  path: "/api/admin/desk/authors/[id]", method: "PATCH", handler: withId(deskAuthor.PATCH, { id: AUTHOR_ID }), body: { active: false },
  allowed: HI_DESK, data: { authors: { data: AUTHOR_ROW, error: null } }, changes: true,
};
const CREDITS_CASE: Case = {
  path: `${S}/credits`, method: "POST", handler: withId(deskCredits.POST), body: { credits: [{ author_id: AUTHOR_ID, role: "byline" }] },
  allowed: HI_WRITER, wrongScope: EN_WRITER, data: { stories: story({ created_by: "u-1" }), "rpc:desk_set_credits": story({ created_by: "u-1" }) }, changes: true,
};
CASES.push(AUTHORS_GET, AUTHORS_POST, AUTHOR_PATCH, CREDITS_CASE);

describe("authors and a story's credits (Panel 2 design §7)", () => {
  async function call(c: Case, data: Case["data"], body: unknown, caller: Grantee) {
    tables = { ...(data ?? {}) };
    signIn("allowed", { ...c, allowed: caller });
    const res = await c.handler(request({ ...c, body }));
    return { status: res.status, json: await res.json().catch(() => null) };
  }
  const audits = () => (recordAudit as jest.Mock).mock.calls.map(([row]) => [row.action, row.outcome]);

  // desk-8: an author's photo, beside their byline: a library image, not retired, its rights cleared.
  const PHOTO_ID = "c0ffee00-0000-4000-8000-000000000004";
  const photo = (over: Record<string, unknown> = {}) => ({ data: { id: PHOTO_ID, active: true, rights_cleared_at: "2026-11-18T09:00:00Z", ...over }, error: null });
  const photoUpdate = () => calls.filter(([t, m]) => t === "authors" && m === "update").map(([, , args]) => args[0] as Record<string, unknown>).at(-1);

  test("a photo with cleared rights is set, and removed with null; audited", async () => {
    const set = await call(AUTHOR_PATCH, { ...AUTHOR_PATCH.data, media_assets: photo() }, { photo_id: PHOTO_ID }, HI_DESK);
    expect(set.status).toBe(200);
    expect(photoUpdate()).toEqual({ photo_id: PHOTO_ID });
    expect(audits()).toEqual([["author.update", "attempted"], ["author.update", "succeeded"]]);
    expect((await call(AUTHOR_PATCH, AUTHOR_PATCH.data, { photo_id: null }, HI_DESK)).status).toBe(200);
    expect(photoUpdate()).toEqual({ photo_id: null });
  });

  test("a photo the library lacks, a retired one, or one whose rights are not cleared is refused; nothing written", async () => {
    const missing = await call(AUTHOR_PATCH, { ...AUTHOR_PATCH.data, media_assets: { data: null, error: null } }, { photo_id: PHOTO_ID }, HI_DESK);
    expect([missing.status, missing.json.code]).toEqual([422, "photo_unavailable"]);
    const retired = await call(AUTHOR_PATCH, { ...AUTHOR_PATCH.data, media_assets: photo({ active: false }) }, { photo_id: PHOTO_ID }, HI_DESK);
    expect([retired.status, retired.json.code]).toEqual([422, "photo_unavailable"]);
    const uncleared = await call(AUTHORS_POST, { ...AUTHORS_POST.data, media_assets: photo({ rights_cleared_at: null }) }, { ...(AUTHORS_POST.body as object), photo_id: PHOTO_ID }, HI_DESK);
    expect([uncleared.status, uncleared.json.code]).toEqual([422, "photo_rights"]);
    expect((await call(AUTHOR_PATCH, AUTHOR_PATCH.data, { photo_id: "../../x" }, HI_DESK)).status).toBe(400);
    expect(wrote()).toEqual([]);
  });

  test("authors belong to no desk: a Desk Editor of any language manages them (the matrix's F)", async () => {
    const r = await call(AUTHORS_POST, AUTHORS_POST.data, AUTHORS_POST.body, EN_DESK);
    expect(r.status).toBe(201);
    expect(calls.find(([t, m]) => t === "authors" && m === "insert")?.[2][0]).toEqual({ display_name_en: "Asha Rao", display_name_hi: "आशा राव", kind: "staff" });
    expect(audits()).toEqual([
      ["author.create", "attempted"],
      ["author.create", "succeeded"],
    ]);
  });

  test("whoever lacks author.manage cannot create or change one: a Sub-editor, a Writer", async () => {
    expect((await call(AUTHORS_POST, AUTHORS_POST.data, AUTHORS_POST.body, HI_SUB)).status).toBe(403);
    expect((await call(AUTHOR_PATCH, AUTHOR_PATCH.data, { active: false }, HI_WRITER)).status).toBe(403);
    expect(wrote()).toEqual([]);
  });

  test("an author record is checked: an English name and a kind; agency bylines wait for a wire licence", async () => {
    expect((await call(AUTHORS_POST, AUTHORS_POST.data, { kind: "staff" }, HI_DESK)).status).toBe(400);
    const agency = await call(AUTHORS_POST, AUTHORS_POST.data, { display_name_en: "PTI", kind: "agency" }, HI_DESK);
    expect(agency.status).toBe(400);
    expect(agency.json.error).toMatch(/wire licence/);
    expect((await call(AUTHORS_POST, AUTHORS_POST.data, { display_name_en: "A", kind: "staff", links: ["http://x.example"] }, HI_DESK)).status).toBe(400);
    expect((await call(AUTHOR_PATCH, AUTHOR_PATCH.data, {}, HI_DESK)).status).toBe(400);
    expect(wrote()).toEqual([]);
  });

  test("retiring an author keeps the record: an update with active false, audited with before and after", async () => {
    const r = await call(AUTHOR_PATCH, AUTHOR_PATCH.data, { active: false }, HI_DESK);
    expect(r.status).toBe(200);
    expect(calls.find(([t, m]) => t === "authors" && m === "update")?.[2][0]).toEqual({ active: false });
    expect(calls.some(([t, m]) => t === "authors" && m === "delete")).toBe(false);
    expect((recordAudit as jest.Mock).mock.calls[0][0]).toMatchObject({ action: "author.update", entity_type: "author", entity_id: AUTHOR_ID, before: expect.objectContaining({ active: true }) });
  });

  test("an unknown author is not found, and nothing changes", async () => {
    const r = await call(AUTHOR_PATCH, { authors: { data: null, error: null } }, { active: false }, HI_DESK);
    expect(r.status).toBe(404);
    expect(wrote()).toEqual([]);
  });

  test("a story's credits go through the database function, from the state it was read in", async () => {
    const r = await call(CREDITS_CASE, CREDITS_CASE.data, { credits: [{ author_id: AUTHOR_ID, role: "byline" }, { author_id: AUTHOR_ID, role: "translated_by" }] }, HI_WRITER);
    expect(r.status).toBe(200);
    expect(supabase.rpc).toHaveBeenCalledWith("desk_set_credits", {
      p_story: "s-1",
      p_from: "draft",
      p_actor: "u-1",
      p_actor_label: "staff:u-1",
      p_credits: [{ author_id: AUTHOR_ID, role: "byline" }, { author_id: AUTHOR_ID, role: "translated_by" }],
    });
    expect(audits()).toEqual([
      ["story.credits", "attempted"],
      ["story.credits", "succeeded"],
    ]);
  });

  test("credits are set before publication only, each once, and well formed", async () => {
    const live = { stories: story({ created_by: "u-1", workflow_state: "published", published_revision_id: "r-1" }) };
    expect((await call(CREDITS_CASE, live, CREDITS_CASE.body, HI_WRITER)).status).toBe(409);
    expect((await call(CREDITS_CASE, CREDITS_CASE.data, { credits: [{ author_id: "not-a-uuid", role: "byline" }] }, HI_WRITER)).status).toBe(400);
    expect((await call(CREDITS_CASE, CREDITS_CASE.data, { credits: [{ author_id: AUTHOR_ID, role: "editor" }] }, HI_WRITER)).status).toBe(400);
    const twice = [{ author_id: AUTHOR_ID, role: "byline" }, { author_id: AUTHOR_ID, role: "byline" }];
    expect((await call(CREDITS_CASE, CREDITS_CASE.data, { credits: twice }, HI_WRITER)).status).toBe(400);
    expect((await call(CREDITS_CASE, CREDITS_CASE.data, { credits: Array.from({ length: 21 }, () => ({ author_id: AUTHOR_ID, role: "byline" })) }, HI_WRITER)).status).toBe(400);
    expect(wrote()).toEqual([]);
  });

  test("a Writer credits only their own story (Own)", async () => {
    const someoneElses = { stories: story({ created_by: "u-9" }) };
    expect((await call(CREDITS_CASE, someoneElses, CREDITS_CASE.body, HI_WRITER)).status).toBe(403);
    expect(wrote()).toEqual([]);
  });
});

// ---- the media library (design §7): upload on article.edit; credit, licence and rights on media.manage ----
const MEDIA_ID = "c0ffee00-0000-4000-8000-000000000001";
const MEDIA_ROW = {
  id: MEDIA_ID, storage_key: `originals/${MEDIA_ID}.jpg`, content_type: "image/jpeg", bytes: 4, width: null, height: null,
  language: "hi", section: "sports", credit: null, source: null, licence: null, licence_expires_at: null,
  rights_cleared_by: null, rights_cleared_at: null, alt_en: null, alt_hi: null, caption_en: null, caption_hi: null,
  renditions: [], renditions_at: null, uploaded_by: "u-9", active: true, created_at: "2026-11-18T09:00:00Z", updated_at: "2026-11-18T09:00:00Z",
};
const JPEG = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);
const imageForm = (fields: Record<string, string> = { language: "hi", section: "sports", credit: "Photo: Asha Rao" }, file: Uint8Array | null = JPEG()) => () => {
  const form = new FormData();
  if (file) form.set("file", new File([file as BlobPart], "match.jpg", { type: "image/jpeg" }));
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
};
const MEDIA_GET: Case = { path: "/api/admin/desk/media", method: "GET", handler: deskMedia.GET, allowed: HI_WRITER, data: { media_assets: { data: [], error: null, count: 0 } }, changes: false };
const MEDIA_POST: Case = {
  path: "/api/admin/desk/media", method: "POST", handler: deskMedia.POST, form: imageForm(),
  allowed: HI_WRITER, wrongScope: EN_WRITER, data: { media_assets: { data: MEDIA_ROW, error: null } }, changes: true,
};
const MEDIA_PATCH: Case = {
  path: "/api/admin/desk/media/[id]", method: "PATCH", handler: withId(deskMediaOne.PATCH, { id: MEDIA_ID }), body: { credit: "Photo: Asha Rao" },
  allowed: HI_DESK, wrongScope: EN_DESK, data: { media_assets: { data: MEDIA_ROW, error: null } }, changes: true,
};
const MEDIA_ORIGINAL: Case = {
  path: "/api/admin/desk/media/[id]/original", method: "GET", handler: withId(deskMediaOriginal.GET, { id: MEDIA_ID }),
  allowed: HI_WRITER, wrongScope: EN_WRITER, data: { media_assets: { data: MEDIA_ROW, error: null } }, changes: false,
};
CASES.push(MEDIA_GET, MEDIA_POST, MEDIA_PATCH, MEDIA_ORIGINAL);

describe("the media library (Panel 2 design §7)", () => {
  const { put, get } = jest.requireMock("@timesprime/server/lib/mediaStorage") as { put: jest.Mock; get: jest.Mock };
  async function call(c: Case, over: Partial<Case>, caller: Grantee, data: Case["data"] = c.data) {
    tables = { ...(data ?? {}) };
    signIn("allowed", { ...c, allowed: caller });
    const res = await c.handler(request({ ...c, ...over }));
    return { status: res.status, json: await res.json().catch(() => null) };
  }
  const updates = () => calls.filter(([t, m]) => t === "media_assets" && m === "update").map(([, , args]) => args[0] as Record<string, unknown>);

  test("an upload keeps the file under a new random key and records who, the desk and what is known; audited", async () => {
    const r = await call(MEDIA_POST, {}, HI_WRITER);
    expect(r.status).toBe(201);
    const [key, body, type] = put.mock.calls[0];
    expect(key).toMatch(/^originals\/[0-9a-f-]{36}\.jpg$/);
    expect(Array.from(body as Uint8Array)).toEqual(Array.from(JPEG()));
    expect(type).toBe("image/jpeg");
    const insert = calls.find(([t, m]) => t === "media_assets" && m === "insert")?.[2][0] as Record<string, unknown>;
    expect(insert).toMatchObject({ storage_key: key, content_type: "image/jpeg", bytes: 16, language: "hi", section: "sports", uploaded_by: "u-1", credit: "Photo: Asha Rao" });
    expect(insert.rights_cleared_by).toBeUndefined();
    expect((recordAudit as jest.Mock).mock.calls.map(([row]) => [row.action, row.outcome])).toEqual([
      ["media.upload", "attempted"],
      ["media.upload", "succeeded"],
    ]);
    // No renditions yet: the tile shows the original, through the back office only.
    expect(r.json.media).toMatchObject({ url: `/api/admin/desk/media/${MEDIA_ID}/original`, original_url: `/api/admin/desk/media/${MEDIA_ID}/original`, renditions_state: "waiting" });
  });

  test("once the worker has made renditions, the tile shows the 4:3 WebP one, never the original's file", async () => {
    const tile = { key: `renditions/${MEDIA_ID}/4x3-480.webp`, ratio: "4x3", format: "webp", width: 480, height: 360, bytes: 9 };
    const made = { media_assets: { data: [{ ...MEDIA_ROW, renditions_at: "2026-11-18T09:05:00Z", renditions: [{ ...tile, format: "avif", key: tile.key.replace("webp", "avif") }, tile] }], error: null, count: 1 } };
    const r = await call(MEDIA_GET, {}, HI_WRITER, made);
    expect(r.json.media[0]).toMatchObject({ url: "/media/" + tile.key, renditions_state: "ready" });
    const failed = { media_assets: { data: [{ ...MEDIA_ROW, renditions_at: "2026-11-18T09:05:00Z", renditions: [] }], error: null, count: 1 } };
    expect((await call(MEDIA_GET, {}, HI_WRITER, failed)).json.media[0]).toMatchObject({ url: `/api/admin/desk/media/${MEDIA_ID}/original`, renditions_state: "failed" });
  });

  test("the original goes to staff in the image's desk only: its bytes and type, kept by no shared cache", async () => {
    tables = { ...(MEDIA_ORIGINAL.data ?? {}) };
    signIn("allowed", MEDIA_ORIGINAL);
    const res = await MEDIA_ORIGINAL.handler(request(MEDIA_ORIGINAL));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe("private, max-age=600");
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual([0xff, 0xd8, 0xff, 0xe0]);
    expect(get).toHaveBeenCalledWith(MEDIA_ROW.storage_key);
    expect((await call(MEDIA_ORIGINAL, {}, HI_WRITER, { media_assets: { data: null, error: null } })).status).toBe(404);
    get.mockResolvedValueOnce(null);
    expect((await call(MEDIA_ORIGINAL, {}, HI_WRITER)).status).toBe(404);
  });

  test("the type is read from the file's bytes: a GIF named .jpg, no file, or no desk is refused, and nothing is kept", async () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect((await call(MEDIA_POST, { form: imageForm(undefined, gif) }, HI_WRITER)).status).toBe(400);
    expect((await call(MEDIA_POST, { form: imageForm(undefined, null) }, HI_WRITER)).status).toBe(400);
    expect((await call(MEDIA_POST, { form: imageForm({ language: "hi" }) }, HI_WRITER)).status).toBe(400);
    expect((await call(MEDIA_POST, { form: imageForm({ language: "hi", section: "sports", source: "friend" }) }, HI_WRITER)).status).toBe(400);
    expect(put).not.toHaveBeenCalled();
    expect(wrote()).toEqual([]);
  });

  test("an image over 15 MB is refused", async () => {
    const big = new Uint8Array(15 * 1024 * 1024 + 1);
    big.set(JPEG());
    expect((await call(MEDIA_POST, { form: imageForm(undefined, big) }, HI_WRITER)).status).toBe(413);
    expect(put).not.toHaveBeenCalled();
  });

  test("rights are cleared by a holder of media.manage, once credit, source and licence are set, naming who", async () => {
    const bare = await call(MEDIA_PATCH, { body: { rights_cleared: true } }, HI_DESK);
    expect(bare.status).toBe(422);
    expect(bare.json.code).toBe("rights_incomplete");
    const r = await call(MEDIA_PATCH, { body: { credit: "Photo: Asha Rao", source: "staff", licence: "Own work", rights_cleared: true } }, HI_DESK);
    expect(r.status).toBe(200);
    expect(updates().at(-1)).toMatchObject({ credit: "Photo: Asha Rao", source: "staff", licence: "Own work", rights_cleared_by: "u-1", rights_cleared_at: expect.any(String) });
  });

  test("changing the credit, source or licence voids a clearance; alt text alone does not", async () => {
    const cleared = { media_assets: { data: { ...MEDIA_ROW, credit: "AP", source: "agency", licence: "Contract", rights_cleared_by: "u-7", rights_cleared_at: "2026-11-18T09:30:00Z" }, error: null } };
    await call(MEDIA_PATCH, { body: { credit: "Reuters" } }, HI_DESK, cleared);
    expect(updates().at(-1)).toMatchObject({ credit: "Reuters", rights_cleared_by: null, rights_cleared_at: null });
    await call(MEDIA_PATCH, { body: { alt_hi: "मैदान पर खिलाड़ी" } }, HI_DESK, cleared);
    expect(updates().at(-1)).toEqual({ alt_hi: "मैदान पर खिलाड़ी", updated_at: expect.any(String) });
  });

  test("retiring keeps the image; a Writer cannot change an image; an unknown one is not found", async () => {
    expect((await call(MEDIA_PATCH, { body: { active: false } }, HI_DESK)).status).toBe(200);
    expect(updates().at(-1)).toMatchObject({ active: false });
    expect(calls.some(([t, m]) => t === "media_assets" && m === "delete")).toBe(false);
    expect((await call(MEDIA_PATCH, { body: { active: false } }, HI_WRITER)).status).toBe(403);
    expect((await call(MEDIA_PATCH, { body: { active: false } }, HI_DESK, { media_assets: { data: null, error: null } })).status).toBe(404);
  });
});

// ---- Panel 1, Administration: people and their roles (design §3) ----
// user.manage and role.assign: A for a Super Admin (asks; removes at once), S for a Managing Editor
// (up to Desk Editor in their own scope, at once). The least-privileged holder of S is a Managing
// Editor for one language; one for the other language does not reach this person.
const PERSON = "0a1b2c3d-0000-4000-8000-000000000001";
const ROW_ID = "0a1b2c3d-0000-4000-8000-0000000000a1";
const REQ_ID = "0a1b2c3d-0000-4000-8000-0000000000b1";
const PROFILE_ROW = {
  user_id: PERSON, display_name: "Ravi", status: "active", mfa_required: true,
  created_at: "2026-11-19T09:00:00Z", created_by: "u-9", last_sign_in_at: null,
};
const roleRow = (over: Record<string, unknown> = {}) => ({
  id: ROW_ID, user_id: PERSON, role_key: "writer", language: "hi", section: "sports", is_break_glass: false,
  granted_by: "u-9", approved_by: null, reason: "New on the desk.", granted_at: "2026-11-19T09:00:00Z",
  expires_at: FUTURE, revoked_at: null, revoked_by: null, revoke_reason: null, ...over,
});
const REQUEST_ROW = {
  id: REQ_ID, kind: "grant", user_id: PERSON, details: { role: "writer", language: "hi", section: "sports", days: 90 },
  reason: "Covers the elections.", requested_by: "u-9", requested_at: "2026-11-19T09:00:00Z", lapses_at: FUTURE,
  decided_by: null, decided_at: null, outcome: null, note: null,
};
const HI_MANAGING: Grantee = { role: "managing_editor", language: "hi" };
const EN_MANAGING: Grantee = { role: "managing_editor", language: "en" };
const SUPER_ADMIN: Grantee = { role: "super_admin", language: null };
const IN_PEOPLE = (profile: Record<string, unknown> = {}, rows: unknown[] = [roleRow()]) => ({
  staff_profiles: { data: { ...PROFILE_ROW, ...profile }, error: null },
  role_assignments: { data: rows, error: null },
});
const P = "/api/admin/people/[id]" as const;
const onPerson = (handler: DeskHandler) => withId(handler, { id: PERSON });
const onRow = (handler: DeskHandler) => withId(handler, { id: PERSON, assignmentId: ROW_ID });
const onRequest = (handler: DeskHandler) => withId(handler, { requestId: REQ_ID });
const REASON = { reason: "Moved to the politics desk." };

const PEOPLE_CASES: Case[] = [
  { path: "/api/admin/people", method: "GET", handler: people.GET, allowed: HI_MANAGING, data: { staff_profiles: { data: [PROFILE_ROW], error: null }, role_assignments: { data: [roleRow()], error: null } }, changes: false },
  { path: P, method: "GET", handler: onPerson(person.GET), allowed: HI_MANAGING, wrongScope: EN_MANAGING, data: IN_PEOPLE(), changes: false },
  {
    path: P, method: "PATCH", handler: onPerson(person.PATCH), body: { display_name: "Ravi Kumar", ...REASON },
    allowed: HI_MANAGING, wrongScope: EN_MANAGING, data: IN_PEOPLE(), changes: true,
  },
  { path: `${P}/suspend`, method: "POST", handler: onPerson(personSuspend.POST), body: REASON, allowed: HI_MANAGING, wrongScope: EN_MANAGING, data: { ...IN_PEOPLE(), "rpc:staff_end_sessions": { data: 1, error: null } }, changes: true },
  { path: `${P}/reactivate`, method: "POST", handler: onPerson(personReactivate.POST), body: REASON, allowed: HI_MANAGING, wrongScope: EN_MANAGING, data: IN_PEOPLE({ status: "suspended" }), changes: true },
  { path: `${P}/sign-out`, method: "POST", handler: onPerson(personSignOut.POST), allowed: HI_MANAGING, wrongScope: EN_MANAGING, data: { ...IN_PEOPLE(), "rpc:staff_end_sessions": { data: 2, error: null } }, changes: true },
  {
    path: `${P}/roles`, method: "POST", handler: onPerson(personRoles.POST), body: { role: "sub_editor", language: "hi", section: "sports", days: 90, ...REASON },
    allowed: HI_MANAGING, wrongScope: EN_MANAGING, data: { ...IN_PEOPLE(), "rpc:access_grant": { data: roleRow({ role_key: "sub_editor" }), error: null } }, changes: true,
  },
  {
    path: `${P}/roles/[assignmentId]/renew`, method: "POST", handler: onRow(personRenew.POST), body: { days: 90, ...REASON },
    allowed: HI_MANAGING, wrongScope: EN_MANAGING, data: { ...IN_PEOPLE(), "rpc:access_grant": { data: roleRow(), error: null } }, changes: true,
  },
  { path: `${P}/roles/[assignmentId]/revoke`, method: "POST", handler: onRow(personRevoke.POST), body: REASON, allowed: HI_MANAGING, wrongScope: EN_MANAGING, data: IN_PEOPLE(), changes: true },
  { path: "/api/admin/people/requests", method: "GET", handler: accessRequests.GET, allowed: HI_MANAGING, data: { access_requests: { data: [], error: null } }, changes: false },
  // Only a Super Admin decides a request (a Managing Editor holds S, never A), and never their own.
  {
    path: "/api/admin/people/requests/[requestId]/approve", method: "POST", handler: onRequest(requestApprove.POST), allowed: SUPER_ADMIN,
    data: { access_requests: { data: REQUEST_ROW, error: null }, "rpc:access_decide": { data: { ...REQUEST_ROW, decided_by: "u-1", decided_at: "2026-11-19T10:00:00Z", outcome: "approved" }, error: null } },
    changes: true,
  },
  {
    path: "/api/admin/people/requests/[requestId]/decline", method: "POST", handler: onRequest(requestDecline.POST), body: { note: "Not needed." }, allowed: SUPER_ADMIN,
    data: { access_requests: { data: REQUEST_ROW, error: null }, "rpc:access_decide": { data: { ...REQUEST_ROW, outcome: "declined" }, error: null } },
    changes: true,
  },
  {
    path: "/api/admin/people/requests/[requestId]/cancel", method: "POST", handler: onRequest(requestCancel.POST), allowed: SUPER_ADMIN,
    data: { access_requests: { data: { ...REQUEST_ROW, requested_by: "u-1" }, error: null }, "rpc:access_decide": { data: { ...REQUEST_ROW, outcome: "cancelled" }, error: null } },
    changes: true,
  },
];
// ---- Panel 1, M2: adding people, one-time links, lost factors ----
const NEW_PERSON = { email: "Neha@Example.com", display_name: "Neha", role: "writer", language: "hi", section: "sports", days: 90, reason: "Joins the sports desk." };
const ACCOUNT_CASES: Case[] = [
  {
    path: "/api/admin/people", method: "POST", handler: people.POST, body: NEW_PERSON, allowed: HI_MANAGING, wrongScope: EN_MANAGING,
    data: { staff_profiles: { data: null, error: null }, "rpc:access_grant": { data: roleRow({ user_id: "0a1b2c3d-0000-4000-8000-0000000000c1" }), error: null } }, changes: true,
  },
  // A link changes nothing in the database (Supabase Auth makes it); its audit pair is tested below.
  { path: `${P}/password-link`, method: "POST", handler: onPerson(personPasswordLink.POST), body: REASON, allowed: HI_MANAGING, wrongScope: EN_MANAGING, data: IN_PEOPLE(), changes: false },
  // Always two Super Admins: the least-privileged holder who may ask is a Super Admin.
  { path: `${P}/mfa-reset`, method: "POST", handler: onPerson(personMfaReset.POST), body: { reason: "Lost phone; called her on the desk line." }, allowed: SUPER_ADMIN, data: { ...IN_PEOPLE(), access_requests: { data: { ...REQUEST_ROW, kind: "mfa_reset", requested_by: "u-1", details: {} }, error: null } }, changes: true },
];
// ---- Panel 1, M3: break-glass, the access review, what needs a look ----
const bgRow = (over: Record<string, unknown> = {}) => roleRow({ id: "0a1b2c3d-0000-4000-8000-0000000000d1", user_id: "u-1", role_key: "super_admin", language: null, section: null, is_break_glass: true, ...over });
const M3_CASES: Case[] = [
  { path: "/api/admin/people/alerts", method: "GET", handler: peopleAlerts.GET, allowed: HI_MANAGING, data: { staff_profiles: { data: [PROFILE_ROW], error: null }, role_assignments: { data: [roleRow()], error: null } }, changes: false },
  // A Super Admin's own: the least-privileged holder who may start it is a Super Admin.
  { path: "/api/admin/people/break-glass", method: "POST", handler: breakGlass.POST, body: { reason: "Court order at 23:40; no editor reachable." }, allowed: SUPER_ADMIN, data: { role_assignments: { data: [], error: null } }, changes: true },
  { path: "/api/admin/people/break-glass", method: "DELETE", handler: breakGlass.DELETE, allowed: SUPER_ADMIN, data: { role_assignments: { data: [bgRow()], error: null } }, changes: true },
  { path: "/api/admin/people/review", method: "GET", handler: accessReview.GET, allowed: SUPER_ADMIN, data: { staff_profiles: { data: [PROFILE_ROW], error: null }, role_assignments: { data: [roleRow()], error: null }, access_reviews: { data: null, error: null } }, changes: false },
  {
    path: "/api/admin/people/review", method: "POST", handler: accessReview.POST, body: { note: "Quarterly review.", decisions: { [ROW_ID]: "keep" } }, allowed: SUPER_ADMIN,
    data: { staff_profiles: { data: [PROFILE_ROW], error: null }, role_assignments: { data: [roleRow()], error: null }, access_reviews: { data: { id: "rv-1", completed_by: "u-1", completed_at: "2026-11-19T12:00:00Z", note: "Quarterly review." }, error: null } },
    changes: true,
  },
];
CASES.push(...PEOPLE_CASES, ...ACCOUNT_CASES, ...M3_CASES);

describe("break-glass, the access review and what needs a look (Panel 1 design §5 and §6, M3)", () => {
  async function call(c: Case, caller: Grantee, data: Case["data"], body?: unknown) {
    tables = { ...(data ?? {}) };
    signIn("allowed", { ...c, allowed: caller });
    const res = await c.handler(request({ ...c, body: body ?? c.body }));
    return { status: res.status, json: await res.json().catch(() => null) };
  }
  const caseFor = (method: Method, path: string) => [...M3_CASES, ...PEOPLE_CASES].find((c) => c.method === method && c.path === path) as Case;
  const START = caseFor("POST", "/api/admin/people/break-glass");

  test("break-glass is a Super Admin's own: a self-granted super_admin row, break-glass, ending in 2 hours, audited", async () => {
    const r = await call(START, SUPER_ADMIN, START.data);
    expect(r.status).toBe(201);
    const inserted = calls.find(([t, m]) => t === "role_assignments" && m === "insert")?.[2][0] as Record<string, unknown>;
    expect(inserted).toMatchObject({ user_id: "u-1", role_key: "super_admin", is_break_glass: true, granted_by: "u-1", approved_by: null, language: null, section: null });
    expect(Date.parse(inserted.expires_at as string) - Date.parse(inserted.granted_at as string)).toBe(2 * 3_600_000);
    expect((recordAudit as jest.Mock).mock.calls.map(([row]) => [row.action, row.outcome])).toEqual([["access.break_glass_start", "attempted"], ["access.break_glass_start", "succeeded"]]);
  });

  test("a Managing Editor cannot start it; a Super Admin needs a reason, and cannot start a second", async () => {
    expect((await call(START, HI_MANAGING, START.data)).status).toBe(403);
    expect((await call(START, SUPER_ADMIN, START.data, {})).status).toBe(400);
    expect((await call(START, SUPER_ADMIN, { role_assignments: { data: [bgRow()], error: null } })).json.code).toBe("active");
    expect(wrote()).toEqual([]);
  });

  test("ending it early when it is not on says so (409)", async () => {
    const r = await call(caseFor("DELETE", "/api/admin/people/break-glass"), SUPER_ADMIN, { role_assignments: { data: [], error: null } });
    expect(r.json.code).toBe("not_active");
    expect(wrote()).toEqual([]);
  });

  test("with break-glass on, a Super Admin may take a Desk story down; without it, not", async () => {
    const takedown = CASES.find((c) => c.method === "POST" && c.path === `${S}/unpublish`) as Case;
    const published = { stories: story({ workflow_state: "published", published_revision_id: "r-1" }), ...moved };
    const asSuperAdmin = async (withBreakGlass: boolean) => {
      tables = { ...published };
      const record = staff([SUPER_ADMIN]);
      if (withBreakGlass) record.assignments.push({ ...record.assignments[0], id: "as-bg", isBreakGlass: true });
      (readSession as jest.Mock).mockResolvedValue({ kind: "staff", userId: "u-1", aal: "aal2", sessionId: "s-1" });
      (loadStaffRecord as jest.Mock).mockResolvedValue(record);
      const res = await takedown.handler(request(takedown));
      return res.status;
    };
    expect(await asSuperAdmin(false)).toBe(403);
    expect(await asSuperAdmin(true)).toBe(200);
  });

  test("revoking a Super Admin's role ends their break-glass with it", async () => {
    const revoke = caseFor("POST", `${P}/roles/[assignmentId]/revoke`);
    const data = { ...IN_PEOPLE({}, [roleRow({ role_key: "super_admin", language: null, section: null })]), "rpc:is_active_super_admin": { data: true, error: null } };
    // Another active Super Admin exists (the caller), so the role may go.
    tables = { ...data };
    (data.role_assignments.data as unknown[]).push(roleRow({ id: "x-9", user_id: "u-7", role_key: "super_admin", language: null, section: null }));
    const r = await call(revoke, SUPER_ADMIN, data);
    expect(r.status).toBe(200);
    const updates = calls.filter(([t, m]) => t === "role_assignments" && m === "update").map(([, , a]) => (a[0] as { revoke_reason: string }).revoke_reason);
    expect(updates).toEqual([REASON.reason, "Super Admin role revoked"]);
  });

  test("completing the review records a snapshot read from the database, with the marked decisions", async () => {
    const c = caseFor("POST", "/api/admin/people/review");
    const r = await call(c, SUPER_ADMIN, c.data, { note: "Q4.", decisions: { [ROW_ID]: "renew_asked" } });
    expect(r.status).toBe(201);
    const inserted = calls.find(([t, m]) => t === "access_reviews" && m === "insert")?.[2][0] as { snapshot: Array<{ assignmentId: string; decision: string }>; note: string };
    expect(inserted.note).toBe("Q4.");
    expect(inserted.snapshot).toEqual([expect.objectContaining({ assignmentId: ROW_ID, decision: "renew_asked", name: "Ravi" })]);
  });

  test("the review is a Super Admin's; its decisions are checked", async () => {
    const c = caseFor("POST", "/api/admin/people/review");
    expect((await call(c, HI_MANAGING, c.data)).status).toBe(403);
    expect((await call(caseFor("GET", "/api/admin/people/review"), HI_MANAGING, c.data)).status).toBe(403);
    expect((await call(c, SUPER_ADMIN, c.data, { decisions: { [ROW_ID]: "maybe" } })).status).toBe(400);
    expect((await call(c, SUPER_ADMIN, c.data, { decisions: { "not-an-id": "keep" } })).status).toBe(400);
    expect(wrote()).toEqual([]);
  });

  test("what needs a look: a Super Admin sees break-glass in use and the review due; a Managing Editor neither", async () => {
    const c = caseFor("GET", "/api/admin/people/alerts");
    const data = { staff_profiles: { data: [PROFILE_ROW], error: null }, role_assignments: { data: [bgRow({ user_id: PERSON })], error: null }, access_reviews: { data: null, error: null } };
    const sa = await call(c, SUPER_ADMIN, data);
    expect(sa.json.breakGlass).toEqual([expect.objectContaining({ userId: PERSON, name: "Ravi", mine: false })]);
    expect(sa.json.review).toMatchObject({ lastAt: null, overdue: true });
    const me = await call(c, HI_MANAGING, data);
    expect(me.json.breakGlass).toEqual([]);
    expect(me.json.review).toBeNull();
  });

  test("roles ending within 14 days, among the people the caller sees", async () => {
    const c = caseFor("GET", "/api/admin/people/alerts");
    const soon = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const data = {
      staff_profiles: { data: [PROFILE_ROW], error: null },
      role_assignments: { data: [roleRow({ expires_at: soon }), roleRow({ id: "x-5", user_id: "u-8", language: "en", expires_at: soon })], error: null },
    };
    const r = await call(c, HI_MANAGING, data);
    expect(r.json.endingSoon.map((e: { assignmentId: string }) => e.assignmentId)).toEqual([ROW_ID]);
  });
});

describe("adding people, one-time links and lost factors (Panel 1 design §4, M2)", () => {
  async function call(c: Case, caller: Grantee, data: Case["data"], body?: unknown) {
    tables = { ...(data ?? {}) };
    signIn("allowed", { ...c, allowed: caller });
    const res = await c.handler(request({ ...c, body: body ?? c.body }));
    return { status: res.status, json: await res.json().catch(() => null) };
  }
  const caseFor = (method: Method, path: string) => [...ACCOUNT_CASES, ...PEOPLE_CASES].find((c) => c.method === method && c.path === path) as Case;
  const auditText = () => JSON.stringify((recordAudit as jest.Mock).mock.calls);
  const ADD = caseFor("POST", "/api/admin/people");

  test("a Managing Editor adds a Writer to their desk at once: the account (confirmed, no password), the profile, the role, and a link", async () => {
    const r = await call(ADD, HI_MANAGING, ADD.data);
    expect(r.status).toBe(201);
    expect(authAdmin.createUser).toHaveBeenCalledWith({ email: "neha@example.com", email_confirm: true });
    expect(calls.some(([t, m]) => t === "staff_profiles" && m === "upsert")).toBe(true);
    expect(calls.some(([fn]) => fn === "access_grant")).toBe(true);
    expect(authAdmin.generateLink).toHaveBeenCalledWith({ type: "recovery", email: "neha@example.com" });
    expect(r.json.link).toBe("/admin/welcome?token_hash=TOKEN_abcdef0123456789&type=recovery");
    expect(auditText()).not.toContain("TOKEN_abcdef0123456789");
  });

  test("a Super Admin's addition is a request: no account is made until a second Super Admin approves", async () => {
    const r = await call(ADD, SUPER_ADMIN, { access_requests: { data: { ...REQUEST_ROW, kind: "add_person", user_id: null }, error: null } });
    expect(r.status).toBe(202);
    const inserted = calls.find(([t, m]) => t === "access_requests" && m === "insert")?.[2][0] as { kind: string; user_id: string | null; details: Record<string, unknown> };
    expect(inserted).toMatchObject({ kind: "add_person", user_id: null, details: { email: "neha@example.com", display_name: "Neha", role: "writer" } });
    expect(authAdmin.createUser).not.toHaveBeenCalled();
  });

  test("an email that is already staff, a bad email, or a desk the Managing Editor does not hold, is refused", async () => {
    authAdmin.listUsers.mockResolvedValueOnce({ data: { users: [{ id: PERSON, email: "neha@example.com" }] }, error: null });
    expect((await call(ADD, HI_MANAGING, { staff_profiles: { data: PROFILE_ROW, error: null } })).json.code).toBe("staff");
    expect((await call(ADD, HI_MANAGING, ADD.data, { ...NEW_PERSON, email: "not-an-email" })).status).toBe(400);
    expect((await call(ADD, HI_MANAGING, ADD.data, { ...NEW_PERSON, language: "en" })).status).toBe(403);
    expect(authAdmin.createUser).not.toHaveBeenCalled();
    expect(wrote()).toEqual([]);
  });

  test("a password link: a Managing Editor gets it at once for their people, audited without the token", async () => {
    const c = caseFor("POST", `${P}/password-link`);
    const r = await call(c, HI_MANAGING, c.data);
    expect(r.status).toBe(200);
    expect(r.json.link).toContain("/admin/welcome?token_hash=");
    expect((recordAudit as jest.Mock).mock.calls.map(([row]) => [row.action, row.outcome])).toEqual([["staff.password_link", "attempted"], ["staff.password_link", "succeeded"]]);
    expect(auditText()).not.toContain("TOKEN_abcdef0123456789");
  });

  test("a Super Admin asks for a password link; nobody makes one for themselves; not for a suspended person", async () => {
    const c = caseFor("POST", `${P}/password-link`);
    const asked = await call(c, SUPER_ADMIN, { ...IN_PEOPLE(), access_requests: { data: { ...REQUEST_ROW, kind: "password_link" }, error: null } });
    expect(asked.status).toBe(202);
    expect(authAdmin.generateLink).not.toHaveBeenCalled();
    expect((await call(c, HI_MANAGING, IN_PEOPLE({ status: "suspended" }))).json.code).toBe("suspended");
  });

  test("a lost factor is reset only by two Super Admins: a Managing Editor is refused, a Super Admin's is a request", async () => {
    const c = caseFor("POST", `${P}/mfa-reset`);
    expect((await call(c, HI_MANAGING, IN_PEOPLE())).status).toBe(403);
    expect(authAdmin.mfa.deleteFactor).not.toHaveBeenCalled();
    expect((await call(c, SUPER_ADMIN, c.data, {})).status).toBe(400);
    const asked = await call(c, SUPER_ADMIN, c.data);
    expect(asked.status).toBe(202);
    expect(authAdmin.mfa.deleteFactor).not.toHaveBeenCalled();
  });

  const APPROVE = caseFor("POST", "/api/admin/people/requests/[requestId]/approve");
  const approve = (row: Record<string, unknown>) =>
    call(APPROVE, SUPER_ADMIN, { access_requests: { data: { ...REQUEST_ROW, ...row }, error: null }, "rpc:access_decide": { data: { ...REQUEST_ROW, ...row, outcome: "approved" }, error: null } });

  test("approving an addition makes the account first, then decides with its id; the link goes to the approver only", async () => {
    const r = await approve({ kind: "add_person", user_id: null, details: { email: "neha@example.com", display_name: "Neha", role: "writer", language: "hi", section: "sports", days: 90 } });
    expect(r.status).toBe(200);
    expect(authAdmin.createUser).toHaveBeenCalledWith({ email: "neha@example.com", email_confirm: true });
    const decided = calls.find(([fn]) => fn === "access_decide")?.[2][0] as { p_user: string };
    expect(decided.p_user).toBe("0a1b2c3d-0000-4000-8000-0000000000c1");
    expect(r.json.link).toBe("/admin/welcome?token_hash=TOKEN_abcdef0123456789&type=recovery");
    expect(auditText()).not.toContain("TOKEN_abcdef0123456789");
  });

  test("approving a factor reset deletes every factor and ends the sessions, then decides", async () => {
    const r = await approve({ kind: "mfa_reset", details: {} });
    expect(r.status).toBe(200);
    expect(authAdmin.mfa.deleteFactor.mock.calls).toEqual([[{ id: "f-1", userId: PERSON }], [{ id: "f-2", userId: PERSON }]]);
    expect(calls.map(([fn, m]) => (m === "rpc" ? fn : null)).filter(Boolean)).toEqual(["staff_end_sessions", "access_decide"]);
    expect(r.json.link).toBeUndefined();
  });

  test("approving a password link makes one for the person's email", async () => {
    const r = await approve({ kind: "password_link", details: {} });
    expect(authAdmin.generateLink).toHaveBeenCalledWith({ type: "recovery", email: "person@example.com" });
    expect(r.json.link).toContain("/admin/welcome?token_hash=");
  });

  test("declining changes no account", async () => {
    const decline = caseFor("POST", "/api/admin/people/requests/[requestId]/decline");
    await call(decline, SUPER_ADMIN, { access_requests: { data: { ...REQUEST_ROW, kind: "mfa_reset", details: {} }, error: null }, "rpc:access_decide": { data: REQUEST_ROW, error: null } });
    expect(authAdmin.mfa.deleteFactor).not.toHaveBeenCalled();
    expect(authAdmin.generateLink).not.toHaveBeenCalled();
  });
});

describe("people and their roles (Panel 1 design §3)", () => {
  const caseFor = (method: Method, path: string) => PEOPLE_CASES.find((c) => c.method === method && c.path === path) as Case;
  async function call(c: Case, caller: Grantee, data: Case["data"], body?: unknown, userId = "u-1") {
    tables = { ...(data ?? {}) };
    (readSession as jest.Mock).mockResolvedValue({ kind: "staff", userId, aal: "aal2", sessionId: "s-1" });
    (loadStaffRecord as jest.Mock).mockResolvedValue({ ...staff([caller]), userId });
    const res = await c.handler(request({ ...c, body: body ?? c.body }));
    return { status: res.status, json: await res.json().catch(() => null) };
  }
  const audited = () => (recordAudit as jest.Mock).mock.calls.map(([row]) => [row.action, row.outcome]);
  const GRANT = `${P}/roles`;

  test("a Super Admin's grant is a request for a second Super Admin (202): no role is made", async () => {
    const c = caseFor("POST", GRANT);
    const r = await call(c, SUPER_ADMIN, { ...IN_PEOPLE(), access_requests: { data: REQUEST_ROW, error: null } }, { role: "managing_editor", language: null, section: null, days: 365, ...REASON });
    expect(r.status).toBe(202);
    expect(r.json.asked).toBe(true);
    expect(calls.some(([t, m]) => t === "access_requests" && m === "insert")).toBe(true);
    expect(calls.some(([fn]) => fn === "access_grant")).toBe(false);
    expect(audited()).toEqual([["access.request", "attempted"], ["access.request", "succeeded"]]);
  });

  test("a Managing Editor grants up to Desk Editor, in their own scope; never a privileged role, never another desk", async () => {
    const c = caseFor("POST", GRANT);
    expect((await call(c, HI_MANAGING, c.data, { role: "managing_editor", language: "hi", ...REASON })).status).toBe(403);
    expect((await call(c, HI_MANAGING, c.data, { role: "sub_editor", language: "en", section: "sports", ...REASON })).status).toBe(403);
    expect(wrote()).toEqual([]);
  });

  test("a grant is checked: a known role, a language where the role needs one, a known section, 30/90/180/365 days, a reason", async () => {
    const c = caseFor("POST", GRANT);
    for (const body of [
      { role: "crm_mgr", language: null, ...REASON },
      { role: "sub_editor", language: null, ...REASON },
      { role: "sub_editor", language: "hi", section: "politics", ...REASON },
      { role: "sub_editor", language: "hi", days: 45, ...REASON },
      { role: "sub_editor", language: "hi" },
    ]) {
      expect((await call(c, HI_MANAGING, c.data, body)).status).toBe(400);
    }
    expect(wrote()).toEqual([]);
  });

  test("a role the person already holds in that scope is renewed, not granted again (409)", async () => {
    const c = caseFor("POST", GRANT);
    const r = await call(c, HI_MANAGING, c.data, { role: "writer", language: "hi", section: "sports", ...REASON });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("holds");
  });

  test("nobody changes their own access: grant, rename, suspend and revoke are refused for oneself", async () => {
    for (const [method, path, body] of [
      ["POST", GRANT, { role: "sub_editor", language: "hi", ...REASON }],
      ["PATCH", P, { display_name: "Me", ...REASON }],
      ["POST", `${P}/suspend`, REASON],
      ["POST", `${P}/roles/[assignmentId]/revoke`, REASON],
    ] as const) {
      const c = caseFor(method, path);
      const r = await call(c, SUPER_ADMIN, c.data, body, PERSON);
      expect(r.status).toBe(403);
      expect(r.json.code).toBe("own_access");
    }
    expect(wrote()).toEqual([]);
  });

  test("anyone may sign themselves out everywhere", async () => {
    const c = caseFor("POST", `${P}/sign-out`);
    expect((await call(c, HI_MANAGING, c.data, {}, PERSON)).status).toBe(200);
  });

  test("removing access takes one person: a Super Admin revokes and suspends at once, with no request", async () => {
    const revoke = caseFor("POST", `${P}/roles/[assignmentId]/revoke`);
    expect((await call(revoke, SUPER_ADMIN, revoke.data)).status).toBe(200);
    expect(calls.some(([t, m]) => t === "role_assignments" && m === "update")).toBe(true);
    const suspend = caseFor("POST", `${P}/suspend`);
    expect((await call(suspend, SUPER_ADMIN, suspend.data)).status).toBe(200);
    expect(calls.some(([t]) => t === "access_requests")).toBe(false);
  });

  test("a Managing Editor's people: not a Super Admin or a fellow Managing Editor, even in their language", async () => {
    const c = caseFor("POST", `${P}/suspend`);
    const r = await call(c, HI_MANAGING, IN_PEOPLE({}, [roleRow(), roleRow({ id: "x-2", role_key: "managing_editor", section: null })]));
    expect(r.status).toBe(403);
    expect(wrote()).toEqual([]);
  });

  test("the last active Super Admin cannot be suspended or lose the role (409)", async () => {
    const lastAdmin = { ...IN_PEOPLE({}, [roleRow({ role_key: "super_admin", language: null, section: null })]), "rpc:is_active_super_admin": { data: false, error: null } };
    const suspend = caseFor("POST", `${P}/suspend`);
    const r = await call(suspend, SUPER_ADMIN, lastAdmin);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("last_super_admin");
    const revoke = caseFor("POST", `${P}/roles/[assignmentId]/revoke`);
    expect((await call(revoke, SUPER_ADMIN, lastAdmin)).json.code).toBe("last_super_admin");
    expect(wrote()).toEqual([]);
  });

  test("a second Super Admin may remove the first: another one is still active", async () => {
    const other = { ...IN_PEOPLE({}, [roleRow({ role_key: "super_admin", language: null, section: null }), roleRow({ id: "x-3", user_id: "u-7", role_key: "super_admin", language: null, section: null })]), "rpc:is_active_super_admin": { data: true, error: null }, "rpc:staff_end_sessions": { data: 1, error: null } };
    expect((await call(caseFor("POST", `${P}/suspend`), SUPER_ADMIN, other)).status).toBe(200);
  });

  test("a request: the asker cannot decide it, nor the person it is about, nor a Managing Editor", async () => {
    const c = caseFor("POST", "/api/admin/people/requests/[requestId]/approve");
    expect((await call(c, SUPER_ADMIN, { access_requests: { data: { ...REQUEST_ROW, requested_by: "u-1" }, error: null } })).json.code).toBe("four_eyes");
    expect((await call(c, SUPER_ADMIN, { access_requests: { data: { ...REQUEST_ROW, user_id: "u-1" }, error: null } })).json.code).toBe("own_access");
    expect((await call(c, HI_MANAGING, { access_requests: { data: REQUEST_ROW, error: null } })).status).toBe(403);
    expect(wrote()).toEqual([]);
  });

  test("a request that lapsed or was decided cannot be approved (409); only the asker cancels", async () => {
    const approve = caseFor("POST", "/api/admin/people/requests/[requestId]/approve");
    expect((await call(approve, SUPER_ADMIN, { access_requests: { data: { ...REQUEST_ROW, lapses_at: PAST }, error: null } })).json.code).toBe("lapsed");
    expect((await call(approve, SUPER_ADMIN, { access_requests: { data: { ...REQUEST_ROW, decided_at: PAST, outcome: "declined" }, error: null } })).json.code).toBe("decided");
    const cancel = caseFor("POST", "/api/admin/people/requests/[requestId]/cancel");
    expect((await call(cancel, SUPER_ADMIN, { access_requests: { data: REQUEST_ROW, error: null } })).json.code).toBe("not_yours");
    expect(wrote()).toEqual([]);
  });

  test("an approval is one database call, audited as access.approve", async () => {
    const c = caseFor("POST", "/api/admin/people/requests/[requestId]/approve");
    const r = await call(c, SUPER_ADMIN, c.data);
    expect(r.status).toBe(200);
    expect(calls.filter(([, m]) => m === "rpc").map(([fn, , args]) => [fn, args])).toEqual([
      ["access_decide", [{ p_request: REQ_ID, p_decider: "u-1", p_outcome: "approved", p_note: null, p_user: null }]],
    ]);
    expect(audited()).toEqual([["access.approve", "attempted"], ["access.approve", "succeeded"]]);
  });

  test("the directory keeps a Managing Editor to their own desks; a Super Admin sees everyone", async () => {
    const OTHER = "0a1b2c3d-0000-4000-8000-000000000002";
    const data = {
      staff_profiles: { data: [PROFILE_ROW, { ...PROFILE_ROW, user_id: OTHER, display_name: "Meera" }], error: null },
      role_assignments: { data: [roleRow(), roleRow({ id: "x-4", user_id: OTHER, language: "en" })], error: null },
    };
    const c = caseFor("GET", "/api/admin/people");
    expect((await call(c, HI_MANAGING, data)).json.people.map((p: { name: string }) => p.name)).toEqual(["Ravi"]);
    expect((await call(c, SUPER_ADMIN, data)).json.people.map((p: { name: string }) => p.name)).toEqual(["Ravi", "Meera"]);
  });

  test("a person's page says what the caller may do: a Super Admin asks to rename and acts to suspend", async () => {
    const c = caseFor("GET", P);
    const r = await call(c, SUPER_ADMIN, c.data);
    expect(r.json.can).toMatchObject({ rename: "ask", suspend: "act", reactivate: null, grant: "ask", roles: { [ROW_ID]: { renew: "ask", revoke: "act" } } });
    const me = await call(c, HI_MANAGING, c.data);
    expect(me.json.can).toMatchObject({ rename: "act", suspend: "act", grant: "act", roles: { [ROW_ID]: { renew: "act", revoke: "act" } } });
  });
});

/**
 * Routes no one may use yet: every holder's cell is A (a second person approves), and the approval
 * flow comes with a later panel. Refused for every caller, with nothing written.
 */
const REFUSED_FOR_ALL: Array<{ path: keyof typeof ADMIN_ROUTE_RULES; method: Method; handler: (request: NextRequest) => Promise<Response>; holders: Grantee[] }> = [
  {
    path: "/api/admin/db-stats",
    method: "POST",
    handler: dbStats.POST,
    holders: [
      { role: "super_admin", language: null },
      { role: "ingestion_ops", language: null },
    ],
  },
];

function request(c: Case): NextRequest {
  if (c.form) return new NextRequest(`http://localhost:3000${c.path}`, { method: c.method, headers: { "x-forwarded-for": "203.0.113.7" }, body: c.form() });
  const init: { method: string; headers: Record<string, string>; body?: string } = { method: c.method, headers: { "x-forwarded-for": "203.0.113.7" } };
  if (c.body !== undefined) {
    init.body = JSON.stringify(c.body);
    init.headers["content-type"] = "application/json";
  }
  return new NextRequest(`http://localhost:3000${c.path}${c.query ?? ""}`, init);
}

const env = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  calls = [];
  tables = {};
  supabase.from.mockImplementation((name: string) => table(name));
  supabase.rpc.mockImplementation(async (fn: string, args: unknown) => {
    calls.push([fn, "rpc", [args]]);
    return tables[`rpc:${fn}`] ?? { data: null, error: null };
  });
  (recordAudit as jest.Mock).mockResolvedValue("audit-id");
  jest.spyOn(console, "error").mockImplementation(() => {});
  // The sync route calls NewsData.io; a stand-in answers with one article per category.
  process.env.NEWSDATA_API_KEY = "test-key";
  global.fetch = jest.fn(async () => new Response(JSON.stringify({ results: [{ article_id: "n-1", title: "t", link: "https://example.com/n" }] }), { status: 200 })) as typeof fetch;
});

afterEach(() => {
  jest.restoreAllMocks();
  process.env = { ...env };
});

describe("the route walk: every admin route and method on disk is public by name, or guarded and tested", () => {
  const ROOT = path.join(process.cwd(), "apps", "admin", "src", "app", "api", "admin");
  const onDisk: Array<{ path: string; method: string }> = [];
  (function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "route.ts") {
        const url = "/api/admin/" + path.relative(ROOT, dir).split(path.sep).join("/");
        const source = fs.readFileSync(full, "utf8");
        for (const [, name] of source.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\b/g)) {
          onDisk.push({ path: url, method: name });
        }
      }
    }
  })(ROOT);

  const isPublic = (r: { path: string; method: string }) => PUBLIC_ADMIN_ROUTES.some((p) => p.path === r.path && p.method === r.method);
  const isSessionOnly = (r: { path: string; method: string }) => SESSION_ONLY_ADMIN_ROUTES.some((p) => p.path === r.path && p.method === r.method);
  const ruleFor = (r: { path: string; method: string }) =>
    (ADMIN_ROUTE_RULES as Record<string, Partial<Record<string, RouteRule>>>)[r.path]?.[r.method];

  test("the walk found exactly the routes the three lists name", () => {
    const named = new Set([...PUBLIC_ADMIN_ROUTES.map((r) => r.path), ...SESSION_ONLY_ADMIN_ROUTES.map((r) => r.path), ...Object.keys(ADMIN_ROUTE_RULES)]);
    expect(new Set(onDisk.map((r) => r.path))).toEqual(named);
  });

  test.each(onDisk.map((r) => [`${r.method} ${r.path}`, r] as const))("%s is exactly one of: public, session-only, or guarded by a rule", (_name, r) => {
    expect([isPublic(r), isSessionOnly(r), ruleFor(r) !== undefined].filter(Boolean)).toHaveLength(1);
  });

  test("the session-only list is exactly /me, /mfa and, since Panel 1 M2, /password", () => {
    expect(SESSION_ONLY_ADMIN_ROUTES.map((r) => `${r.method} ${r.path}`).sort()).toEqual(["GET /api/admin/me", "POST /api/admin/mfa", "POST /api/admin/password"]);
  });

  test("the public allowlist is exactly sign-in, sign-out and, since Panel 1 M2, opening a one-time link", () => {
    expect(PUBLIC_ADMIN_ROUTES.map((r) => `${r.method} ${r.path}`).sort()).toEqual(
      ["POST /api/admin/login", "POST /api/admin/logout", "POST /api/admin/welcome"].sort()
    );
  });

  test("every rule names a route and method that exists, and has a case in this file", () => {
    const tested = new Set([...CASES, ...REFUSED_FOR_ALL].map((c) => `${c.method} ${c.path}`));
    for (const [route, methods] of Object.entries(ADMIN_ROUTE_RULES)) {
      for (const method of Object.keys(methods)) {
        expect(onDisk).toContainEqual({ path: route, method });
        expect(tested).toContain(`${method} ${route}`);
      }
    }
  });
});

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

  test("DELETE /api/admin/articles/bulk: at most 100 articles; 101 is 400 and nothing is read or written", async () => {
    const c = caseFor("DELETE", "/api/admin/articles/bulk");
    signIn("allowed", c);
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `a-${i}`);
    tables = { articles: { data: [], error: null } };
    const over = await c.handler(request({ ...c, body: { article_ids: ids(101) } }));
    expect(over.status).toBe(400);
    expect((await over.json()).error).toMatch(/more than 100/);
    expect(calls).toEqual([]);
    expect((await c.handler(request({ ...c, body: { article_ids: ids(100) } }))).status).toBe(200);
  });

  test("DELETE /api/admin/articles/bulk: a Sub-editor (no article.bulk_action) is refused", async () => {
    const c = caseFor("DELETE", "/api/admin/articles/bulk");
    tables = { articles: { data: [HINDI_SPORTS], error: null } };
    signIn("allowed", { ...c, allowed: { role: "sub_editor", language: "hi" } });
    const res = await c.handler(request(c));
    expect(res.status).toBe(403);
    expect((await res.json()).required).toBe("article.bulk_action");
  });

  test("POST /api/admin/publish-article: a Sub-editor (article.publish but not publish_direct) is refused", async () => {
    const c = caseFor("POST", "/api/admin/publish-article");
    tables = { ...c.data };
    signIn("allowed", { ...c, allowed: { role: "sub_editor", language: "en", section: "sports" } });
    const res = await c.handler(request(c));
    expect(res.status).toBe(403);
    expect((await res.json()).required).toBe("article.publish_direct");
    expect(wrote()).toEqual([]);
  });

  describe("GET /api/admin/logs", () => {
    const c = () => caseFor("GET", "/api/admin/logs");
    const row = { id: "r-1", seq: 7, at: "2026-11-10T10:00:00Z", actor_type: "staff", actor_label: "Asha", action: "article.edit", outcome: "succeeded", attempt_id: "r-0", entity_type: "article", entity_id: "a-1", language: "hi", section: "sports", reason: null };

    test("reads audit_log, newest first, in the activity log's shape", async () => {
      tables = { audit_log: { data: [row], error: null, count: 1 } };
      signIn("allowed", c());
      const res = await c().handler(request(c()));
      const json = await res.json();
      expect(calls.filter(([t, m]) => t === "audit_log" && m === "order").map(([, , a]) => a)).toEqual([["seq", { ascending: false }]]);
      expect(json).toMatchObject({ source: "audit", total: 1, page: 1 });
      expect(json.logs[0]).toMatchObject({ id: "r-1", action: "article.edit", created_at: "2026-11-10T10:00:00Z", metadata: { actor_label: "Asha", outcome: "succeeded", attempt_id: "r-0" } });
    });

    test("an unscoped holder sees every row: no filter", async () => {
      tables = { audit_log: { data: [], error: null, count: 0 } };
      signIn("allowed", c());
      await c().handler(request(c()));
      expect(calls.filter(([t, m]) => t === "audit_log" && m === "or")).toEqual([]);
    });

    test("a scoped holder (Managing Editor, 'own desk') sees only rows in their scope", async () => {
      tables = { audit_log: { data: [], error: null, count: 0 } };
      signIn("allowed", { ...c(), allowed: { role: "managing_editor", language: "hi", section: "sports" } });
      expect((await c().handler(request(c()))).status).toBe(200);
      expect(calls.filter(([t, m]) => t === "audit_log" && m === "or").map(([, , a]) => a)).toEqual([["and(language.eq.hi,section.eq.sports)"]]);
    });

    test("?source=legacy reads the frozen admin_logs, under the same permission (Q7)", async () => {
      tables = { admin_logs: { data: [], error: null, count: 0 } };
      signIn("allowed", c());
      const res = await c().handler(request({ ...c(), query: "?source=legacy" }));
      expect((await res.json()).source).toBe("legacy");
      expect(calls.some(([t]) => t === "admin_logs")).toBe(true);
      expect(calls.some(([t]) => t === "audit_log")).toBe(false);
    });

    test("there is no DELETE: an append-only log cannot be cleared (Q6)", () => {
      expect("DELETE" in logs).toBe(false);
    });
  });

  test("DELETE /api/admin/articles: an unknown article is 404 (no scope to check it against)", async () => {
    const c = caseFor("DELETE", "/api/admin/articles");
    tables = { articles: { data: null, error: null } };
    signIn("allowed", c);
    expect((await c.handler(request(c))).status).toBe(404);
    expect(wrote()).toEqual([]);
  });
});

describe.each(REFUSED_FOR_ALL.map((r) => [`${r.method} ${r.path}`, r] as const))("%s: refused for everyone until its approval flow exists", (_name, r) => {
  const go = () => r.handler(new NextRequest(`http://localhost:3000${r.path}`, { method: r.method }));

  test.each(r.holders.map((h) => [h.role, h] as const))("%s (the matrix gives it A): 403 needs_approval, nothing written", async (_role, holder) => {
    (readSession as jest.Mock).mockResolvedValue({ kind: "staff", userId: "u-1", aal: "aal2", sessionId: "s-1" });
    (loadStaffRecord as jest.Mock).mockResolvedValue(staff([holder]));
    const res = await go();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("needs_approval");
    expect(wrote()).toEqual([]);
  });

  test("no session: 401", async () => {
    (readSession as jest.Mock).mockResolvedValue(null);
    expect((await go()).status).toBe(401);
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

});

describe("the banner's language (Panel 3 design §3, M1)", () => {
  const caseFor = (method: Method) => CASES.find((c) => c.path === "/api/admin/breaking-news" && c.method === method) as Case;
  async function call(method: Method, caller: Grantee, data: Case["data"], body: unknown) {
    const c = caseFor(method);
    tables = { ...(data ?? {}) };
    signIn("allowed", { ...c, allowed: caller });
    const res = await c.handler(request({ ...c, body }));
    return { status: res.status, json: await res.json().catch(() => null) };
  }
  const HI_DESK_EDITOR: Grantee = { role: "desk_editor", language: "hi" };
  const MANAGING_ALL: Grantee = { role: "managing_editor", language: null };
  const created = (language: string | null) => ({ breaking_news: { data: { id: "b-2", text: "Polls close", is_active: true, expires_at: null, created_at: "2026-11-19T00:00:00Z", language }, error: null } });
  const existing = (language: string | null) => ({ breaking_news: { data: { id: "b-2", text: "Polls close", language }, error: null } });
  const audits = () => (recordAudit as jest.Mock).mock.calls.map(([row]) => row);

  test("an item for both languages is site-wide: a scoped Desk Editor is refused and nothing is written; the Managing Editor (all) sets it", async () => {
    const refused = await call("POST", HI_DESK_EDITOR, created(null), { text: "Polls close", expires_in_hours: 6, language: null });
    expect(refused.status).toBe(403);
    expect(wrote()).toEqual([]);
    const done = await call("POST", MANAGING_ALL, created(null), { text: "Polls close", expires_in_hours: 6, language: null });
    expect(done.status).toBe(200);
    expect(done.json.item.language).toBeNull();
  });

  test("a missing language means both languages, as before Panel 3", async () => {
    const r = await call("POST", HI_DESK_EDITOR, created(null), { text: "Polls close", expires_in_hours: 6 });
    expect(r.status).toBe(403);
  });

  test("a language other than en, hi or null is refused before anything is written", async () => {
    const r = await call("POST", MANAGING_ALL, created(null), { text: "Polls close", language: "fr" });
    expect(r.status).toBe(400);
    expect(wrote()).toEqual([]);
  });

  test("the audit row names the item's language and scope", async () => {
    await call("POST", HI_DESK_EDITOR, created("hi"), { text: "Polls close", expires_in_hours: 6, language: "hi" });
    const set = audits().find((row) => row.action === "breaking_banner.set" && row.outcome === "succeeded");
    expect(set).toMatchObject({ language: "hi" });
  });

  test("removing is decided in the item's own language: the other desk and an item for both are refused", async () => {
    expect((await call("DELETE", { role: "desk_editor", language: "en" }, existing("hi"), { id: "b-2" })).status).toBe(403);
    expect((await call("DELETE", HI_DESK_EDITOR, existing(null), { id: "b-2" })).status).toBe(403);
    expect(wrote()).toEqual([]);
    expect((await call("DELETE", HI_DESK_EDITOR, existing("hi"), { id: "b-2" })).status).toBe(200);
    expect((await call("DELETE", MANAGING_ALL, existing(null), { id: "b-2" })).status).toBe(200);
  });

  test("an unknown item is not found, and nothing changes", async () => {
    const r = await call("DELETE", MANAGING_ALL, { breaking_news: { data: null, error: null } }, { id: "b-9" });
    expect(r.status).toBe(404);
    expect(wrote()).toEqual([]);
  });
});
