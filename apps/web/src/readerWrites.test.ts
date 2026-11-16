/**
 * @jest-environment node
 *
 * R12-03: the reader site should run on the anon key alone, under RLS, with no service-role key in
 * its container. That needs it to write nothing. Since R12-01 the feed only reads; the one write
 * left is the scraper's, which saves a story's scraped full text back into its articles row, and
 * Phase B (B-01) deletes the scraper. Until then this keeps the list of reader files that reach a
 * database write to exactly the scraper's, so no new write can slip in. When Phase B lands, the list
 * is empty and the key can leave the reader's container (owner gate: database/policies.sql applied
 * and checked first, F-008).
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../../..");

// What a reader file may not import: the server's write paths.
const WRITES = /\b(saveArticlesToDB|purgeOldArticles)\b|services\/scrape\b|scrapeArticle\b/;

// The article page stopped scraping in B-05; the scraper's own route goes in B-01.
const ALLOWED_UNTIL_PHASE_B = ["apps/web/src/app/api/news/scrape-article/route.ts"];

test("the only reader file that reaches a database write is the scraper's route, which Phase B removes", () => {
  const files = execSync("git ls-files apps/web/src", { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((f) => /\.(ts|tsx|mjs|js)$/.test(f) && !/\.test\.tsx?$/.test(f));
  const writers = files.filter((f) => WRITES.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
  expect(writers.sort()).toEqual([...ALLOWED_UNTIL_PHASE_B].sort());
});
