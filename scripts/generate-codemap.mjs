// Regenerates docs/CODEMAP.md from the repo itself.
//
//   node scripts/generate-codemap.mjs
//
// Every column except "Purpose" and "Target" is derived: the import graph is
// built by resolving each `from "..."` specifier (both `@/` aliased and
// relative) against `git ls-files`, so "Used by" is a real count rather than an
// estimate. Purpose and Target are authored in PURPOSE below — update them when
// a module's role or destination changes.
//
// Run this after any file move. A stale CODEMAP is worse than none, because it
// is trusted.

import fs from "node:fs";
import { execSync } from "node:child_process";

const OUT = "docs/CODEMAP.md";

const files = execSync('git ls-files "src/*" "src/**/*"', { encoding: "utf8" })
  .split("\n")
  .map((s) => s.trim())
  .filter((f) => /\.(ts|tsx)$/.test(f));

const src = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const CANDIDATE_SUFFIXES = [".ts", ".tsx", "/index.ts", "/index.tsx", ""];

function firstExisting(base) {
  for (const suffix of CANDIDATE_SUFFIXES) {
    if (src.has(base + suffix)) return base + suffix;
  }
  return null;
}

function resolveSpecifier(spec, from) {
  if (spec.startsWith("@/")) return firstExisting("src/" + spec.slice(2));
  if (!spec.startsWith(".")) return null; // a package, not a project module
  const dir = from.split("/").slice(0, -1);
  for (const part of spec.split("/")) {
    if (part === "..") dir.pop();
    else if (part !== ".") dir.push(part);
  }
  return firstExisting(dir.join("/"));
}

const importsOf = new Map(files.map((f) => [f, new Set()]));
const importersOf = new Map(files.map((f) => [f, new Set()]));
for (const [file, text] of src) {
  for (const [, spec] of text.matchAll(/from\s+["']([^"']+)["']/g)) {
    const target = resolveSpecifier(spec, file);
    if (target && target !== file) {
      importsOf.get(file).add(target);
      importersOf.get(target).add(file);
    }
  }
}

