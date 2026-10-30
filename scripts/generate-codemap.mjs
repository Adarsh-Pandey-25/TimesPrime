// Regenerates docs/CODEMAP.md from the repo itself.
//
//   npm run test:ci                     # refreshes coverage/coverage-final.json
//   node scripts/generate-codemap.mjs   # rebuilds docs/CODEMAP.md
//
// Every column except "Purpose" and "Target" is derived. Imports are found by
// parsing each file with the TypeScript compiler API rather than a regex, so:
//   - comments and string literals cannot produce false edges,
//   - `import type` / all-`type` specifiers are recognised and labelled,
//   - dynamic `import("...")` is captured,
//   - `export ... from` re-exports are captured,
//   - aliases are resolved from tsconfig.json `paths`, not hardcoded.
// Purpose and Target are authored in PURPOSE below — update them when a
// module's role or destination changes.
//
// Run this after any file move. A stale CODEMAP is worse than none, because it
// is trusted.

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { builtinModules } from "node:module";
import ts from "typescript";
import { MOVES } from "./move-map.mjs";

const OUT = "docs/CODEMAP.md";
const COVERAGE_FILE = "coverage/coverage-final.json";
const CANDIDATE_SUFFIXES = [".ts", ".tsx", "/index.ts", "/index.tsx", ""];
const ASSET_EXT = /\.(css|scss|svg|png|jpe?g|gif|webp|json)$/;

const gitFiles = (pattern) =>
  execSync(`git ls-files ${pattern}`, { encoding: "utf8" }).split("\n").map((s) => s.trim()).filter(Boolean);

// Source modules: the rows of the table.
const srcFiles = gitFiles('"src/*" "src/**/*"').filter((f) => /\.(ts|tsx)$/.test(f));
// Files outside src/ that can import src/ modules. next.config.ts matters most:
// it imports imageDomains.ts at config-load time (CR-06).
const extraImporters = gitFiles('"*.ts" "*.mjs" "scripts/*.mjs"').filter((f) => !f.startsWith("src/"));

const text = new Map([...srcFiles, ...extraImporters].map((f) => [f, fs.readFileSync(f, "utf8")]));
const srcSet = new Set(srcFiles);

