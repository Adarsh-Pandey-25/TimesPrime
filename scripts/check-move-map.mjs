// Validates move map v2 (scripts/move-map.mjs) against the import rules —
// before, during and after the moves of restructure 2.
//
//   node scripts/check-move-map.mjs          # check the map, list violations
//   node scripts/check-move-map.mjs --plan   # print each slice's moves and checklist (Markdown)
//
// The check builds the real import graph with the TypeScript compiler API,
// relocates every file to its final path, and tests every edge against the
// rules below (F1–X1 from the restructure-2 plan, V1, and the restructure-1
// rules that still apply). Restructure 1's version of this check found its first
// draft broke the rules 21 times before a single file moved; the same idea
// applies here.
//
// It runs in `npm run verify` and CI (`npm run check:boundaries`). ESLint
// checks each import as it is written; this stays for what lint cannot see:
// the client bundle is TRANSITIVE, so a "use client" module that imports a
// plain module that imports backend/ is caught here and nowhere else before
// the build.
//
// Exit code 1 on any violation not listed in KNOWN, any file the map does not
// place, or a CR-06 breach; 2 if the map names a file that exists nowhere.

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import ts from "typescript";

import { MOVES, KNOWN, SLICE_NAMES, SLICE_CHECKLIST } from "./move-map.mjs";

const all = execSync("git ls-files", { encoding: "utf8" }).split("\n").map((s) => s.trim()).filter(Boolean);
const tracked = new Set(all);
// Source files in the graph: every tracked .ts/.tsx except tooling configs and declarations.
const files = all.filter(
  (f) => /\.(ts|tsx)$/.test(f) && !/\.d\.ts$/.test(f) && !/^(jest\.config|jest\.setup)\.ts$/.test(f) && !f.startsWith("scripts/")
);

