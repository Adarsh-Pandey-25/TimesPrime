// Checks the import rules (docs/architecture.md §5) over the whole import graph.
//
//   node backend/scripts/check-boundaries.mjs
//
// The check builds the real import graph with the TypeScript compiler API, from
// every tracked .ts/.tsx file, and tests every edge against the rules below. Each
// message starts with the ID of the rule it implements. It replaces
// check-move-map.mjs, which tested the same rules through restructure 2's move
// map; restructure 3 has no map, so the files are checked where they are.
//
// It runs in `npm run verify` and CI (`npm run check:boundaries`). ESLint checks
// each import as it is written; this stays for what lint cannot see: the client
// bundle is TRANSITIVE, so a "use client" module that imports a plain module that
// imports backend/ is caught here and nowhere else before the build. It also
// checks that every URL in the built route table still has its app/ file, which
// a linter cannot see either: a missing file cannot be linted.
//
// Exit code 1 on any violation, any file no layer places, or a CR-06 breach.

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import ts from "typescript";

import { NEXT_ROOT, APP, shimFiles } from "./shims.mjs";

const all = execSync("git ls-files", { encoding: "utf8" }).split("\n").map((s) => s.trim()).filter(Boolean);
const tracked = new Set(all);
// Source files in the graph: every tracked .ts/.tsx except tooling configs and declarations.
const files = all.filter(
  (f) => /\.(ts|tsx)$/.test(f) && !/\.d\.ts$/.test(f) && f !== `${NEXT_ROOT}jest.config.ts` && !f.startsWith("backend/scripts/")
);

