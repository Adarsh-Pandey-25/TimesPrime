// Generates database/migrations/2026-11-02-access-2-catalog.sql from the roles × permissions matrix
// in the panel plan (docs/PANEL_DOCS.md, between its markers), the owner's reference plan (D2: "the
// matrix is canonical").
//
//   node backend/scripts/generate-access-catalog.mjs          write the SQL file
//   node backend/scripts/generate-access-catalog.mjs --check  exit 1 if the file is not what it would write
//
// Each matrix row becomes one permission key per verb it names ("sync.run / sync.view" is two keys
// with the same cells), so every key traces to a row. Each non-empty cell becomes one
// role_permissions row: its code (F, S, Own, A, R, M), "break-glass" as a flag, and any other
// parenthetical as a note. The role flags are the owner's decisions D3 and the plan's rule that only
// Managing Editor and above hold null-scope editorial grants. Design: Panel 0's design in
// docs/PANEL_DOCS.md, §1-2. backend/shared/config/permissions.test.ts checks the result
// independently, cell by cell, against the same matrix.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "..");
const PLAN = path.join(ROOT, "docs", "PANEL_DOCS.md");
const OUT = path.join(ROOT, "database", "migrations", "2026-11-02-access-2-catalog.sql");

// Matrix heading → role key, in the matrix's column order.
const ROLES = [
  // label in the matrix,  key,                privileged, aal2,  scope required, phase
  ["Super Admin",          "super_admin",       true,  true,  false, 1],
  ["Managing Editor",      "managing_editor",   true,  true,  false, 1],
  ["Desk Editor",          "desk_editor",       false, true,  true,  1],
  ["Sub-editor",           "sub_editor",        false, false, true,  1],
  ["Writer",               "writer",            false, false, true,  1],
  ["Ingestion Ops",        "ingestion_ops",     false, true,  false, 1],
  ["Analyst",              "analyst",           false, false, false, 1],
  ["Grievance Officer",    "grievance_officer", false, false, false, 3],
  ["Legal/Compliance",     "legal_compliance",  true,  true,  false, 1],
  ["Privacy Officer",      "privacy_officer",   true,  true,  false, 1],
  ["Security Lead",        "security_lead",     false, true,  false, 1],
  ["CRM Mgr (P4)",         "crm_mgr",           false, false, false, 4],
  ["Support (P4)",         "support",           false, false, false, 4],
  ["Brand Studio (P4)",    "brand_studio",      false, false, false, 4],
  ["Ad Ops (P4)",          "ad_ops",            false, false, false, 4],
];

// Informational in Panel 0 (no check reads it); the design's §1 proposal.
const CRITICAL = new Set([
  "article.publish", "article.publish_direct", "article.unpublish", "article.takedown", "article.restore",
  "article.bulk_action", "breaking_banner.manage", "push.send", "sponsored.label_remove", "source.manage",
  "source.kill_switch", "content.purge", "legal_order.manage", "reader_pii.reveal", "reader_data.export",
  "dsr.handle", "subscription.refund", "user.manage", "role.assign",
]);
const LOW = new Set(["article.view_admin", "article.submit", "sync.view", "stats.view", "grievance.report", "health.view"]);
const risk = (key) => (CRITICAL.has(key) ? "critical" : LOW.has(key) ? "low" : "high");

const CODES = new Set(["F", "S", "Own", "A", "R", "M"]);

// The panel plan, carried byte for byte into PANEL_DOCS.md between these markers.
const PLAN_BEGIN = "<!-- BEGIN:panel-plan -->\n";
const PLAN_END = "<!-- END:panel-plan -->";
export function planBlock(markdown) {
  const text = markdown.replace(/\r\n/g, "\n");
  const begin = text.indexOf(PLAN_BEGIN);
  const end = text.indexOf(PLAN_END);
  if (begin < 0 || end < begin) throw new Error("panel plan markers not found in PANEL_DOCS.md");
  return text.slice(begin + PLAN_BEGIN.length, end);
}