// ---- alias resolution, from tsconfig.json ----------------------------------
const tsconfig = ts.readConfigFile("tsconfig.json", ts.sys.readFile).config ?? {};
const aliases = Object.entries(tsconfig.compilerOptions?.paths ?? {})
  .filter(([key, targets]) => key.endsWith("/*") && targets[0]?.endsWith("/*"))
  .map(([key, targets]) => ({
    prefix: key.slice(0, -1), // "@/*" -> "@/"
    target: path.posix.normalize(targets[0].slice(0, -1)).replace(/^\.\//, ""), // "./src/*" -> "src/"
  }));

function firstExisting(base) {
  for (const suffix of CANDIDATE_SUFFIXES) if (srcSet.has(base + suffix)) return base + suffix;
  return null;
}

// Returns a tracked src path, "external" for a package, or null if a project
// specifier could not be resolved (a generator bug — tsc would have failed).
function resolveSpecifier(spec, from) {
  for (const { prefix, target } of aliases) {
    if (spec.startsWith(prefix)) return firstExisting(path.posix.join(target, spec.slice(prefix.length)));
  }
  if (spec.startsWith(".")) {
    const joined = path.posix.join(path.posix.dirname(from), spec);
    // A relative import between two files outside src/ (e.g. one script
    // importing another) is not an edge in the module graph this maps.
    if (!joined.startsWith("src/")) return "external";
    return firstExisting(joined);
  }
  return "external";
}

// ---- parsing -----------------------------------------------------------------
// Edge kinds: value · type · dynamic · reexport · side-effect.
// "type" edges are erased by the compiler and never reach a bundle, but they
// still break if the target moves, so they belong in the refactoring view.
function parse(file) {
  const sf = ts.createSourceFile(
    file, text.get(file), ts.ScriptTarget.Latest, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const directives = [];
  for (const stmt of sf.statements) {
    if (ts.isExpressionStatement(stmt) && ts.isStringLiteral(stmt.expression)) directives.push(stmt.expression.text);
    else break; // the directive prologue ends at the first non-string statement
  }

  const edges = [];
  const unresolvedDynamic = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      let kind = "value";
      if (!clause) kind = "side-effect";
      else if (clause.isTypeOnly) kind = "type";
      else if (
        !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings) &&
        clause.namedBindings.elements.length > 0 &&
        clause.namedBindings.elements.every((el) => el.isTypeOnly)
      ) kind = "type";
      edges.push({ spec: node.moduleSpecifier.text, kind });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      edges.push({ spec: node.moduleSpecifier.text, kind: node.isTypeOnly ? "type" : "reexport" });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) edges.push({ spec: arg.text, kind: "dynamic" });
      else unresolvedDynamic.push(sf.getLineAndCharacterOfPosition(node.getStart()).line + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { directives, edges, unresolvedDynamic };
}

const parsed = new Map([...text.keys()].map((f) => [f, parse(f)]));

// ---- graph -------------------------------------------------------------------
const out = new Map([...text.keys()].map((f) => [f, []])); // file -> [{to, kind}]
const inn = new Map(srcFiles.map((f) => [f, []]));         // src file -> [{from, kind}]
const unresolved = [];
for (const [file, { edges }] of parsed) {
  for (const { spec, kind } of edges) {
    const to = resolveSpecifier(spec, file);
    if (to === "external") continue;
    if (to === null) { if (!ASSET_EXT.test(spec)) unresolved.push(`${file}: "${spec}"`); continue; }
    if (to === file) continue;
    out.get(file).push({ to, kind });
    inn.get(to).push({ from: file, kind });
  }
}

// ---- coverage ----------------------------------------------------------------
let coverage = null;
let coverageStamp = "not found — run `npm run test:ci` first";
if (fs.existsSync(COVERAGE_FILE)) {
  coverage = new Map();
  for (const [abs, data] of Object.entries(JSON.parse(fs.readFileSync(COVERAGE_FILE, "utf8")))) {
    const rel = path.relative(process.cwd(), abs).split(path.sep).join("/");
    const hits = Object.values(data.s ?? {});
    coverage.set(rel, hits.length ? (100 * hits.filter((n) => n > 0).length) / hits.length : null);
  }
  coverageStamp = fs.statSync(COVERAGE_FILE).mtime.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}
function coverageCell(file) {
  if (!coverage) return "?";
  if (!coverage.has(file)) return "excl.";
  const pct = coverage.get(file);
  return pct === null ? "n/a" : `${pct.toFixed(pct === 100 || pct === 0 ? 0 : 1)}%`;
}

// ---- classification ----------------------------------------------------------
const isTest = (f) => /\.test\.tsx?$/.test(f);
const hasUseClient = (f) => parsed.get(f).directives.includes("use client");

// Modules that must never reach the browser. This list is POLICY, authored
// like Purpose — it cannot be derived, because several of these modules
// (supabase.ts, googleTranslate.ts) contain no code that would fail in a
// browser. They are server-only because of what they hold or do.
const SERVER_ONLY = new Set([
  "src/lib/db.ts", "src/lib/supabase.ts", "src/lib/adminSession.ts", "src/lib/adminLogger.ts",
  "src/lib/categoryClassifier.ts", "src/lib/fetchNews.ts", "src/lib/newsdata.ts",
  "src/lib/googleTranslate.ts", "src/lib/urlValidation.ts",
]);

// The client bundle is TRANSITIVE. "use client" marks a boundary: that module
// and everything it imports — directly, or through any chain of modules that
// carry no directive of their own — ships to the browser. So the bundle is the
// closure over import edges from every "use client" root, following value,
// dynamic, re-export and side-effect edges. It does NOT follow:
//   - type edges: erased at compile time, they ship nothing;
//   - edges into a "use server" module: the client receives an RPC reference
//     to the server action, not the module's code.
// A BFS from all roots at once yields the shortest chain to each module, which
// is printed as the evidence for every violation.
const isRoot = (f) => !isTest(f) && hasUseClient(f);
const hasUseServer = (f) => parsed.get(f).directives.includes("use server");
const parent = new Map(); // module -> module that pulled it into the bundle; null for a root
const queue = srcFiles.filter(isRoot);
for (const root of queue) parent.set(root, null);
while (queue.length) {
  const cur = queue.shift();
  for (const { to, kind } of out.get(cur)) {
    if (kind === "type" || parent.has(to) || isTest(to) || hasUseServer(to)) continue;
    parent.set(to, cur);
    queue.push(to);
  }
}
const clientBundle = new Set(parent.keys());
const chainTo = (f) => {
  const chain = [];
  for (let x = f; x !== null; x = parent.get(x)) chain.unshift(x);
  return chain;
};

// Boundary rule: a server-only module that ends up in the client bundle.
const violations = [...clientBundle].filter((f) => SERVER_ONLY.has(f)).sort()
  .map((target) => ({ target, chain: chainTo(target) }));

// Independent cross-check. A browser bundle cannot resolve Node built-ins, so
// `next build` succeeding implies no bundled module imports one. If this ever
// lists anything, either the build is broken or this generator is wrong.
const BUILTINS = new Set(builtinModules);
const isBuiltin = (spec) => spec.startsWith("node:") || BUILTINS.has(spec) || BUILTINS.has(spec.split("/")[0]);
const builtinUsers = srcFiles.filter((f) => !isTest(f) && parsed.get(f).edges.some((e) => isBuiltin(e.spec)));
const bundledBuiltinUsers = builtinUsers.filter((f) => clientBundle.has(f));

// [purpose, note]. The note is appended to the Target column; the target itself
// always comes from scripts/move-map.mjs, so the two can never disagree.
const PURPOSE = {
  "src/lib/db.ts": ["Supabase reads/writes: filters, freshness, 7-day purge, upsert, stats", "news editorial policy is baked in, hence features/news"],
  "src/lib/supabase.ts": ["Supabase client; prefers service-role key when present", ""],
  "src/lib/adminSession.ts": ["HMAC session token issue/verify; timing-safe password compare", ""],
  "src/lib/adminLogger.ts": ["Writes admin_logs rows (logAdminAction)", ""],
  "src/lib/urlValidation.ts": ["SSRF guard: protocol allowlist + DNS resolution against blocked ranges", ""],
  "src/lib/cache.ts": ["Upstash Redis with in-process Map fallback", ""],
  "src/lib/rateLimit.ts": ["Fixed-window in-memory limiter; client IP extraction", ""],
  "src/lib/sentryScrub.ts": ["Redacts secret env values from Sentry events", ""],
  "src/lib/newsConfig.ts": ["Editorial policy: category map, script filters, spam/filler source lists, dedupe", ""],
  "src/lib/categoryClassifier.ts": ["Haiku flags category tags an article does not fit (fail-open)", ""],
  "src/lib/fetchNews.ts": ["Server-side initial NewsData.io fetch for SSR", ""],
  "src/lib/newsdata.ts": ["Shared NewsData.io URL builder + row mapper; throws on failure", ""],
  "src/lib/topicImages.ts": ["Keyword to Unsplash topic-image table + per-topic round robin", ""],
  "src/lib/imageDomains.ts": ["next/image hostname allowlist. Imported by next.config.ts at LOAD TIME", "CR-06: must import nothing"],
  "src/lib/categoryColors.ts": ["Per-category hex/Tailwind class map", ""],
  "src/lib/translations.ts": ["EN/HI static strings; translateHeadline is a no-op stub", "shared, not a feature"],
  "src/lib/googleTranslate.ts": ["Unofficial translate.googleapis.com client, bounded concurrency", ""],
  "src/lib/bookmarks.ts": ["localStorage saved articles + change event", "stores Article objects, so not lib/"],
  "src/components/admin/actionLabels.ts": ["Display labels and icons for admin activity-log entries", "only consumer is ActivityLog (SC-1)"],
  "src/context/ThemeContext.tsx": ["Light/dark provider, localStorage-backed", "app-wide state provider, not a UI primitive"],
  "src/context/LanguageContext.tsx": ["EN/HI provider, localStorage-backed", "app-wide state provider, not a UI primitive"],
  "src/types/index.ts": ["Article, NewsResponse, ScrapeResponse, ChatMessage, NewsDataRawArticle, AdminAction, AdminLog", ""],
  "src/proxy.ts": ["AUTH GATE. Next 16 Proxy (was middleware). Matches /admin/*, /api/admin/*", ""],
  "src/instrumentation.ts": ["Sentry server/edge init hook", ""],
  "src/instrumentation-client.ts": ["Sentry browser init", ""],
  "src/sentry.server.config.ts": ["Sentry Node config", ""],
  "src/sentry.edge.config.ts": ["Sentry edge config", ""],
  "src/components/ArticleDetailView.tsx": ["Article page body: text, translation, AI panel, share, related", "split in F"],
  "src/components/ArticleCard.tsx": ["Feed card, featured and grid variants", ""],
  "src/components/HomeClient.tsx": ["Feed state, new-story polling, grid, load-more", "split in F"],
  "src/components/Header.tsx": ["Nav, search, theme + language toggles, bookmarks count, clock", "news masthead, not UI; split in F"],
  "src/components/Footer.tsx": ["Footer nav, category links, copyright bar. Dead \"RSS Feeds\" link remains (BL-009)", ""],
  "src/components/CategoryMegaMenu.tsx": ["Hover mega-menu of category previews", ""],
  "src/components/MarqueeTicker.tsx": ["Scrolling India/World headline ticker", ""],
  "src/components/BreakingNewsBanner.tsx": ["Public banner polling /api/admin/breaking-news (CR-08)", ""],
  "src/components/Chatbot.tsx": ["Chat drawer; streams /api/chat. Honest error handling", ""],
  "src/components/FloatingAiAssistant.tsx": ["Floating button wrapping Chatbot", ""],
  "src/components/NewsSkeletonGrid.tsx": ["Suspense fallback matching real card dimensions", ""],
  "src/components/ThemeSpinner.tsx": ["Theme-aware loading spinner", ""],
  "src/components/admin/ArticlesTable.tsx": ["Admin article list: filters, edit, delete, bulk", "split in F"],
  "src/components/admin/CategoryStatsCard.tsx": ["Category/language/country breakdown", ""],
  "src/components/admin/BreakingNewsManager.tsx": ["Create/expire breaking news items", ""],
  "src/components/admin/SyncDashboard.tsx": ["Last/next sync, counts, manual sync", ""],
  "src/components/admin/ActivityLog.tsx": ["Paginated admin_logs viewer", ""],
};

const MOVE_TO = new Map(MOVES.map(([from, to, slice]) => [from, { to, slice }]));
const PINNED_FILE = /^src\/(proxy|instrumentation|sentry)/;

function describe(file) {
  let purpose;
  let note = "";
  if (PURPOSE[file]) [purpose, note] = PURPOSE[file];
  else if (file.endsWith("/route.ts")) purpose = "API: " + file.replace("src/app", "").replace("/route.ts", "");
  else if (file.endsWith("/page.tsx")) purpose = "Page: " + (file.replace("src/app", "").replace("/page.tsx", "") || "/");
  else if (file.endsWith("layout.tsx")) purpose = "Root layout: providers, metadata, fonts";
  else if (file.endsWith("loading.tsx")) purpose = "Route-level loading UI";
  else purpose = "(no purpose recorded -- add it to PURPOSE in this script)";

  let target;
  const move = MOVE_TO.get(file);
  if (move) target = `\`${move.to.replace(/^src\//, "")}\` · slice ${move.slice}`;
  else if (PINNED_FILE.test(file)) target = "PINNED -- do not move";
  else if (file.startsWith("src/app/")) target = "stays -- the path is the URL (CR-01)";
  else target = "stays";
  return [purpose, note ? `${target} — ${note}` : target];
}

// ---- render ------------------------------------------------------------------
const short = (f) => f.replace(/^src\//, "");
// Counts newline characters, exactly as `wc -l` does, so these figures match
// the ones cited elsewhere in docs/. split("\n").length over-counts by one.
const loc = (f) => (text.get(f).match(/\n/g) ?? []).length;
const rows = srcFiles.filter((f) => !isTest(f)).sort();
const PINNED = /^src\/(proxy|instrumentation|sentry)/;
const orphans = rows.filter((f) => inn.get(f).length === 0 && !f.startsWith("src/app/") && !PINNED.test(f));
const importerCount = (f) => new Set(inn.get(f).map((e) => e.from)).size;
const mostUsed = [...rows].sort((a, b) => importerCount(b) - importerCount(a)).slice(0, 6);
const dynamicEdges = [...out].flatMap(([from, es]) => es.filter((e) => e.kind === "dynamic").map((e) => `${from} -> ${e.to}`));
const typeEdgeCount = [...out.values()].flat().filter((e) => e.kind === "type").length;
const unresolvedDynamic = [...parsed].flatMap(([f, p]) => p.unresolvedDynamic.map((l) => `${f}:${l}`));
const head = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();

const label = (kind) => (kind === "value" || kind === "side-effect" ? "" : ` _(${kind})_`);
function listEdges(edges, key) {
  const byTarget = new Map();
  for (const e of edges) {
    const k = e[key];
    if (!byTarget.has(k)) byTarget.set(k, new Set());
    byTarget.get(k).add(e.kind);
  }
  return [...byTarget].sort(([a], [b]) => a.localeCompare(b)).map(([k, kinds]) => {
    const tags = [...kinds].filter((x) => x !== "value" && x !== "side-effect");
    const test = isTest(k) ? " _(test)_" : "";
    return `\`${short(k)}\`${tags.length ? tags.map((t) => label(t)).join("") : ""}${test}`;
  });
}

const L = [];
L.push(
  "# CODEMAP — every module, what it does, where it goes", "",
  "**Read this instead of re-analysing the codebase.** If the question is \"where does X live\",",
  "\"what imports Y\" or \"what moves where\", it is answered here. Do not grep the tree to re-derive it.", "",
  `Generated at commit \`${head}\` by \`node scripts/generate-codemap.mjs\`. Coverage read from`,
  `\`${COVERAGE_FILE}\` (written ${coverageStamp}) — run \`npm run test:ci\` first for current numbers.`, "",
  "Every column except **Purpose** and **Target** is derived. Imports come from parsing each file with",
  "the TypeScript compiler API, so comments and strings cannot create false edges, `import type` is",
  "recognised, dynamic `import()` and `export … from` are captured, and aliases are resolved from",
  "`tsconfig.json`. Files outside `src/` (notably `next.config.ts`) are scanned as importers too.", "",
  "**Regenerate after any file move.** A stale CODEMAP is worse than none, because it is trusted.", "",
  "## At a glance", "",
  "| | |", "|---|---|",
  `| Modules (excl. tests) | **${rows.length}** |`,
  `| Modules with a \`"use client"\` directive | **${rows.filter(hasUseClient).length}** |`,
  `| Modules in the client bundle (directive + pulled in) | **${rows.filter((f) => clientBundle.has(f)).length}** |`,
  `| Server-only modules in the client bundle (violations) | **${violations.length}** |`,
  `| Orphans (nothing imports them) | **${orphans.length}** |`,
  `| Dynamic \`import()\` edges | **${dynamicEdges.length}** |`,
  `| Type-only edges (erased at compile time) | **${typeEdgeCount}** |`,
  `| Unresolved project imports | **${unresolved.length}** ${unresolved.length ? "— generator bug, investigate" : "— self-check passes"} |`,
  "",
  "### Boundary violations", "",
  "A server-only module that ends up in the client bundle, with the shortest import chain that pulls",
  "it in. **Treat this as an estimate** until the Phase E lint rule exists — see *How the boundary is",
  "detected* below.", "",
  "```", ...(violations.length ? violations.map((v) => v.chain.join("  ->  ")) : ["none"]), "```", ""
);
if (violations.some((v) => v.chain.some((x) => x.includes("ActivityLog")))) {
  L.push(
    "Both entries share one root cause. `ActivityLog.tsx` imports `adminLogger.ts` for two constant",
    "objects (`ACTION_LABELS`, `ACTION_ICONS`). `adminLogger.ts` imports `supabase.ts`, which calls",
    "`createClient()` at module scope — a side effect no bundler can tree-shake — so the Supabase SDK",
    "ships to the browser even though `ActivityLog` never calls it. The service-role key itself is safe:",
    "non-`NEXT_PUBLIC_` env vars compile to `undefined` client-side. One fix clears both: migration slice",
    "8 moves the two constants into `features/admin/`.", ""
  );
}
L.push(
  "### How the boundary is detected", "",
  "- **Roots:** files whose directive prologue contains `\"use client\"`, read from the AST, so a leading",
  "  comment cannot hide one.",
  "- **Client bundle:** the transitive closure from every root over value, dynamic, re-export and",
  "  side-effect edges. A module with no directive is still client-side if a root pulls it in — that is",
  "  how Next.js bundles. Type edges are not followed (erased at compile time), nor are edges into a",
  "  `\"use server\"` module (the client gets an RPC reference, not the code).",
  "- **Server-only module:** an authored policy list in the generator — not derivable, since modules",
  "  such as `supabase.ts` contain no code that would fail in a browser.",
  "- **Violation:** a server-only module inside the client bundle.",
  "- **Limits:** the generator reads syntax, not types. An import written without `type` that only",
  "  brings in interfaces (`import { Article } from \"@/types\"`) is erased by the compiler but counted",
  "  here as a value edge — which is why `types/index.ts` shows as `bundled` though it compiles to",
  "  nothing. This can only over-include modules, never miss one, so the estimate errs high. A dynamic",
  "  `import()` with a non-literal specifier cannot be followed and is listed separately; `require()` is",
  "  not followed (none in `src/`). The Phase E lint rule replaces this estimate with an enforced check.", "",
  "### Cross-check: Node built-ins", "",
  "A browser bundle cannot resolve Node built-ins, so a passing `next build` implies no bundled module",
  "imports one. Modules importing built-ins, and whether any is in the client bundle:", "",
  "```",
  ...(builtinUsers.length ? builtinUsers.map((f) => `${f}${clientBundle.has(f) ? "   IN CLIENT BUNDLE — investigate" : "   server-side"}`) : ["none"]),
  "```", "",
  bundledBuiltinUsers.length
    ? "**Inconsistent:** a bundled module imports a Node built-in. Either the build is broken or this generator is wrong."
    : "Consistent with the build: no bundled module imports a Node built-in.", "",
  "### Orphans", "", "```", ...(orphans.length ? orphans.map((f) => `${f}  (${loc(f)} lines)`) : ["none"]), "```", "",
  "### Dynamic imports", "", "```", ...(dynamicEdges.length ? dynamicEdges : ["none"]), "```", ""
);
if (unresolvedDynamic.length) L.push("Dynamic imports with a non-literal specifier (cannot be resolved statically):", "", "```", ...unresolvedDynamic, "```", "");
if (unresolved.length) L.push("### Unresolved project imports", "", "```", ...unresolved, "```", "");
L.push("### Most depended-upon", "", "Widest blast radius when moved.", "", "| Importers | Module |", "|--:|---|");
for (const f of mostUsed) L.push(`| ${importerCount(f)} | \`${f}\` |`);
L.push(
  "", "## Legend", "",
  "- **Client** — `directive`: declares `\"use client\"`. `bundled`: no directive, but pulled into the",
  "  client bundle by one. Blank: server-side only.",
  "- **Cov** — statement coverage from the last `npm run test:ci`. `excl.` = excluded by",
  "  `collectCoverageFrom` (type-only modules, Sentry/instrumentation entrypoints).",
  "- **Importers / Imports** — counts of project-internal edges. The full path lists, with edge kinds,",
  "  are in the *Dependency index* section below the tables.",
  "- **Target** — destination under the approved *layer separation* structure. `PINNED` = a framework",
  "  convention that must not move. Slice order is in [`MOVE-MAP.md`](MOVE-MAP.md).",
  "- **CR-nn** — a compatibility requirement from [`PRD.md`](PRD.md) §8.", "",
  "## Modules"
);

const GROUPS = [
  ["Routing — `src/app/` (locations are the URL contract)", (f) => f.startsWith("src/app/")],
  ["Features — `src/features/`", (f) => f.startsWith("src/features/")],
  ["Components — `src/components/`", (f) => f.startsWith("src/components/")],
  ["Server — `src/server/` (backend-only)", (f) => f.startsWith("src/server/")],
  ["Library — `src/lib/` (the folder being split)", (f) => f.startsWith("src/lib/")],
  ["Config — `src/config/` (static data)", (f) => f.startsWith("src/config/")],
  ["Context and types", (f) => f.startsWith("src/context/") || f.startsWith("src/types/")],
  ["Framework-pinned (never move)", (f) => PINNED.test(f)],
];
// A module in no group would vanish from the tables while still counting in
// the summary, so refuse to write a CODEMAP that silently drops one.
const ungrouped = rows.filter((f) => !GROUPS.some(([, pred]) => pred(f)));
if (ungrouped.length) throw new Error(`no CODEMAP group for: ${ungrouped.join(", ")}`);
for (const [title, pred] of GROUPS) {
  const sel = rows.filter(pred);
  if (!sel.length) continue;
  L.push("", `### ${title}`, "", "| Module | Purpose | LOC | Client | Cov | Importers | Imports | Target |", "|---|---|--:|:-:|--:|--:|--:|---|");
  for (const f of sel) {
    const [purpose, target] = describe(f);
    const importsN = new Set(out.get(f).map((e) => e.to)).size;
    L.push(`| \`${short(f)}\` | ${purpose} | ${loc(f)} | ${hasUseClient(f) ? "directive" : clientBundle.has(f) ? "bundled" : ""} | ${coverageCell(f)} | ${importerCount(f)} | ${importsN} | ${target} |`);
  }
}

L.push(
  "", "## Dependency index", "",
  "One entry per module. **Imports** = project-internal modules this file imports. **Used by** = files",
  "that import it, including tests and files outside `src/`. Edge kinds other than a plain value import",
  "are labelled. A _(type)_ edge is erased at compile time and never reaches a bundle, but it still",
  "breaks if its target moves — so it counts here, where the question is what a move would touch.", ""
);
for (const f of rows) {
  const imports = listEdges(out.get(f), "to");
  const usedBy = listEdges(inn.get(f), "from");
  L.push(`#### \`${short(f)}\``, "",
    `- **Imports:** ${imports.length ? imports.join(", ") : "—"}`,
    `- **Used by:** ${usedBy.length ? usedBy.join(", ") : "—"}`, "");
}

fs.writeFileSync(OUT, L.join("\n"));
console.log(`wrote ${OUT}: ${rows.length} modules · ${clientBundle.size} in client bundle · ` +
  `${violations.length} violation(s) · ${bundledBuiltinUsers.length} bundled built-in user(s) · ${orphans.length} orphan(s) · ` +
  `${dynamicEdges.length} dynamic · ${typeEdgeCount} type-only · ${unresolved.length} unresolved`);
