// The back office's permission catalogue as typed constants, so the backend's checks and the admin
// UI cannot name a role or permission that does not exist (the access rules in PANEL_DOCS.md: "The permission-key
// catalogue as typed constants, so frontend and backend cannot drift").
//
// The source of truth is the roles × permissions matrix in the access rules, docs/PANEL_DOCS.md (owner decision D2).
// The database holds the same catalogue, generated from that matrix into
// database/migrations/2026-11-02-access-2-catalog.sql. permissions.test.ts checks all three agree,
// cell by cell. Which role holds which permission is data in the database, read live on every
// request (design, "Approval"); this file holds only the names.

/** The matrix's 15 columns, in its order. */
export const ROLE_KEYS = [
  "super_admin",
  "managing_editor",
  "desk_editor",
  "sub_editor",
  "writer",
  "ingestion_ops",
  "analyst",
  "grievance_officer",
  "legal_compliance",
  "privacy_officer",
  "security_lead",
  "crm_mgr",
  "support",
  "brand_studio",
  "ad_ops",
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

/** The matrix's 31 rows, one key per verb a row names, in the matrix's order. */
export const PERMISSION_KEYS = [
  "article.view_admin",
  "article.create",
  "article.edit",
  "article.submit",
  "article.approve",
  "article.publish",
  "article.publish_direct",
  "article.unpublish",
  "article.takedown",
  "article.restore",
  "article.bulk_action",
  "breaking_banner.manage",
  "push.send",
  "homepage.curate",
  "correction.publish",
  "sponsored.label_remove",
  "sponsored.approve",
  "source.manage",
  "source.kill_switch",
  "sync.run",
  "sync.view",
  "content.purge",
  "ai.configure",
  "stats.view",
  "grievance.handle",
  "grievance.report",
  "legal_order.manage",
  "content_records.export",
  "reader_pii.view",
  "reader_pii.reveal",
  "reader_data.export",
  "dsr.handle",
  "subscription.refund",
  "incident.manage",
  "audit.read",
  "user.manage",
  "role.assign",
  "settings.manage",
  "health.view",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/**
 * A matrix cell's code: F full, S within the assignment's scope, Own own items only, A acts but a
 * second person must approve, R read-only, M masked view. An empty cell is no row at all.
 */
export const ACCESS_CODES = ["F", "S", "Own", "A", "R", "M"] as const;

export type AccessCode = (typeof ACCESS_CODES)[number];

/** Scope languages. Articles store "english"/"hindi"; packages/server/src/auth/scope.ts maps between them (D5). */
export const SCOPE_LANGUAGES = ["en", "hi"] as const;

export type ScopeLanguage = (typeof SCOPE_LANGUAGES)[number];