const isTest = (f) => /\.test\.tsx?$/.test(f);
const isClient = (f) => /^["']use client["']/.test(src.get(f).trimStart());
const tested = new Set(
  files.filter(isTest).map((t) => t.replace(/\.test\.(tsx?)$/, ".$1")).filter((p) => src.has(p))
);

const rows = files
  .filter((f) => !isTest(f))
  .sort()
  .map((f) => ({
    file: f,
    loc: src.get(f).split("\n").length,
    client: isClient(f),
    tested: tested.has(f),
    deps: [...importsOf.get(f)],
    usedBy: importersOf.get(f).size,
  }));

// Modules that must never reach the browser. A "use client" file importing one
// of these is a boundary violation — the exact thing the Phase E lint rule
// exists to prevent.
const SERVER_ONLY = new Set([
  "src/lib/db.ts", "src/lib/supabase.ts", "src/lib/adminSession.ts", "src/lib/adminLogger.ts",
  "src/lib/categoryClassifier.ts", "src/lib/fetchNews.ts", "src/lib/newsdata.ts",
  "src/lib/googleTranslate.ts", "src/lib/urlValidation.ts",
]);

// [purpose, target under the approved layer-separation structure]
const PURPOSE = {
  "src/lib/db.ts": ["Supabase reads/writes: filters, freshness, 7-day purge, upsert, stats", "server/db/"],
  "src/lib/supabase.ts": ["Supabase client; prefers service-role key when present", "server/supabase.ts"],
  "src/lib/adminSession.ts": ["HMAC session token issue/verify; timing-safe password compare", "server/auth/"],
  "src/lib/adminLogger.ts": ["Writes admin_logs rows; also exports ACTION_LABELS/ICONS", "split: server/auditLog.ts + labels to features/admin"],
  "src/lib/urlValidation.ts": ["SSRF guard: protocol allowlist + DNS resolution against blocked ranges", "lib/ (stays)"],
  "src/lib/cache.ts": ["Upstash Redis with in-process Map fallback", "lib/ (stays)"],
  "src/lib/rateLimit.ts": ["Fixed-window in-memory limiter; client IP extraction", "lib/ (stays)"],
  "src/lib/sentryScrub.ts": ["Redacts secret env values from Sentry events", "lib/ (stays)"],
  "src/lib/newsConfig.ts": ["Editorial policy: category map, script filters, spam/filler source lists, dedupe", "features/news/"],
  "src/lib/categoryClassifier.ts": ["Haiku flags category tags an article does not fit (fail-open)", "features/news/server/"],
  "src/lib/fetchNews.ts": ["Server-side initial NewsData.io fetch for SSR", "features/news/server/"],
  "src/lib/newsdata.ts": ["Shared NewsData.io URL builder + row mapper; throws on failure", "features/news/server/"],
  "src/lib/paraphraser.ts": ["Synonym-table rewrite of titles/descriptions; skips Devanagari", "features/article/ (pending Q1)"],
  "src/lib/rssParser.ts": ["DEAD: 233 lines inside a block comment, licensing-blocked", "DELETE (pending Q2)"],
  "src/lib/topicImages.ts": ["Keyword to Unsplash topic-image table + per-topic round robin", "config/"],
  "src/lib/imageDomains.ts": ["next/image hostname allowlist. Imported by next.config.ts at LOAD TIME", "config/ -- CR-06, move first"],
  "src/lib/categoryColors.ts": ["Per-category hex/Tailwind class map", "config/"],
  "src/lib/translations.ts": ["EN/HI static strings; translateHeadline is a no-op stub", "features/i18n/"],
  "src/lib/googleTranslate.ts": ["Unofficial translate.googleapis.com client, bounded concurrency", "features/i18n/server/"],
  "src/lib/bookmarks.ts": ["localStorage saved articles + change event", "features/bookmarks/"],
  "src/context/ThemeContext.tsx": ["Light/dark provider, localStorage-backed", "components/ui/theme/"],
  "src/context/LanguageContext.tsx": ["EN/HI provider, localStorage-backed", "features/i18n/"],
  "src/types/index.ts": ["Article, NewsResponse, ScrapeResponse, ChatMessage, NewsDataRawArticle", "types/ (stays)"],
  "src/proxy.ts": ["AUTH GATE. Next 16 Proxy (was middleware). Matches /admin/*, /api/admin/*", "PINNED -- do not move"],
  "src/instrumentation.ts": ["Sentry server/edge init hook", "PINNED"],
  "src/instrumentation-client.ts": ["Sentry browser init", "PINNED"],
  "src/sentry.server.config.ts": ["Sentry Node config", "PINNED"],
  "src/sentry.edge.config.ts": ["Sentry edge config", "PINNED"],
  "src/components/ArticleDetailView.tsx": ["Article page body: text, translation, AI panel, share, related", "features/article/components/ -- split in F"],
  "src/components/ArticleCard.tsx": ["Feed card, featured and grid variants", "features/news/components/"],
  "src/components/HomeClient.tsx": ["Feed state, new-story polling, grid, load-more", "features/news/components/ -- split in F"],
  "src/components/Header.tsx": ["Nav, search, theme + language toggles, bookmarks count, clock", "components/ui/layout/ -- split in F"],
  "src/components/Footer.tsx": ["Footer nav + newsletter form (sends nothing, DEF-09)", "components/ui/layout/"],
  "src/components/CategoryMegaMenu.tsx": ["Hover mega-menu of category previews", "features/news/components/"],
  "src/components/MarqueeTicker.tsx": ["Scrolling India/World headline ticker", "features/news/components/"],
  "src/components/BreakingNewsBanner.tsx": ["Public banner polling /api/admin/breaking-news (CR-08)", "features/admin/components/"],
  "src/components/Chatbot.tsx": ["Chat drawer; streams /api/chat. Honest error handling", "features/chat/components/"],
  "src/components/FloatingAiAssistant.tsx": ["Floating button wrapping Chatbot", "features/chat/components/"],
  "src/components/NewsSkeletonGrid.tsx": ["Suspense fallback matching real card dimensions", "components/ui/"],
  "src/components/ThemeSpinner.tsx": ["Theme-aware loading spinner", "components/ui/"],
  "src/components/admin/ArticlesTable.tsx": ["Admin article list: filters, edit, delete, bulk", "features/admin/components/ -- split in F"],
  "src/components/admin/CategoryStatsCard.tsx": ["Category/language/country breakdown", "features/admin/components/"],
  "src/components/admin/BreakingNewsManager.tsx": ["Create/expire breaking news items", "features/admin/components/"],
  "src/components/admin/SyncDashboard.tsx": ["Last/next sync, counts, manual sync", "features/admin/components/"],
  "src/components/admin/ActivityLog.tsx": ["Paginated admin_logs viewer", "features/admin/components/"],
};

function describe(file) {
  if (PURPOSE[file]) return PURPOSE[file];
  if (file.endsWith("/route.ts")) {
    return ["API: " + file.replace("src/app", "").replace("/route.ts", ""), "stays -- URL is the contract (CR-01)"];
  }
  if (file.endsWith("/page.tsx")) {
    return ["Page: " + (file.replace("src/app", "").replace("/page.tsx", "") || "/"), "stays -- route group only (CR-01)"];
  }
  if (file.endsWith("layout.tsx")) return ["Root layout: providers, metadata, fonts", "stays"];
  if (file.endsWith("loading.tsx")) return ["Route-level loading UI", "stays"];
  return ["(no purpose recorded -- add it to PURPOSE in this script)", "?"];
}

const violations = rows.flatMap((r) =>
  r.client ? r.deps.filter((d) => SERVER_ONLY.has(d)).map((d) => `${r.file}  ->  ${d}`) : []
);
const PINNED = /^src\/(proxy|instrumentation|sentry)/;
const orphans = rows.filter((r) => r.usedBy === 0 && !r.file.startsWith("src/app/") && !PINNED.test(r.file));
const mostUsed = [...rows].sort((a, b) => b.usedBy - a.usedBy).slice(0, 6);
const head = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
const today = new Date().toISOString().slice(0, 10);

const GROUPS = [
  ["Routing — `src/app/` (locations are the URL contract)", (f) => f.startsWith("src/app/")],
  ["Components — `src/components/`", (f) => f.startsWith("src/components/")],
  ["Library — `src/lib/` (the folder being split)", (f) => f.startsWith("src/lib/")],
  ["Context and types", (f) => f.startsWith("src/context/") || f.startsWith("src/types/")],
  ["Framework-pinned (never move)", (f) => PINNED.test(f)],
];

const tick = (b) => (b ? "yes" : "");
const lines = [];
lines.push("# CODEMAP — every module, what it does, where it goes", "");
lines.push(
  "**Purpose: read this instead of re-analysing the codebase.** If the question is \"where does X",
  "live\", \"what imports Y\" or \"what moves where\", it is answered here. Do not grep the tree to",
  "re-derive it.",
  "",
  `Generated ${today} at commit \`${head}\` by \`node scripts/generate-codemap.mjs\`. Every column`,
  "except **Purpose** and **Target** is derived from the repo: the import graph resolves each",
  "`from \"...\"` specifier (both `@/` aliased and relative) against `git ls-files`, so **Used by** is",
  "a real count, not an estimate. Purpose and Target are authored in that script.",
  "",
  "**Regenerate after any file move.** A stale CODEMAP is worse than none, because it is trusted.",
  "",
  "## At a glance",
  "",
  "| | |",
  "|---|---|",
  `| Modules (excl. tests) | **${rows.length}** |`,
  `| Client components (\`"use client"\`) | **${rows.filter((r) => r.client).length}** |`,
  `| Modules with a colocated test | **${rows.filter((r) => r.tested).length}** |`,
  `| Client → server boundary violations | **${violations.length}** |`,
  `| Orphans (nothing imports them) | **${orphans.length}** |`,
  "",
  "### Boundary violations",
  "",
  "A `\"use client\"` module importing a server-only one. The Phase E lint rule exists to make",
  "this count zero and keep it there.",
  "",
  "```",
  ...(violations.length ? violations : ["none"]),
  "```",
  ""
);
if (violations.some((v) => v.includes("ActivityLog"))) {
  lines.push(
    "`ActivityLog.tsx` imports `adminLogger.ts` for two constant objects (`ACTION_LABELS`,",
    "`ACTION_ICONS`). That module imports `@supabase/supabase-js` and Sentry, so the SDK lands in",
    "the browser bundle. The service-role key itself is safe — non-`NEXT_PUBLIC_` env vars compile",
    "to `undefined` client-side — but the weight is real. Fixed in migration slice 8 by moving the",
    "two constants into `features/admin/`.",
    ""
  );
}
lines.push("### Orphans", "", "```", ...(orphans.length ? orphans.map((r) => `${r.file}  (${r.loc} lines)`) : ["none"]), "```", "");
lines.push("### Most depended-upon", "", "Widest blast radius when moved.", "", "| Importers | Module |", "|--:|---|");
for (const r of mostUsed) lines.push(`| ${r.usedBy} | \`${r.file}\` |`);
lines.push(
  "",
  "## Legend",
  "",
  "- **Client** — file begins with `\"use client\"`.",
  "- **Test** — a colocated `*.test.ts(x)` exists.",
  "- **Used by** — count of other tracked modules importing it. `0` is expected for `app/` files:",
  "  the framework loads them; nothing imports them.",
  "- **Target** — destination under the approved *layer separation* structure. `PINNED` marks a",
  "  framework convention that must not move. Slice order is in [`MOVE-MAP.md`](MOVE-MAP.md).",
  "- **CR-nn** — a compatibility requirement from [`PRD.md`](PRD.md) §8. Breaking one breaks",
  "  something outside the codebase.",
  "",
  "## Modules"
);
for (const [title, pred] of GROUPS) {
  const selected = rows.filter((r) => pred(r.file));
  if (!selected.length) continue;
  lines.push("", `### ${title}`, "", "| Module | Purpose | LOC | Client | Test | Used by | Target |", "|---|---|--:|:-:|:-:|--:|---|");
  for (const r of selected) {
    const [purpose, target] = describe(r.file);
    lines.push(`| \`${r.file.replace(/^src\//, "")}\` | ${purpose} | ${r.loc} | ${tick(r.client)} | ${tick(r.tested)} | ${r.usedBy} | ${target} |`);
  }
}
lines.push("");

fs.writeFileSync(OUT, lines.join("\n"));
console.log(`wrote ${OUT}: ${rows.length} modules, ${violations.length} boundary violation(s), ${orphans.length} orphan(s)`);
