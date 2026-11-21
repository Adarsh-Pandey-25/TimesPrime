/**
 * @jest-environment node
 *
 * R12-03: the reader site should run on the anon key alone, under RLS, with no service-role key in
 * its container. That needs it to write nothing. Since R12-01 the feed only reads, and Phase B
 * (B-05, B-01) removed the scraper, the last write. This keeps it so: no reader file reaches a
 * server write path. The key can leave the reader's container once the owner has applied and
 * checked database/policies.sql (F-008).
 *
 * Panel 7, M1 (decision 1): the one exception is the grievance form, through submitGrievance, which
 * calls only the database function grievance_submit, which the anon key may run. No table rights.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../../..");

// What a reader file may not import: the server's write paths. The back office's grievance writes
// are here too, by name, so they cannot reach the reader site.
const WRITES = /\b(saveArticlesToDB|purgeOldArticles|enterGrievance|acknowledgeGrievance|assignGrievance|addGrievanceNote|decideGrievance)\b/;
// The one write a reader file may make, and the only file that makes it.
const FORM_WRITE = /\bsubmitGrievance\b/;
const FORM_ROUTE = "apps/web/src/app/api/grievances/route.ts";

const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8").split("\r\n").join("\n");
const readerFiles = () =>
  execSync("git ls-files --cached --others --exclude-standard apps/web/src", { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((f) => /\.(ts|tsx|mjs|js)$/.test(f) && !/\.test\.tsx?$/.test(f));

test("no reader file reaches a database write", () => {
  const writers = readerFiles().filter((f) => WRITES.test(read(f)));
  expect(writers).toEqual([]);
});

test("the grievance form is the one write, from its own route only", () => {
  const files = readerFiles();
  expect(files).toContain(FORM_ROUTE);
  expect(files.filter((f) => FORM_WRITE.test(read(f)))).toEqual([FORM_ROUTE]);
});

test("submitGrievance calls grievance_submit and nothing else", () => {
  const source = read("packages/server/src/repositories/grievances.ts");
  const start = source.indexOf("export function submitGrievance(");
  expect(start).toBeGreaterThan(-1);
  const fn = source.slice(start, source.indexOf("\n}\n", start));
  expect(fn).toContain('call("grievance_submit", {');
  expect(fn).not.toMatch(/\.(from|insert|update|upsert|delete)\(/);
  expect(fn.match(/call\(/g)).toHaveLength(1);
});
