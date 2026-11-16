// The back office's asset prefix, checked on the build (R1-04). One CloudFront distribution serves
// both apps and sends /_next/* to the reader site; the back office's files are reachable only
// under its prefix (packages/shared/src/config/adminAssets.ts). A page that links /_next/...
// without it would load the reader site's files, or none. This reads each app's last
// `next build` and fails if:
//   - an admin page (HTML, RSC payload or segment) links /_next/ without the prefix;
//   - an admin page links nothing under the prefix (the prefix is not applied at all);
//   - a reader-site page links the admin's prefix.
//
//   node scripts/check-asset-prefix.mjs      (CI and `npm run verify` run it after the build)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The prefix, read from its one definition. */
export function adminAssetPrefix(source) {
  const match = /ADMIN_ASSET_PREFIX\s*=\s*"([^"]+)"/.exec(source);
  if (!match) throw new Error("packages/shared/src/config/adminAssets.ts: ADMIN_ASSET_PREFIX not found");
  return match[1];
}

/** Each "/_next/" in the text that the prefix does not come right before. */
export function unprefixed(text, prefix) {
  const found = [];
  for (let i = text.indexOf("/_next/"); i !== -1; i = text.indexOf("/_next/", i + 1)) {
    if (text.slice(Math.max(0, i - prefix.length), i) !== prefix) found.push(text.slice(i, i + 60));
  }
  return found;
}

function pages(nextDir) {
  const dir = path.join(nextDir, "server", "app");
  if (!fs.existsSync(dir)) throw new Error(`${path.relative(ROOT, nextDir)}: no build, run \`npm run build\` first`);
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(html|rsc)$/.test(e.name)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** The problems in the two apps' built pages. */
export function check({ adminPages, webPages, prefix }) {
  const problems = [];
  let linked = 0;
  for (const [file, text] of adminPages) {
    linked += text.split(`${prefix}/_next/`).length - 1;
    for (const hit of unprefixed(text, prefix)) problems.push(`admin ${file}: links ${hit} without ${prefix}`);
  }
  if (adminPages.length && linked === 0) problems.push(`admin: no page links anything under ${prefix}; is assetPrefix set?`);
  for (const [file, text] of webPages) if (text.includes(prefix)) problems.push(`web ${file}: links the admin's ${prefix}`);
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const prefix = adminAssetPrefix(fs.readFileSync(path.join(ROOT, "packages", "shared", "src", "config", "adminAssets.ts"), "utf8"));
  const read = (app) => pages(path.join(ROOT, "apps", app, ".next")).map((f) => [path.relative(ROOT, f), fs.readFileSync(f, "utf8")]);
  const adminPages = read("admin");
  const webPages = read("web");
  const problems = check({ adminPages, webPages, prefix });
  if (problems.length) {
    console.error(`Asset prefix: ${problems.length} problem(s)\n  ${problems.slice(0, 20).join("\n  ")}`);
    process.exit(1);
  }
  console.log(`Asset prefix: ${adminPages.length} admin pages link /_next/ only under ${prefix}; ${webPages.length} reader-site pages never link it`);
}