export function parseMatrix(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((l) => l.startsWith("| Permission (verb) |"));
  if (start < 0) throw new Error("matrix header not found in the panel plan");
  const cells = (l) => l.split("|").slice(1, -1).map((c) => c.trim());
  const header = cells(lines[start]).slice(1);
  if (header.join("|") !== ROLES.map((r) => r[0]).join("|")) throw new Error(`matrix columns changed: ${header.join(", ")}`);
  const rows = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith("|")) break;
    const [label, ...row] = cells(line);
    if (row.length !== ROLES.length) throw new Error(`row "${label}" has ${row.length} cells`);
    const m = label.match(/^([a-z_.]+(?: \/ [a-z_.]+)*)(?: \((.*)\))?$/);
    if (!m) throw new Error(`cannot read row label "${label}"`);
    // A bare verb takes the row's object: "article.create / edit" → article.create, article.edit.
    const object = m[1].split(".")[0];
    const keys = m[1].split(" / ").map((k) => (k.includes(".") ? k : `${object}.${k}`));
    const grants = [];
    row.forEach((cell, i) => {
      if (cell === "—") return;
      const c = cell.match(/^(F|S|Own|A|R|M)(?: \((.*)\))?$/);
      if (!c || !CODES.has(c[1])) throw new Error(`cannot read cell "${cell}" in row "${label}"`);
      const breakGlass = c[2] === "break-glass";
      grants.push({ role: ROLES[i][1], access: c[1], breakGlass, note: breakGlass ? "" : c[2] ?? "" });
    });
    rows.push({ label, keys, qualifier: m[2] ?? "", grants });
  }
  return rows;
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

export function renderSql(rows) {
  const out = [];
  out.push(
    "-- TimesPrime: Panel 0, the permission catalogue (roles, permissions, role_permissions).",
    "-- GENERATED by backend/scripts/generate-access-catalog.mjs from the matrix in the panel plan",
    "-- (docs/PANEL_DOCS.md). Do not edit by hand: change the plan (owner) and regenerate.",
    "-- backend/shared/config/permissions.test.ts checks it.",
    "-- Apply in Dashboard -> SQL Editor after 2026-11-02-access-1-foundation.sql (docs/OPERATIONS.md, Runbooks).",
    "-- Idempotent: roles and permissions are upserted, and role_permissions is replaced as a whole, in one",
    "-- transaction, so a re-run converges on exactly the matrix.",
    "",
    "BEGIN;",
    "",
    "INSERT INTO public.roles (key, label, is_privileged, requires_aal2, scope_required, phase) VALUES",
    ROLES.map(([label, key, priv, aal2, scoped, phase]) => `  (${q(key)}, ${q(label)}, ${priv}, ${aal2}, ${scoped}, ${phase})`).join(",\n"),
    "ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, is_privileged = EXCLUDED.is_privileged,",
    "  requires_aal2 = EXCLUDED.requires_aal2, scope_required = EXCLUDED.scope_required, phase = EXCLUDED.phase;",
    "",
    "INSERT INTO public.permissions (key, matrix_row, risk, description) VALUES",
    rows.flatMap((r) => r.keys.map((k) => `  (${q(k)}, ${q(r.label)}, ${q(risk(k))}, ${q(r.qualifier)})`)).join(",\n"),
    "ON CONFLICT (key) DO UPDATE SET matrix_row = EXCLUDED.matrix_row, risk = EXCLUDED.risk,",
    "  description = EXCLUDED.description;",
    "",
    "DELETE FROM public.role_permissions;",
    "INSERT INTO public.role_permissions (role_key, permission_key, access, break_glass_only, note) VALUES",
    rows
      .flatMap((r) => r.keys.flatMap((k) => r.grants.map((g) => `  (${q(g.role)}, ${q(k)}, ${q(g.access)}, ${g.breakGlass}, ${q(g.note)})`)))
      .join(",\n") + ";",
    "",
    "COMMIT;",
    "",
    "-- Verify afterwards (expected counts are from the matrix):",
    `--   SELECT count(*) FROM public.roles;             -- ${ROLES.length}`,
    `--   SELECT count(*) FROM public.permissions;       -- ${rows.reduce((n, r) => n + r.keys.length, 0)}`,
    `--   SELECT count(*) FROM public.role_permissions;  -- ${rows.reduce((n, r) => n + r.keys.length * r.grants.length, 0)}`,
    "--",
    "-- Rollback: this file only seeds data. To undo it, run the rollback in 2026-11-02-access-1-foundation.sql,",
    "-- which drops these tables (only before go-live), or re-apply the previous version of this file.",
    ""
  );
  return out.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))) {
  const sql = renderSql(parseMatrix(planBlock(fs.readFileSync(PLAN, "utf8"))));
  if (process.argv.includes("--check")) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") : "";
    if (current !== sql) { console.error(`${path.relative(ROOT, OUT)} is stale: run node backend/scripts/generate-access-catalog.mjs`); process.exit(1); }
    console.log(`${path.relative(ROOT, OUT)} matches the matrix`);
  } else {
    fs.writeFileSync(OUT, sql);
    console.log(`wrote ${path.relative(ROOT, OUT)}`);
  }
}
