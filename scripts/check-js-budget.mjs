// The client JavaScript budget per route (Definition of done, item 12). Reads each app's last
// `next build` (apps/<app>/.next/), sums the JS chunks each page route loads (its own entry chunks, plus the framework
// chunks every page loads: rootMainFiles in the build manifest; polyfills, which only old browsers
// fetch, are left out), and fails if a route is over its budget in
// scripts/js-budget.json (keyed by app), or has no budget: a new route gets one on purpose, never by
// default.
//
//   node scripts/check-js-budget.mjs          check (CI runs this after the build)
//   node scripts/check-js-budget.mjs --print  also print each route's size, budget and headroom
//
// Sizes are raw bytes, as the per-commit reports give them. A budget is the size measured when it
// was set plus 5%, rounded up to the next KiB; raising one is a change with its own evidenced cause,
// like any commit that grows a route's JS by more than 0.5% (the owner's rule).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPS = ["web", "admin"];
const BUDGETS = path.join(ROOT, "scripts", "js-budget.json");

function walk(dir, keep, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, keep, out);
    else if (keep(p)) out.push(p);
  }
  return out;
}

/** { route: bytes } for every page route of the last build. */
export function measure(nextDir) {
  if (!fs.existsSync(path.join(nextDir, "server", "app"))) throw new Error("no build in .next/: run `npm run build` first");
  const size = new Map();
  const bytesOf = (chunk) => {
    if (!size.has(chunk)) {
      const file = path.join(nextDir, chunk.replace(/^\/?_next\//, ""));
      // A chunk a manifest names but the build lacks would count as nothing: refuse to measure.
      if (!fs.existsSync(file)) throw new Error(`${chunk}: named in a manifest, missing from .next/`);
      size.set(chunk, fs.statSync(file).size);
    }
    return size.get(chunk);
  };
  const shared = JSON.parse(fs.readFileSync(path.join(nextDir, "build-manifest.json"), "utf8")).rootMainFiles ?? [];
  const routes = {};
  for (const file of walk(path.join(nextDir, "server", "app"), (p) => p.endsWith("page_client-reference-manifest.js"))) {
    const scope = { __RSC_MANIFEST: {} };
    new Function("globalThis", fs.readFileSync(file, "utf8"))(scope);
    for (const [route, manifest] of Object.entries(scope.__RSC_MANIFEST)) {
      const chunks = new Set([...shared, ...Object.values(manifest.entryJSFiles ?? {}).flat()].map((c) => c.replace(/^\/?_next\//, "")));
      routes[route] = [...chunks].reduce((sum, c) => sum + bytesOf(c), 0);
    }
  }
  if (!Object.keys(routes).length) throw new Error("no page routes found in .next/server/app");
  return routes;
}

/** The routes over budget or without one, and the budgets no route uses. */
export function check(measured, budgets) {
  const problems = [];
  for (const [route, bytes] of Object.entries(measured).sort()) {
    const budget = budgets[route];
    if (budget === undefined) problems.push(`${route}: ${bytes} B and no budget (add one to scripts/js-budget.json)`);
    else if (bytes > budget) problems.push(`${route}: ${bytes} B is over its budget of ${budget} B by ${bytes - budget} B`);
  }
  for (const route of Object.keys(budgets)) if (!(route in measured) && !route.startsWith("$")) problems.push(`${route}: a budget for a route the build no longer has`);
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const budgets = JSON.parse(fs.readFileSync(BUDGETS, "utf8"));
  const problems = [];
  let routes = 0;
  for (const app of APPS) {
    const measured = measure(path.join(ROOT, "apps", app, ".next"));
    const appBudgets = budgets[app] ?? {};
    routes += Object.keys(measured).length;
    if (process.argv.includes("--print")) {
      for (const [route, bytes] of Object.entries(measured).sort()) {
        const budget = appBudgets[route];
        console.log(`${app.padEnd(6)} ${route.padEnd(28)} ${String(bytes).padStart(8)} B   budget ${budget === undefined ? "none" : `${budget} B (${(((budget - bytes) / budget) * 100).toFixed(1)}% headroom)`}`);
      }
    }
    problems.push(...check(measured, appBudgets).map((problem) => `${app} ${problem}`));
  }
  if (problems.length) {
    console.error(`JS budget: ${problems.length} problem(s)\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`JS budget: ${routes} routes in ${APPS.length} apps, each within its budget`);
}
