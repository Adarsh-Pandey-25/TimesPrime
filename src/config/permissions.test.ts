/**
 * @jest-environment node
 *
 * The permission catalogue in its three places: the matrix in docs/PERMISSIONS.md (the owner's
 * canonical source, D2), the generated SQL the owner applies, and the typed constants the code
 * uses. The matrix is read here by its own parser, not the generator's, so a generator bug cannot
 * hide by agreeing with itself.
 */

import fs from "fs";
import path from "path";
import { ACCESS_CODES, PERMISSION_KEYS, ROLE_KEYS } from "./permissions";

const read = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), ...p), "utf8").replace(/\r\n/g, "\n");
const plan = read("docs", "PERMISSIONS.md");
const sql = read("database", "migrations", "2026-11-02-access-2-catalog.sql");

const HEADINGS = [
  "Super Admin", "Managing Editor", "Desk Editor", "Sub-editor", "Writer", "Ingestion Ops", "Analyst",
  "Grievance Officer", "Legal/Compliance", "Privacy Officer", "Security Lead", "CRM Mgr (P4)", "Support (P4)",
  "Brand Studio (P4)", "Ad Ops (P4)",
];

interface Cell { role: string; permission: string; access: string; breakGlass: boolean; note: string }

/** Every non-empty cell of the matrix, one per permission key. */
function matrixCells(): { keys: string[]; cells: Cell[] } {
  const lines = plan.split("\n");
  const start = lines.indexOf(lines.find((l) => l.startsWith("| Permission (verb) |")) ?? "");
  const split = (l: string) => l.split("|").slice(1, -1).map((c) => c.trim());
  expect(split(lines[start]).slice(1)).toEqual(HEADINGS);
  const keys: string[] = [];
  const cells: Cell[] = [];
  for (let i = start + 2; lines[i]?.startsWith("|"); i++) {
    const [label, ...row] = split(lines[i]);
    // "article.create / edit" names article.create and article.edit: a bare verb takes the row's object.
    const names = label.replace(/ \(.*\)$/, "").split(" / ");
    const object = names[0].split(".")[0];
    const rowKeys = names.map((n) => (n.includes(".") ? n : `${object}.${n}`));
    keys.push(...rowKeys);
    row.forEach((cell, col) => {
      if (cell === "—") return;
      const [, access, paren] = cell.match(/^(\w+)(?: \((.*)\))?$/) ?? [];
      for (const permission of rowKeys) {
        cells.push({ role: ROLE_KEYS[col], permission, access, breakGlass: paren === "break-glass", note: paren === "break-glass" ? "" : paren ?? "" });
      }
    });
  }
  return { keys, cells };
}

/** The tuples of the `INSERT INTO public.<table> ... VALUES` statement in the catalogue SQL. */
function sqlRows(table: string): string[][] {
  const block = sql.match(new RegExp(`INSERT INTO public\\.${table} \\([^)]*\\) VALUES\\n([\\s\\S]*?)(?:\\nON CONFLICT|;\\n)`));
  if (!block) throw new Error(`no INSERT for ${table}`);
  return block[1].split("\n").map((line) =>
    [...line.matchAll(/'((?:[^']|'')*)'|\b(true|false|\d+)\b/g)].map((m) => (m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2]))
  );
}

const { keys, cells } = matrixCells();

describe("the permission catalogue matches the matrix in docs/PERMISSIONS.md", () => {
  test("the matrix has 31 rows naming 39 permission keys, and the constant lists them in order", () => {
    expect(keys).toHaveLength(39);
    expect([...PERMISSION_KEYS]).toEqual(keys);
  });

  test("the constant has the matrix's 15 roles, and every cell code is a known code", () => {
    expect(ROLE_KEYS).toHaveLength(15);
    for (const c of cells) expect(ACCESS_CODES).toContain(c.access);
  });

  test("the SQL seeds exactly the 15 roles, with the owner's flags (D3) and scope rule", () => {
    const roles = sqlRows("roles").map(([key, label, priv, aal2, scoped]) => ({ key, label, priv, aal2, scoped }));
    expect(roles.map((r) => r.key)).toEqual([...ROLE_KEYS]);
    expect(roles.map((r) => r.label)).toEqual(HEADINGS);
    const flagged = (f: "priv" | "aal2" | "scoped") => roles.filter((r) => r[f] === "true").map((r) => r.key).sort();
    expect(flagged("priv")).toEqual(["legal_compliance", "managing_editor", "privacy_officer", "super_admin"]);
    expect(flagged("aal2")).toEqual(
      ["desk_editor", "ingestion_ops", "legal_compliance", "managing_editor", "privacy_officer", "security_lead", "super_admin"]
    );
    expect(flagged("scoped")).toEqual(["desk_editor", "sub_editor", "writer"]);
  });

  test("the SQL seeds exactly the 39 permissions", () => {
    expect(sqlRows("permissions").map(([key]) => key)).toEqual(keys);
  });

  test("role_permissions is the matrix, cell for cell, in both directions", () => {
    const fromSql = sqlRows("role_permissions").map(([role, permission, access, breakGlass, note]) =>
      JSON.stringify({ role, permission, access, breakGlass: breakGlass === "true", note })
    );
    const fromPlan = cells.map((c) => JSON.stringify(c));
    expect([...fromSql].sort()).toEqual([...fromPlan].sort());
    expect(fromSql).toHaveLength(136);
  });

  test("spot checks against the plan's text", () => {
    const has = (role: string, permission: string) => cells.find((c) => c.role === role && c.permission === permission);
    // "Super Admin holds no editorial verbs by default" — only break-glass takedown.
    expect(has("super_admin", "article.publish")).toBeUndefined();
    expect(has("super_admin", "article.unpublish")).toMatchObject({ access: "F", breakGlass: true });
    // "Bulk purge needs two people": both holders have A.
    expect(cells.filter((c) => c.permission === "content.purge").map((c) => `${c.role}:${c.access}`)).toEqual(["super_admin:A", "ingestion_ops:A"]);
    // user.manage for Managing Editor is scoped, with the plan's limit as its note.
    expect(has("managing_editor", "role.assign")).toMatchObject({ access: "S", note: "assign ≤ Desk Editor in own scope" });
  });
});
