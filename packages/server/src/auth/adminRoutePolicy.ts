import "server-only";

import type { PermissionKey } from "@timesprime/shared/config/permissions";
import type { Mode } from "./decide";

// Every admin route and method, and what it needs (design §4). Route bodies take their rule from
// here, so the table and the code cannot disagree. apps/admin/src/app/api/admin/access.test.ts walks apps/web/src/app/api/
// admin/ on disk and fails on any route or method that is neither in ADMIN_ROUTE_RULES nor in
// PUBLIC_ADMIN_ROUTES, so a new route cannot ship unguarded.

/**
 * What a route needs. `permissions`: all of them. `target`: what the scope is checked against:
 * "article" an existing article (loaded by the route), "articles" each of several, "new_article"
 * the article in the request body, "site" a site-wide object (only unscoped grants), "none" a read
 * that lists or totals (any scope), "author" an author record (Panel 2): it belongs to no desk, so
 * holding the permission in any scope will do, which is the matrix's F for a Desk Editor (a
 * site-wide target would admit only unscoped grants, and a Desk Editor always has a language).
 */
export interface RouteRule {
  permissions: readonly PermissionKey[];
  mode: Mode;
  target: "article" | "articles" | "new_article" | "story" | "new_story" | "site" | "none" | "author";
  /**
   * Only a named staff member may use the route: the shared password is refused, whatever its fixed
   * list holds (Panel 2's Desk, design §0: it cannot be an author, an editor or an approver).
   */
  staffOnly?: boolean;
  /**
   * A two-person route (the matrix's A): a holder of A passes the gate, because the route only lets them
   * ask, or decide what someone else asked (Panel 2's restore). It still needs their second factor
   * (decide() answers mfa_required first) and their scope.
   */
  twoPerson?: boolean;
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

/**
 * The only admin routes a request may reach with no session (owner decision D10): signing in and
 * signing out. The homepage banner's public read (CR-08) moved to the reader site
 * (apps/web, GET /api/news/breaking-news) when the admin became its own app. apps/admin/src/proxy.ts
 * reads the same list.
 */
export const PUBLIC_ADMIN_ROUTES: ReadonlyArray<{ path: string; method: Method }> = [
  { path: "/api/admin/login", method: "POST" },
  { path: "/api/admin/logout", method: "POST" },
];

/**
 * Routes that need a session but no permission: a staff member must reach them before they can do
 * anything else. /me says who they are and what they hold (the admin UI hides what they lack);
 * /mfa enrols and verifies their second factor, which an aal1 session must reach to become aal2.
 * The proxy requires a session for them like any other admin route; requireSession checks it.
 */
export const SESSION_ONLY_ADMIN_ROUTES: ReadonlyArray<{ path: string; method: Method }> = [
  { path: "/api/admin/me", method: "GET" },
  { path: "/api/admin/mfa", method: "POST" },
];

/** The admin pages reachable with no session: the sign-in page only. */
export const PUBLIC_ADMIN_PAGES: readonly string[] = ["/admin/login"];

/** True for a request the proxy lets through with no session. */
export function isPublicAdminRequest(pathname: string, method: string): boolean {
  return PUBLIC_ADMIN_PAGES.includes(pathname) || PUBLIC_ADMIN_ROUTES.some((r) => r.path === pathname && r.method === method);
}

export const ADMIN_ROUTE_RULES = {
  "/api/admin/articles": {
    GET: { permissions: ["article.view_admin"], mode: "read", target: "none" },
    PATCH: { permissions: ["article.edit"], mode: "act", target: "article" },
    DELETE: { permissions: ["article.unpublish"], mode: "act", target: "article" },
  },
  "/api/admin/articles/bulk": {
    DELETE: { permissions: ["article.bulk_action", "article.unpublish"], mode: "act", target: "articles" },
  },
  "/api/admin/breaking-news": {
    // The banner manager's list; readers get the same items from the reader site.
    GET: { permissions: ["breaking_banner.manage"], mode: "read", target: "none" },
    POST: { permissions: ["breaking_banner.manage"], mode: "act", target: "site" },
    DELETE: { permissions: ["breaking_banner.manage"], mode: "act", target: "site" },
  },
  "/api/admin/db-stats": {
    GET: { permissions: ["stats.view"], mode: "read", target: "none" },
    // Both holders have A (two people); the approval flow is Panel 4, so this is refused (Q5).
    POST: { permissions: ["content.purge"], mode: "act", target: "site" },
  },
  "/api/admin/health": {
    GET: { permissions: ["health.view"], mode: "read", target: "none" },
  },
  "/api/admin/logs": {
    GET: { permissions: ["audit.read"], mode: "read", target: "none" },
  },
  "/api/admin/publish-article": {
    POST: { permissions: ["article.publish_direct", "article.create"], mode: "act", target: "new_article" },
  },
  "/api/admin/seed-supabase": {
    POST: { permissions: ["sync.run"], mode: "act", target: "site" },
  },
  "/api/admin/stats": {
    GET: { permissions: ["stats.view"], mode: "read", target: "none" },
  },
  // ---- Panel 2, the Desk (design §4): staff only, every story checked against its own desk ----
  // The alert list (design §8): takedowns, for whoever may take stories down, inside their desks.
  "/api/admin/desk/alerts": {
    GET: { permissions: ["article.unpublish"], mode: "read", target: "none", staffOnly: true },
  },
  // Authors (design §7): anyone on the Desk reads the list to credit a story; author.manage changes it.
  "/api/admin/desk/authors": {
    GET: { permissions: ["article.view_admin"], mode: "read", target: "none", staffOnly: true },
    POST: { permissions: ["author.manage"], mode: "act", target: "author", staffOnly: true },
  },
  "/api/admin/desk/authors/[id]": {
    PATCH: { permissions: ["author.manage"], mode: "act", target: "author", staffOnly: true },
  },
  // A story's credits: set with article.edit, in the story's desk, before publication.
  "/api/admin/desk/stories/[id]/credits": {
    POST: { permissions: ["article.edit"], mode: "act", target: "story", staffOnly: true },
  },
  "/api/admin/desk/stories": {
    // The list is filtered to the caller's scopes in the route.
    GET: { permissions: ["article.view_admin"], mode: "read", target: "none", staffOnly: true },
    POST: { permissions: ["article.create"], mode: "act", target: "new_story", staffOnly: true },
  },
  "/api/admin/desk/stories/[id]": {
    GET: { permissions: ["article.view_admin"], mode: "read", target: "story", staffOnly: true },
  },
  "/api/admin/desk/stories/[id]/revisions": {
    GET: { permissions: ["article.view_admin"], mode: "read", target: "story", staffOnly: true },
    POST: { permissions: ["article.edit"], mode: "act", target: "story", staffOnly: true },
  },
  "/api/admin/desk/stories/[id]/revisions/[revisionId]": {
    GET: { permissions: ["article.view_admin"], mode: "read", target: "story", staffOnly: true },
  },
  "/api/admin/desk/stories/[id]/lock": {
    POST: { permissions: ["article.edit"], mode: "act", target: "story", staffOnly: true },
    DELETE: { permissions: ["article.edit"], mode: "act", target: "story", staffOnly: true },
  },
  "/api/admin/desk/stories/[id]/details": {
    POST: { permissions: ["article.edit"], mode: "act", target: "story", staffOnly: true },
  },
  "/api/admin/desk/stories/[id]/assign": {
    POST: { permissions: ["article.edit"], mode: "act", target: "story", staffOnly: true },
  },
  "/api/admin/desk/stories/[id]/submit": {
    POST: { permissions: ["article.submit"], mode: "act", target: "story", staffOnly: true },
  },
  // From desk review the route also checks article.approve (MOVES in packages/shared/src/config/desk.ts).
  "/api/admin/desk/stories/[id]/send-back": {
    POST: { permissions: ["article.submit"], mode: "act", target: "story", staffOnly: true },
  },
  "/api/admin/desk/stories/[id]/approve": {
    POST: { permissions: ["article.approve"], mode: "act", target: "story", staffOnly: true },
  },
  "/api/admin/desk/stories/[id]/schedule": {
    POST: { permissions: ["article.publish"], mode: "act", target: "story", staffOnly: true },
  },
  "/api/admin/desk/stories/[id]/unschedule": {
    POST: { permissions: ["article.publish"], mode: "act", target: "story", staffOnly: true },
  },
  "/api/admin/desk/stories/[id]/publish": {
    POST: { permissions: ["article.publish"], mode: "act", target: "story", staffOnly: true },
  },
  "/api/admin/desk/stories/[id]/publish-direct": {
    POST: { permissions: ["article.publish_direct"], mode: "act", target: "story", staffOnly: true },
  },
  "/api/admin/desk/stories/[id]/unpublish": {
    POST: { permissions: ["article.unpublish"], mode: "act", target: "story", staffOnly: true },
  },
  "/api/admin/desk/stories/[id]/retract": {
    POST: { permissions: ["article.unpublish"], mode: "act", target: "story", staffOnly: true },
  },
  "/api/admin/desk/stories/[id]/restore": {
    POST: { permissions: ["article.restore"], mode: "act", target: "story", staffOnly: true, twoPerson: true },
  },
  // A live story's public correction note: S or F publishes it; A (a Sub-editor) asks, and a holder
  // of S or F decides (pending/[actionId]/decide).
  "/api/admin/desk/stories/[id]/correct": {
    POST: { permissions: ["correction.publish"], mode: "act", target: "story", staffOnly: true, twoPerson: true },
  },
  "/api/admin/desk/pending/[actionId]/decide": {
    POST: { permissions: ["article.restore"], mode: "act", target: "story", staffOnly: true, twoPerson: true },
  },
  "/api/admin/desk/stories/[id]/kill": {
    POST: { permissions: ["article.edit"], mode: "act", target: "story", staffOnly: true },
  },
} as const satisfies Record<string, Partial<Record<Method, RouteRule>>>;
