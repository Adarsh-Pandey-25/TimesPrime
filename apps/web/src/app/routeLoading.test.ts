/**
 * @jest-environment node
 *
 * BL-042: a loading.tsx starts streaming, and a response that has started streaming keeps its 200
 * when the page then calls notFound() (gotcha 3.34). So no loading file may sit above the article
 * or section routes: the root's lives in the (feed) route group, with the pages that want it.
 */

import fs from "fs";
import path from "path";

const APP = __dirname;

test("the root has no loading file; the (feed) group has it", () => {
  expect(fs.existsSync(path.join(APP, "loading.tsx"))).toBe(false);
  expect(fs.existsSync(path.join(APP, "(feed)", "loading.tsx"))).toBe(true);
});

test.each(["article", "[section]"])("no loading file anywhere on the %s route's path", (route) => {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/^loading\.(tsx|ts|jsx|js)$/.test(entry.name)) found.push(path.relative(APP, full));
    }
  };
  walk(path.join(APP, route));
  expect(found).toEqual([]);
});
