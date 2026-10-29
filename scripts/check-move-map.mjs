// Validates the Phase D move map against the import rules BEFORE any file moves.
//
//   node scripts/check-move-map.mjs          # check the map, list violations
//   node scripts/check-move-map.mjs --plan   # print the per-slice move list (Markdown)
//
// The map itself lives in scripts/move-map.mjs; docs/MOVE-MAP.md's file lists
// are generated from it with --plan. The check builds the real import graph with
// the TypeScript compiler API, relocates every file to its target, and tests
// every edge against the rules in docs/architecture.md §5. It exists because the
// first draft of the map, written by reasoning rather than measurement, broke
// those rules 21 times.
//
// Exit code 1 if there is any violation not listed in KNOWN.

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import ts from "typescript";

import { MOVES, KNOWN, SLICE_NAMES } from "./move-map.mjs";

const files = execSync('git ls-files "src/*" "src/**/*"', { encoding: "utf8" })
  .split("\n").map((s) => s.trim()).filter((f) => /\.(ts|tsx)$/.test(f));
const tracked = new Set(files);
const target = new Map(MOVES.map(([from, to]) => [from, to]));
const where = (f) => target.get(f) ?? f;

// Usable throughout Phase D: a move whose target already exists is done, and
// the file is simply checked where it now lives.
let done = 0;
for (const [from, to] of MOVES) {
  if (tracked.has(from)) continue;
  if (tracked.has(to)) { done++; continue; }
  console.error(`map lists a file that exists at neither path: ${from} -> ${to}`);
  process.exit(2);
}

function resolve(base) {
  for (const s of [".ts", ".tsx", "/index.ts", "/index.tsx", ""]) if (tracked.has(base + s)) return base + s;
  return null;
}

const edges = [];
const clientRoots = new Set();
for (const file of files) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
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
      if (spec.startsWith("@/")) to = resolve("src/" + spec.slice(2));
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

function layer(p) {
  const m = p.match(/^src\/features\/([^/]+)\//);
  if (m) return "feature:" + m[1];
  if (p.startsWith("src/app/")) return "app";
  if (p.startsWith("src/server/")) return "server";
  if (p.startsWith("src/lib/")) return "lib";
  if (p.startsWith("src/config/")) return "config";
  if (p.startsWith("src/components/ui/")) return "ui";
  if (p.startsWith("src/context/")) return "context";
  if (p.startsWith("src/types/")) return "types";
  if (/^src\/(proxy|instrumentation|sentry)/.test(p)) return "pinned";
  return "unmapped";
}

const violations = [];
const unmapped = new Set();
for (const e of edges) {
  const a = where(e.from);
  const b = where(e.to);
  const la = layer(a);
  const lb = layer(b);
  if (la === "unmapped") unmapped.add(a);
  if (lb === "unmapped") unmapped.add(b);
  const fa = la.startsWith("feature:");
  const fb = lb.startsWith("feature:");
  let rule = null;
  if (fa && fb && la !== lb) rule = "R2 no sideways feature imports";
  else if (["server", "lib", "config", "ui", "context", "types"].includes(la) && fb) rule = `R3 no upward ${la} -> feature`;
  else if (la === "lib" && lb === "server") rule = "R3 no upward lib -> server";
  else if (la === "ui" && lb === "server") rule = "R6 ui never imports server";
  else if (la === "config" && !["config", "types"].includes(lb)) rule = `R7 config imports only config/types`;
  else if (la === "context" && !["context", "config", "types"].includes(lb)) rule = `R9 context imports only config/types`;
  else if (e.kind !== "type" && bundle.has(e.from) && lb === "server") rule = "R6 client bundle never reaches server";
  if (rule) violations.push({ rule, key: `${a.replace("src/", "")} -> ${b.replace("src/", "")}`, kind: e.kind });
}
const imageDomainsImports = edges.filter((e) => e.from === "src/lib/imageDomains.ts" || e.from === "src/config/imageDomains.ts").length;

if (process.argv.includes("--plan")) {
  for (const n of Object.keys(SLICE_NAMES)) {
    const rows = MOVES.filter(([, , s]) => String(s) === n);
    console.log(`\n**Slice ${n} — \`${SLICE_NAMES[n]}\`** (${rows.length} files)\n`);
    console.log("| Current | Target |\n|---|---|");
    for (const [from, to] of rows) console.log(`| \`${from.replace("src/", "")}\` | \`${to.replace("src/", "")}\` |`);
  }
  process.exit(0);
}

const unexpected = violations.filter((v) => !KNOWN[v.key]);
console.log(`${MOVES.length} moves (${done} done) · ${edges.length} import edges · ${bundle.size} modules in the client bundle`);
console.log(`CR-06: imageDomains.ts imports ${imageDomainsImports} module(s) — ${imageDomainsImports === 0 ? "OK" : "VIOLATION"}`);
if (unmapped.size) console.log("unmapped targets: " + [...unmapped].join(", "));
for (const v of violations) {
  console.log(`${KNOWN[v.key] ? "known     " : "VIOLATION "} ${v.rule.padEnd(40)} ${v.key}${v.kind !== "value" ? ` (${v.kind})` : ""}`);
  if (KNOWN[v.key]) console.log(`           ↳ ${KNOWN[v.key]}`);
}
console.log(`\n${violations.length} violation(s): ${violations.length - unexpected.length} known, ${unexpected.length} unexpected`);
process.exit(unexpected.length || imageDomainsImports ? 1 : 0);
