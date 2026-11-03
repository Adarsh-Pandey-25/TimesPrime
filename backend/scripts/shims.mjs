// The app/ files that hold only re-exports and literal segment config (rule A2,
// docs/architecture.md §5): every route.ts, and every page.tsx except the
// composition pages, which fetch server data and pass it to a view. Read from
// disk, so a new page is held to the rule the day it is created (BL-032).
//
// One list for three readers: check-boundaries.mjs and the lint rule hold these
// files to re-exports, and jest.config.ts leaves them out of coverage (a one-line
// re-export has nothing to cover; V8 counts each as one uncovered function).
//
// Paths are repo-relative with forward slashes, as `git ls-files` prints them.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The repository root: two folders above this file, whatever the working directory.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// The Next.js root (the folder that holds next.config.ts), relative to the repository root.
export const NEXT_ROOT = "frontend/";
export const APP = `${NEXT_ROOT}app`;

// Composition pages: they import backend/ to fetch, then render a frontend view.
export const COMPOSITION_PAGES = [`${APP}/page.tsx`, `${APP}/article/[slug]/page.tsx`];

export function shimFiles(root = REPO) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if ((e.name === "route.ts" || e.name === "page.tsx") && !COMPOSITION_PAGES.includes(rel)) out.push(rel);
    }
  };
  walk(APP);
  return out.sort();
}
