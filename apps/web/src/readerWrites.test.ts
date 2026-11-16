/**
 * @jest-environment node
 *
 * R12-03: the reader site should run on the anon key alone, under RLS, with no service-role key in
 * its container. That needs it to write nothing. Since R12-01 the feed only reads, and Phase B
 * (B-05, B-01) removed the scraper, the last write. This keeps it so: no reader file reaches a
 * server write path. The key can leave the reader's container once the owner has applied and
 * checked database/policies.sql (F-008).
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../../..");

// What a reader file may not import: the server's write paths.
const WRITES = /\b(saveArticlesToDB|purgeOldArticles)\b/;

test("no reader file reaches a database write", () => {
  const files = execSync("git ls-files apps/web/src", { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((f) => /\.(ts|tsx|mjs|js)$/.test(f) && !/\.test\.tsx?$/.test(f));
  const writers = files.filter((f) => WRITES.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
  expect(writers).toEqual([]);
});
