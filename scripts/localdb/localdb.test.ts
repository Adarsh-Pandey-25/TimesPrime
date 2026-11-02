/**
 * @jest-environment node
 *
 * The local-database guard and the launcher's completeness check (scripts/localdb). `.env.local` may
 * point at production, so these are what stand between a local run and that database.
 */

import path from "path";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";

import { checkTarget, checkEnv } from "./guard.mjs";
import { parseEnv, requiredKeys, missingKeys } from "./env.mjs";

describe("the guard", () => {
  test.each([
    ["http://127.0.0.1:54321"],
    ["http://localhost:54321"],
    ["postgresql://postgres:postgres@127.0.0.1:54322/postgres"],
  ])("allows the local stack: %s", (url) => {
    expect(checkTarget(url).ok).toBe(true);
  });

  test("refuses the project .env.local names, by its ref, wherever it appears", () => {
    expect(checkTarget("https://yhjotyxrdaqtcgsxigok.supabase.co")).toMatchObject({ ok: false, reason: expect.stringMatching(/production/) });
    expect(checkTarget("postgresql://postgres:x@db.yhjotyxrdaqtcgsxigok.supabase.co:5432/postgres")).toMatchObject({ ok: false });
  });

  test.each([
    ["https://abcdefghijklmnopqrst.supabase.co"],
    ["https://example.com"],
    ["http://10.0.0.5:54321"],
    [""],
    ["not a url"],
  ])("refuses anything else: %j", (url) => {
    expect(checkTarget(url).ok).toBe(false);
  });

  test("checkEnv checks the API URL and the Postgres URL; either one refused refuses the run", () => {
    expect(checkEnv({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", LOCAL_DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" }).ok).toBe(true);
    expect(checkEnv({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", LOCAL_DB_URL: "postgresql://u:p@db.abcd.supabase.co:5432/postgres" }).ok).toBe(false);
    expect(checkEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co" }).message).toMatch(/^REFUSED/);
  });

  test("its message names the host, never a key", () => {
    const verdict = checkEnv({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SERVICE_ROLE_KEY: "secret-value" });
    expect(verdict.message).not.toContain("secret-value");
  });
});

describe("the launcher's completeness check", () => {
  test("every variable .env.local.example sets must be in .env.localdb, or it would come from .env.local", () => {
    const required = requiredKeys("A=1\n# B=2\nC=\n");
    expect(required).toEqual(["A", "C"]);
    expect(missingKeys(parseEnv("A=x\n"), required)).toEqual(["C"]);
    expect(missingKeys(parseEnv("A=x\nC=\n"), required)).toEqual([]);
  });

  test(".env.localdb.example sets every variable .env.local.example sets", () => {
    const root = process.cwd();
    const required = requiredKeys(fs.readFileSync(path.join(root, ".env.local.example"), "utf8"));
    const template = parseEnv(fs.readFileSync(path.join(root, ".env.localdb.example"), "utf8"));
    expect(missingKeys(template, required)).toEqual([]);
    expect(checkEnv(template).ok).toBe(true);
  });

  test("the launcher refuses to start with a missing variable, and with a production URL", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "localdb-"));
    const template = fs.readFileSync(path.join(process.cwd(), ".env.localdb.example"), "utf8");
    const run = (text: string) => {
      const file = path.join(dir, "env");
      fs.writeFileSync(file, text);
      try {
        execFileSync(process.execPath, ["scripts/localdb/run.mjs", "--env-file", file, "next", "--version"], { cwd: process.cwd(), stdio: "pipe" });
        return 0;
      } catch (err) {
        return (err as { status: number }).status;
      }
    };
    expect(run(template.replace(/^NEWSDATA_API_KEY=.*$/m, ""))).toBe(2);
    expect(run(template.replace(/^NEXT_PUBLIC_SUPABASE_URL=.*$/m, "NEXT_PUBLIC_SUPABASE_URL=https://yhjotyxrdaqtcgsxigok.supabase.co"))).toBe(3);
    expect(run(template)).toBe(0);
  });
});
