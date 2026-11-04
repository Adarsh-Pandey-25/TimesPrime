/**
 * @jest-environment node
 *
 * F-009: `.env.example` (then `.env.local.example`) listed a variable no code read
 * (ADMIN_SECRET_TOKEN) and left out two the admin login needs. This keeps
 * the two in step: every `process.env.NAME` in the tracked source is named
 * in the example (as a line or a comment), and every variable the example
 * assigns is read somewhere.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "../../../..");
const example = fs.readFileSync(path.join(root, ".env.example"), "utf8");

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

test("every variable the code reads is named in .env.example", () => {
  const missing = [...read].filter((name) => !new RegExp(`\\b${name}\\b`).test(example));
  expect(missing).toEqual([]);
});

test("every variable .env.example sets is read by the code", () => {
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

// BL-036: the env file is the root .env. A message, warning or usage line that still says
// .env.local sends the reader to a file the setup no longer uses.
test("no source file tells the reader to use .env.local", () => {
  const stale = sources.filter((file) => fs.readFileSync(path.join(root, file), "utf8").includes(".env.local"));
  expect(stale).toEqual([]);
});

// Tests never receive the owner's credentials. The real file is the root .env, which Next also
// loads in the test environment (it skips only .env.local there). .env.test is loaded first, and
// @next/env keeps the first value it finds for a key, an empty one included, so every key .env.test
// empties is never filled from .env. These hold that chain together: the code reads only what
// .env.example names, and .env.test empties all of it.
describe("the test environment", () => {
  const envTest = fs.readFileSync(path.join(root, ".env.test"), "utf8");
  const emptied = [...envTest.matchAll(/^([A-Z][A-Z0-9_]*)=(.*)$/gm)].map((m) => ({ name: m[1], value: m[2].trim() }));

  test(".env.test sets every variable .env.example sets, and no other", () => {
    expect(emptied.map((v) => v.name).sort()).toEqual([...assigned].sort());
  });

  test("every value in .env.test is empty", () => {
    expect(emptied.filter((v) => v.value !== "")).toEqual([]);
  });

  // A variable named in .env.example only in a comment would reach the tests from .env. Only the
  // platform's own variables may be read that way.
  test("the code reads no variable .env.example leaves unset, except the platform's", () => {
    expect([...read].filter((name) => !assigned.includes(name)).sort()).toEqual(["CI", "NEXT_RUNTIME", "NODE_ENV"]);
  });

  test("tests see every variable .env.example sets as empty", () => {
    expect(assigned.filter((name) => process.env[name] !== "")).toEqual([]);
  });

  test("tests do not see a real Supabase project", () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    expect(url === "" ? "" : new URL(url).hostname).not.toMatch(/(^|\.)supabase\.co$/i);
  });
});
