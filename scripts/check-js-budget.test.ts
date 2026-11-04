/**
 * @jest-environment node
 *
 * The per-route JS budget's rules (scripts/check-js-budget.mjs), which CI enforces after the build.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { check, measure } from "./check-js-budget.mjs";

describe("check", () => {
  test("within budget: no problems; the $comment key is not a route", () => {
    expect(check({ "/page": 100 }, { $comment: "x", "/page": 100 })).toEqual([]);
  });

  test("one byte over: refused, with the overshoot", () => {
    expect(check({ "/page": 101 }, { "/page": 100 })).toEqual(["/page: 101 B is over its budget of 100 B by 1 B"]);
  });

  test("a route without a budget is refused: a new route gets one on purpose", () => {
    expect(check({ "/new/page": 5 }, {})).toEqual(["/new/page: 5 B and no budget (add one to scripts/js-budget.json)"]);
  });

  test("a budget for a route that is gone is refused, so the file stays true", () => {
    expect(check({}, { "/old/page": 5 })).toEqual(["/old/page: a budget for a route the build no longer has"]);
  });
});

describe("measure", () => {
  const build = (chunks: Record<string, string>, manifest: object, shared: string[]) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsbudget-"));
    fs.mkdirSync(path.join(dir, "static", "chunks"), { recursive: true });
    for (const [name, body] of Object.entries(chunks)) fs.writeFileSync(path.join(dir, "static", "chunks", name), body);
    fs.writeFileSync(path.join(dir, "build-manifest.json"), JSON.stringify({ rootMainFiles: shared }));
    fs.mkdirSync(path.join(dir, "server", "app", "x"), { recursive: true });
    fs.writeFileSync(path.join(dir, "server", "app", "x", "page_client-reference-manifest.js"), `globalThis.__RSC_MANIFEST["/x/page"] = ${JSON.stringify(manifest)};`);
    return dir;
  };

  test("a route's size is its entry chunks plus the shared framework chunks, each counted once", () => {
    const dir = build({ "a.js": "aaaa", "b.js": "bb", "fw.js": "ffffffffff" }, { entryJSFiles: { l: ["static/chunks/a.js", "static/chunks/b.js"], p: ["/_next/static/chunks/a.js"] } }, ["static/chunks/fw.js"]);
    expect(measure(dir)).toEqual({ "/x/page": 16 });
  });

  test("a chunk the manifest names but the build lacks stops the measurement", () => {
    const dir = build({}, { entryJSFiles: { p: ["static/chunks/gone.js"] } }, []);
    expect(() => measure(dir)).toThrow("static/chunks/gone.js: named in a manifest, missing from .next/");
  });
});