// Slice 1 lifts src/ to the root, so a pending move's file may sit at src/x or at x.
const lift = (p) => p.replace(/^src\//, "");

// A move whose final path exists is done; the file is checked where it lives,
// and anything later found at its old path is a new file (a re-export shim).
const target = new Map();
const doneMoves = new Set();
let done = 0;
for (const [from, to] of MOVES) {
  if (tracked.has(to)) { done++; doneMoves.add(from); continue; }
  const present = [from, lift(from)].filter((p) => tracked.has(p));
  if (!present.length) {
    console.error(`map lists a file that exists at neither path: ${from} -> ${to}`);
    process.exit(2);
  }
  for (const p of present) target.set(p, to);
}
const pending = MOVES.length - done;
const where = (f) => target.get(f) ?? f;
const isPending = (f) => target.has(f);

// tsconfig "paths", longest prefix first, as TypeScript matches them.
const tsconfig = ts.readConfigFile("tsconfig.json", ts.sys.readFile).config ?? {};
const aliases = Object.entries(tsconfig.compilerOptions?.paths ?? {})
  .filter(([key, to]) => key.endsWith("/*") && to[0]?.endsWith("/*"))
  .map(([key, to]) => [key.slice(0, -1), path.posix.normalize(to[0].slice(0, -1)).replace(/^\.\//, "")])
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

// Layers, by FINAL path.
function layer(p) {
  let m;
  if (p.startsWith("app/")) return "app";
  if ((m = p.match(/^frontend\/features\/([^/]+)\//))) return "fe-feature:" + m[1];
  if (p.startsWith("frontend/views/")) return "fe-views";
  if (p.startsWith("frontend/components/ui/")) return "fe-ui";
  if (p.startsWith("frontend/context/")) return "fe-context";
  if (p.startsWith("frontend/")) return "fe-other";
  if ((m = p.match(/^backend\/services\/([^/]+)\//))) return "be-service:" + m[1];
  if (p.startsWith("backend/api/")) return "be-api";
  if (p.startsWith("backend/repositories/")) return "be-repositories";
  if (p.startsWith("backend/auth/")) return "be-auth";
  if (p.startsWith("backend/lib/")) return "be-lib";
  if (p.startsWith("backend/jobs/")) return "be-jobs";
  if (p.startsWith("shared/config/")) return "sh-config";
  if (p.startsWith("shared/types/")) return "sh-types";
  if (p.startsWith("shared/validation/")) return "sh-validation";
  if (p.startsWith("database/")) return "database";
  if (p === "proxy.ts") return "proxy";
  if (/^(instrumentation(-client)?|sentry\.(server|edge)\.config)\.ts$/.test(p)) return "pinned";
  if (p === "next.config.ts") return "next-config";
  return "unmapped";
}
const side = (l) => (l.startsWith("fe-") ? "frontend" : l.startsWith("be-") ? "backend" : l.startsWith("sh-") ? "shared" : l);
const isTest = (f) => /\.test\.tsx?$/.test(f);

// The final set of files, to know which features and services have an entry point.
const finalFiles = new Set(files.map(where));
const entryOf = (l) => {
  let m;
  if ((m = l.match(/^fe-feature:(.+)$/))) return `frontend/features/${m[1]}/index.ts`;
  if ((m = l.match(/^be-service:(.+)$/)) && finalFiles.has(`backend/services/${m[1]}/index.ts`)) return `backend/services/${m[1]}/index.ts`;
  return null;
};

const violations = [];
const rewrites = [];
const unmapped = new Set();
for (const f of files) if (layer(where(f)) === "unmapped") unmapped.add(f);

for (const e of edges) {
  const a = where(e.from);
  const b = where(e.to);
  const la = layer(a);
  const lb = layer(b);
  const sa = side(la);
  const sb = side(lb);
  const test = isTest(e.from);
  let rule = null;
  if (lb === "database") rule = "D1 nothing imports database/";
  // A1: app/ is the only place frontend and backend meet. Nothing else imports
  // app/, and the root files Next pins in place each keep to one side.
  else if (lb === "app" && la !== "app") rule = "A1 nothing outside app/ imports app/";
  else if (a === "instrumentation-client.ts" && sb === "backend") rule = "A1 instrumentation-client.ts (browser) never imports backend/";
  else if (la === "pinned" && a !== "instrumentation-client.ts" && sb === "frontend") rule = "A1 server instrumentation never imports frontend/";
  else if (sa === "frontend" && sb === "backend") rule = "F1 frontend never imports backend";
  else if (sa === "backend" && sb === "frontend") rule = "B1 backend never imports frontend";
  else if (sa === "shared" && ["frontend", "backend", "app"].includes(sb)) rule = "S1 shared imports no frontend/backend/app";
  else if (la === "proxy" && !(lb === "be-auth" || sb === "shared")) rule = "P1 proxy imports only backend/auth and shared/";
  else if (la === "next-config" && lb !== "sh-config") rule = "CR-06 next.config.ts imports only shared/config";
  else if (la.startsWith("fe-feature:") && lb.startsWith("fe-feature:") && la !== lb) rule = "X1 no cross-feature imports (frontend)";
  else if (la.startsWith("be-service:") && lb.startsWith("be-service:") && la !== lb) rule = "X1 no cross-service imports (backend)";
  // V1: a view composes features through their entry points, so a feature that
  // imports a view closes a cycle (slice 9: view -> news entry -> view).
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
  else if (e.kind !== "type" && bundle.has(e.from) && (sb === "backend" || lb === "database")) rule = "F1 client bundle never reaches backend/ (transitive)";
  if (rule) {
    violations.push({ rule, key: `${a} -> ${b}`, kind: e.kind });
    continue;
  }
  // X1, public entry points only: from outside a feature (or a service that has
  // an index.ts), import its entry, never a file inside it. While either file
  // has yet to move, the import is rewritten in that move — a planned rewrite.
  const entry = entryOf(lb);
  if (entry && la !== lb && b !== entry && !test) {
    const item = { rule: "X1 public entry points only", key: `${a} -> ${b}`, kind: e.kind, entry };
    if (isPending(e.from) || isPending(e.to)) rewrites.push(item);
    else violations.push(item);
  }
}

// A2 — app/**/route.ts holds only re-exports and literal segment config. Applies
// to every route file at its final path, except one whose body has yet to move.
// Page files whose body has moved to frontend/views/ are held to the same rule.
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
const movedPageShims = new Set(MOVES.filter(([from, to]) => doneMoves.has(from) && /\/page\.tsx$/.test(from) && lift(from) !== to).map(([from]) => lift(from)));
const movedRouteShims = new Set(MOVES.filter(([from, to]) => doneMoves.has(from) && /\/route\.ts$/.test(from) && lift(from) !== to).map(([from]) => lift(from)));
for (const shim of [...movedPageShims, ...movedRouteShims]) {
  if (!tracked.has(shim)) violations.push({ rule: "A2 the moved body left no app/ file — the URL is gone", key: shim, kind: "value" });
}
for (const f of files) {
  if (!f.startsWith("app/") || isPending(f)) continue;
  if (!(/\/route\.ts$/.test(f) || movedPageShims.has(f))) continue;
  const problem = shimProblem(f);
  if (problem) violations.push({ rule: "A2 app/ route file holds only re-exports and literal segment config", key: `${f}: ${problem}`, kind: "value" });
}

const imageDomains = ["src/config/imageDomains.ts", "config/imageDomains.ts", "shared/config/imageDomains.ts"];
const imageDomainsImports = edges.filter((e) => imageDomains.includes(e.from)).length;

if (process.argv.includes("--plan")) {
  for (const n of Object.keys(SLICE_NAMES)) {
    const rows = MOVES.filter(([, , s]) => String(s) === n);
    console.log(`\n**Slice ${n} — \`${SLICE_NAMES[n]}\`** (${rows.length} files)\n`);
    if (rows.length) {
      console.log("| Current | Target |\n|---|---|");
      for (const [from, to] of rows) console.log(`| \`${from}\` | \`${to}\` |`);
    }
    if (SLICE_CHECKLIST[n]) console.log(`\nChecklist:\n${SLICE_CHECKLIST[n].map((item) => `- [ ] ${item}`).join("\n")}`);
  }
  process.exit(0);
}

const unexpected = violations.filter((v) => !KNOWN[`${v.rule.split(" ")[0]} ${v.key}`]);
console.log(`${MOVES.length} moves (${done} done, ${pending} pending) · ${edges.length} import edges · ${bundle.size} modules in the client bundle`);
console.log(`CR-06: imageDomains.ts imports ${imageDomainsImports} module(s) — ${imageDomainsImports === 0 ? "OK" : "VIOLATION"}`);
if (unmapped.size) console.log(`UNMAPPED — no final path in the move map:\n  ${[...unmapped].join("\n  ")}`);
if (rewrites.length) {
  console.log(`\n${rewrites.length} planned import rewrite(s) — X1 entry points, rewritten in the move that relocates the file:`);
  for (const r of rewrites) console.log(`  rewrite    ${r.key}  ->  import ${r.entry}`);
}
for (const v of violations) {
  const k = KNOWN[`${v.rule.split(" ")[0]} ${v.key}`];
  console.log(`${k ? "known     " : "VIOLATION "} ${v.rule.padEnd(52)} ${v.key}${v.kind !== "value" ? ` (${v.kind})` : ""}`);
  if (k) console.log(`           ↳ ${k}`);
}
console.log(`\n${violations.length} violation(s): ${violations.length - unexpected.length} known, ${unexpected.length} unexpected`);
process.exit(unexpected.length || unmapped.size || imageDomainsImports ? 1 : 0);
