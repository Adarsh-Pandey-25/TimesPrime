/**
 * @jest-environment node
 *
 * F-009: `.env.local.example` listed a variable no code read
 * (ADMIN_SECRET_TOKEN) and left out two the admin login needs. This keeps
 * the two in step: every `process.env.NAME` in the tracked source is named
 * in the example (as a line or a comment), and every variable the example
 * assigns is read somewhere.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const root = process.cwd();
const example = fs.readFileSync(path.join(root, ".env.local.example"), "utf8");

const sources = execSync("git ls-files", { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter((f) => /\.(ts|tsx|js|mjs|cjs)$/.test(f) && !f.startsWith("docs/") && !/\.test\.tsx?$/.test(f));

const read = new Set<string>();
for (const file of sources) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  for (const m of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) read.add(m[1]);
}
// Looked up by name rather than as process.env.NAME.
for (const name of ["NEWSDATA_API_KEY", "ANTHROPIC_API_KEY"]) read.add(name); // packages/server/src/services/health/health.ts checkKey

const assigned = [...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]);

test("every variable the code reads is named in .env.local.example", () => {
  const missing = [...read].filter((name) => !new RegExp(`\\b${name}\\b`).test(example));
  expect(missing).toEqual([]);
});

test("every variable .env.local.example sets is read by the code", () => {
  expect(assigned.filter((name) => !read.has(name))).toEqual([]);
});

// NEXT_PUBLIC_NEWSDATA_API_KEY: the seed route's fallback, removed in BL-029.
test.each(["ADMIN_SECRET_TOKEN", "MEDIASTACK_API_KEY", "NEXT_PUBLIC_NEWSDATA_API_KEY"])("%s, which no code reads, is gone", (name) => {
  expect(read.has(name)).toBe(false);
  expect(example).not.toContain(name);
});

test("ADMIN_PASSWORD and ADMIN_SESSION_SECRET are set in the example", () => {
  expect(assigned).toEqual(expect.arrayContaining(["ADMIN_PASSWORD", "ADMIN_SESSION_SECRET"]));
});
