/**
 * @jest-environment node
 *
 * R2: one brand red, #E7000B. Tailwind 4's red-600 is that colour; Tailwind 3's #dc2626, which
 * CSS and inline styles still hard-coded, is gone from both apps and the shared packages.
 */

import fs from "fs";
import path from "path";
import { BRAND_COLOR, BRAND_COLOR_DARK } from "./brand";
import { getCategoryColor } from "./categoryColors";

const ROOT = path.resolve(__dirname, "../../../..");
const SOURCES = ["apps/web/src", "apps/admin/src", "packages/shared/src", "packages/ui/src", "packages/server/src"];

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(full);
    return /\.(tsx?|css|mjs)$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [full] : [];
  });
}

test("the brand colours are the site's red and Tailwind 4's red-700", () => {
  expect(BRAND_COLOR).toBe("#E7000B");
  expect(BRAND_COLOR_DARK).toBe("#C10007");
});

test("no source file hard-codes Tailwind 3's red", () => {
  const offenders = SOURCES.flatMap((dir) => files(path.join(ROOT, dir))).filter((file) =>
    /#dc2626/i.test(fs.readFileSync(file, "utf8"))
  );
  expect(offenders.map((file) => path.relative(ROOT, file))).toEqual([]);
});

test.each(["web", "admin"])("%s's globals.css defines the tokens with the same values", (app) => {
  const css = fs.readFileSync(path.join(ROOT, `apps/${app}/src/app/globals.css`), "utf8");
  expect(css).toContain(`--color-brand: ${BRAND_COLOR};`);
  expect(css).toContain(`--color-brand-dark: ${BRAND_COLOR_DARK};`);
});

test("the top stories and unknown categories take the brand colour", () => {
  expect(getCategoryColor("general")).toBe(BRAND_COLOR);
  expect(getCategoryColor("something-else")).toBe(BRAND_COLOR);
});