// tsconfig "paths", longest prefix first, as TypeScript matches them. Targets are
// relative to the tsconfig's own folder, the Next.js root.
const tsconfig = ts.readConfigFile(`${NEXT_ROOT}tsconfig.json`, ts.sys.readFile).config ?? {};
const aliases = Object.entries(tsconfig.compilerOptions?.paths ?? {})
  .filter(([key, to]) => key.endsWith("/*") && to[0]?.endsWith("/*"))
  .map(([key, to]) => [key.slice(0, -1), path.posix.normalize(path.posix.join(NEXT_ROOT || ".", to[0].slice(0, -1))).replace(/^\.\//, "")])
  .sort((a, b) => b[0].length - a[0].length);

function resolve(base) {
  for (const s of [".ts", ".tsx", "/index.ts", "/index.tsx", ""]) if (tracked.has(base + s)) return base + s;
  return null;
}

const edges = [];
const clientRoots = new Set();
const parsed = new Map();
for (const file of files) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  parsed.set(file, sf);
  for (const st of sf.statements) {
    if (!ts.isExpressionStatement(st) || !ts.isStringLiteral(st.expression)) break;
    if (st.expression.text === "use client" && !/\.test\./.test(file)) clientRoots.add(file);
  }
  const visit = (node) => {
    let spec = null;
    let kind = "value";
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      spec = node.moduleSpecifier.text;
      const c = node.importClause;
      const allType = c && !c.name && c.namedBindings && ts.isNamedImports(c.namedBindings) &&
        c.namedBindings.elements.length > 0 && c.namedBindings.elements.every((e) => e.isTypeOnly);
      if (c && (c.isTypeOnly || allType)) kind = "type";
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      spec = node.moduleSpecifier.text;
      if (node.isTypeOnly) kind = "type";
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      spec = node.arguments[0].text;
      kind = "dynamic";
    }
    if (spec) {
      let to = null;
      const alias = aliases.find(([prefix]) => spec.startsWith(prefix));
      if (alias) to = resolve(alias[1] + spec.slice(alias[0].length));
      else if (spec.startsWith(".")) to = resolve(path.posix.join(path.posix.dirname(file), spec));
      if (to && to !== file) edges.push({ from: file, to, kind });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// Client bundle: closure over non-type edges from every "use client" module.
const bundle = new Set(clientRoots);
for (let grew = true; grew;) {
  grew = false;
  for (const e of edges) {
    if (e.kind !== "type" && bundle.has(e.from) && !bundle.has(e.to)) { bundle.add(e.to); grew = true; }
  }
}

// Layers. The Next.js root files come first: once the root is frontend/, they sit inside it.
const CLIENT_ROOT = `${NEXT_ROOT}instrumentation-client.ts`;
const PINNED = new Set(["instrumentation.ts", "instrumentation-client.ts", "sentry.server.config.ts", "sentry.edge.config.ts"].map((f) => NEXT_ROOT + f));
function layer(p) {
  let m;
  if (p.startsWith(`${APP}/`)) return "app";
  if (p === `${NEXT_ROOT}proxy.ts`) return "proxy";
  if (PINNED.has(p)) return "pinned";
  if (p === `${NEXT_ROOT}next.config.ts`) return "next-config";
  if ((m = p.match(/^frontend\/features\/([^/]+)\//))) return "fe-feature:" + m[1];
  if (p.startsWith("frontend/views/")) return "fe-views";
  if (p.startsWith("frontend/components/ui/")) return "fe-ui";
  if (p.startsWith("frontend/context/")) return "fe-context";
  if (p.startsWith("frontend/")) return "fe-other";
  if (p.startsWith("backend/shared/config/")) return "sh-config";
  if (p.startsWith("backend/shared/types/")) return "sh-types";
  if (p.startsWith("backend/shared/validation/")) return "sh-validation";
  if ((m = p.match(/^backend\/services\/([^/]+)\//))) return "be-service:" + m[1];
  if (p.startsWith("backend/api/")) return "be-api";
  if (p.startsWith("backend/repositories/")) return "be-repositories";
  if (p.startsWith("backend/auth/")) return "be-auth";
  if (p.startsWith("backend/lib/")) return "be-lib";
  if (p.startsWith("database/")) return "database";
  return "unmapped";
}
const side = (l) => (l.startsWith("fe-") ? "frontend" : l.startsWith("be-") ? "backend" : l.startsWith("sh-") ? "shared" : l);
const isTest = (f) => /\.test\.tsx?$/.test(f);

// A1: the backend modules app/ may import, besides backend/api/ and backend/shared/.
// They are the entry points the composition pages fetch through.
const APP_BACKEND_ENTRIES = new Set(["backend/services/news/index.ts", "backend/services/scrape/scrapeArticle.ts"]);

const entryOf = (l) => {
  let m;
  if ((m = l.match(/^fe-feature:(.+)$/))) return `frontend/features/${m[1]}/index.ts`;
  if ((m = l.match(/^be-service:(.+)$/)) && tracked.has(`backend/services/${m[1]}/index.ts`)) return `backend/services/${m[1]}/index.ts`;
  return null;
};

const violations = [];
const unmapped = files.filter((f) => layer(f) === "unmapped");

for (const e of edges) {
  const a = e.from;
  const b = e.to;
  const la = layer(a);
  const lb = layer(b);
  const sa = side(la);
  const sb = side(lb);
  const test = isTest(a);
  let rule = null;
  if (lb === "database") rule = "D1 nothing imports database/";
  // A1: app/ is the only place frontend and backend meet. Nothing else imports
  // app/, app/ reaches backend/ only through its API bodies and the composition
  // entry points, and the root files Next pins in place each keep to one side.
  else if (lb === "app" && la !== "app") rule = "A1 nothing outside app/ imports app/";
  else if (la === "app" && sb === "backend" && lb !== "be-api" && !APP_BACKEND_ENTRIES.has(b))
    rule = "A1 app/ imports from backend/ only backend/api, backend/shared and the composition entry points";
  else if (a === CLIENT_ROOT && sb === "backend") rule = "A1 instrumentation-client.ts (browser) never imports backend/";
  else if (la === "pinned" && a !== CLIENT_ROOT && sb === "frontend") rule = "A1 server instrumentation never imports frontend/";
  else if (sa === "frontend" && sb === "backend") rule = "F1 frontend never imports backend (backend/shared excepted)";
  else if (sa === "backend" && sb === "frontend") rule = "B1 backend never imports frontend";
  else if (sa === "shared" && ["frontend", "backend", "app"].includes(sb)) rule = "S1 backend/shared imports no frontend/, backend/ or app/";
  else if (la === "proxy" && !(lb === "be-auth" || sb === "shared")) rule = "P1 proxy imports only backend/auth and backend/shared";
  else if (la === "next-config" && lb !== "sh-config") rule = "CR-06 next.config.ts imports only backend/shared/config";
  else if (la.startsWith("fe-feature:") && lb.startsWith("fe-feature:") && la !== lb) rule = "X1 no cross-feature imports (frontend)";
  else if (la.startsWith("be-service:") && lb.startsWith("be-service:") && la !== lb) rule = "X1 no cross-service imports (backend)";
  // V1: a view composes features through their entry points, so a feature that
  // imports a view closes a cycle (view -> news entry -> view).
  else if (la.startsWith("fe-feature:") && lb === "fe-views") rule = "V1 features never import views";
  else if (["fe-ui", "fe-context"].includes(la) && (lb.startsWith("fe-feature:") || lb === "fe-views")) rule = `R3 ${la} never imports features or views`;
  // Theme is appearance, so a primitive may read it; language, UI strings and
  // category data are app state or product knowledge, so it may not.
  else if (!test && la === "fe-ui" && !(["fe-ui", "sh-types", "sh-validation"].includes(lb) || b === "frontend/context/ThemeContext.tsx"))
    rule = "R5 ui imports only ui/, shared/types, shared/validation and ThemeContext";
  else if (!test && la === "fe-context" && !["fe-context", "sh-config", "sh-types"].includes(lb)) rule = "R9 context imports only shared config/types";
  else if (!test && la === "sh-config" && !["sh-config", "sh-types"].includes(lb)) rule = "R7 config imports only config/types";
  else if (!test && la === "sh-types" && lb !== "sh-types") rule = "R7 types import only types";
  else if (!test && la === "be-lib") rule = "LIB backend/lib imports no project module";
  else if (e.kind !== "type" && bundle.has(a) && (sb === "backend" || lb === "database")) rule = "F1 client bundle never reaches backend/ (transitive)";
  if (rule) {
    violations.push({ rule, key: `${a} -> ${b}`, kind: e.kind });
    continue;
  }
  // X1, public entry points only: from outside a feature (or a service that has
  // an index.ts), import its entry, never a file inside it.
  const entry = entryOf(lb);
  if (entry && la !== lb && b !== entry && !test) violations.push({ rule: "X1 public entry points only", key: `${a} -> ${b} (use ${entry})`, kind: e.kind });
}

// A2 — app/ route files, and every page but the composition pages, hold only
// re-exports and literal segment config.
const SEGMENT_CONFIG = new Set(["dynamic", "dynamicParams", "revalidate", "fetchCache", "runtime", "preferredRegion", "maxDuration"]);
const isLiteral = (n) =>
  ts.isStringLiteral(n) || ts.isNumericLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ||
  n.kind === ts.SyntaxKind.TrueKeyword || n.kind === ts.SyntaxKind.FalseKeyword ||
  (ts.isArrayLiteralExpression(n) && n.elements.every(isLiteral));
function shimProblem(file) {
  for (const st of parsed.get(file).statements) {
    if (ts.isExportDeclaration(st) && st.moduleSpecifier) continue;
    if (ts.isVariableStatement(st) && st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
      st.declarationList.declarations.every((d) => ts.isIdentifier(d.name) && SEGMENT_CONFIG.has(d.name.text) && d.initializer && isLiteral(d.initializer)))
      continue;
    return `statement at line ${parsed.get(file).getLineAndCharacterOfPosition(st.getStart()).line + 1} is not a re-export or literal segment config`;
  }
  return null;
}
const shims = shimFiles();
for (const f of shims) {
  const problem = tracked.has(f) ? shimProblem(f) : "not tracked";
  if (problem) violations.push({ rule: "A2 app/ route and page files hold only re-exports and literal segment config", key: `${f}: ${problem}`, kind: "value" });
}

// A2 — every URL in the built route table keeps its app/ file. Next's own
// routes (/_not-found, /_global-error) have none.
const ROUTES = "backend/scripts/baseline-routes.txt";
const urls = fs.readFileSync(ROUTES, "utf8").split(/\r?\n/).map((l) => l.match(/^[fo]  (\/\S*)$/)?.[1]).filter(Boolean);
for (const url of urls.filter((u) => !u.startsWith("/_"))) {
  const dir = url === "/" ? APP : `${APP}${url}`;
  if (!tracked.has(`${dir}/page.tsx`) && !tracked.has(`${dir}/route.ts`))
    violations.push({ rule: "A2 a URL in the route table has no app/ file", key: `${url} (${ROUTES})`, kind: "value" });
}

const IMAGE_DOMAINS = "backend/shared/config/imageDomains.ts";
const imageDomainsImports = edges.filter((e) => e.from === IMAGE_DOMAINS).length;

console.log(`${files.length} files · ${edges.length} import edges · ${bundle.size} modules in the client bundle · ${shims.length} A2 shims · ${urls.length} route-table URLs`);
console.log(`CR-06: imageDomains.ts imports ${imageDomainsImports} module(s) — ${imageDomainsImports === 0 ? "OK" : "VIOLATION"}`);
if (unmapped.length) console.log(`UNMAPPED — in no layer:\n  ${unmapped.join("\n  ")}`);
for (const v of violations) console.log(`VIOLATION  ${v.rule.padEnd(60)} ${v.key}${v.kind !== "value" ? ` (${v.kind})` : ""}`);
console.log(`\n${violations.length} violation(s)`);
process.exit(violations.length || unmapped.length || imageDomainsImports ? 1 : 0);
