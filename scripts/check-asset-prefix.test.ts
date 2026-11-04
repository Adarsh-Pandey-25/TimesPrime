/**
 * @jest-environment node
 *
 * The asset-prefix build check's rules (scripts/check-asset-prefix.mjs), which CI runs after the
 * build: the back office links /_next/ only under its prefix, and the reader site never links it.
 */

import fs from "fs";
import path from "path";
import { adminAssetPrefix, check, unprefixed } from "./check-asset-prefix.mjs";

const P = "/admin-assets";

describe("unprefixed", () => {
  test("a prefixed link is fine; a bare one is reported", () => {
    expect(unprefixed(`<script src="${P}/_next/static/a.js">`, P)).toEqual([]);
    expect(unprefixed('<script src="/_next/static/a.js">', P)).toEqual(['/_next/static/a.js">']);
  });

  test("counts every bare link, also next to prefixed ones", () => {
    expect(unprefixed(`"${P}/_next/x" "/_next/y" "/_next/z"`, P)).toHaveLength(2);
  });
});

describe("check", () => {
  test("a clean build: no problems", () => {
    expect(check({ adminPages: [["admin.html", `${P}/_next/static/a.js`]], webPages: [["about.html", "/_next/static/b.js"]], prefix: P })).toEqual([]);
  });

  test("an admin page with a bare /_next/ link fails", () => {
    expect(check({ adminPages: [["admin.html", `${P}/_next/a.js /_next/b.js`]], webPages: [], prefix: P })).toEqual([
      `admin admin.html: links /_next/b.js without ${P}`,
    ]);
  });

  test("admin pages that link nothing under the prefix fail: assetPrefix is not set", () => {
    expect(check({ adminPages: [["admin.html", "<html></html>"]], webPages: [], prefix: P })).toEqual([
      `admin: no page links anything under ${P}; is assetPrefix set?`,
    ]);
  });

  test("a reader-site page that links the admin's prefix fails", () => {
    expect(check({ adminPages: [], webPages: [["about.html", `${P}/favicon.png`]], prefix: P })).toEqual([`web about.html: links the admin's ${P}`]);
  });
});

test("the prefix is read from its one definition", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "packages", "shared", "src", "config", "adminAssets.ts"), "utf8");
  expect(adminAssetPrefix(source)).toBe(P);
});
