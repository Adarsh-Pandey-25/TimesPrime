// Checks the documentation: the owner keeps four Markdown files, all in docs/.
//
//   node backend/scripts/check-docs.mjs
//
// 1. The only Markdown files in the repository are DOCS below. node_modules,
//    .git and build output aside, any other .md file fails, tracked or not (an
//    untracked one is how a tool's generated file would arrive).
// 2. Every relative link in the four resolves: the file or folder exists, and an
//    anchor names a heading of the target file, by GitHub's anchor rules.
//
// It runs in `npm run verify` and CI (`npm run check:docs`). Exit code 1 on any
// failure, each one printed with its file and line.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DOCS = ["docs/README.md", "docs/ARCHITECTURE.md", "docs/OPERATIONS.md", "docs/PANEL_DOCS.md"];
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "coverage", ".swc"]);

// GitHub's heading anchor: the rendered text, lower-cased, with everything but
// letters, digits, marks, "_", "-" and spaces removed, and each space a "-".
// Inline code, emphasis and link syntax render to their text first.
export function slug(heading) {
  const text = heading
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[`*~]/g, "");
  return text.trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, "").replace(/ /g, "-");
}

// Lines outside fenced code blocks, with their 1-based numbers.
function proseLines(markdown) {
  const out = [];
  let fence = null;
  markdown.split(/\r?\n/).forEach((line, i) => {
    const m = line.match(/^\s*(```+|~~~+)/);
    if (m) {
      if (!fence) fence = m[1][0];
      else if (m[1][0] === fence) fence = null;
      return;
    }
    if (!fence) out.push({ line, n: i + 1 });
  });
  return out;
}

// Every heading's anchor, in order; a repeated anchor gets -1, -2, ... as on GitHub.
export function headings(markdown) {
  const seen = new Map();
  const out = [];
  for (const { line, n } of proseLines(markdown)) {
    const m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (!m) continue;
    const base = slug(m[2]);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    out.push({ level: m[1].length, text: m[2], anchor: count ? `${base}-${count}` : base, n });
  }
  return out;
}

// Inline links [text](target), outside code blocks and code spans.
export function links(markdown) {
  const out = [];
  for (const { line, n } of proseLines(markdown)) {
    const bare = line.replace(/`[^`]*`/g, (s) => " ".repeat(s.length));
    for (const m of bare.matchAll(/\[(?:[^\]\[]|\[[^\]]*\])*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) out.push({ target: m[1], n });
  }
  return out;
}

function markdownFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) markdownFiles(path.join(dir, e.name), acc);
    } else if (/\.(md|mdx|markdown)$/i.test(e.name)) acc.push(path.relative(REPO, path.join(dir, e.name)).split(path.sep).join("/"));
  }
  return acc;
}

export function check() {
  const problems = [];
  for (const f of markdownFiles(REPO)) if (!DOCS.includes(f)) problems.push(`${f}: a Markdown file outside the four in docs/ (${DOCS.join(", ")})`);
  const anchorsOf = new Map();
  const anchorSet = (file) => {
    if (!anchorsOf.has(file)) anchorsOf.set(file, new Set(headings(fs.readFileSync(path.join(REPO, file), "utf8")).map((h) => h.anchor)));
    return anchorsOf.get(file);
  };
  let checked = 0;
  for (const doc of DOCS) {
    if (!fs.existsSync(path.join(REPO, doc))) { problems.push(`${doc}: missing`); continue; }
    for (const { target, n } of links(fs.readFileSync(path.join(REPO, doc), "utf8"))) {
      if (/^(https?:|mailto:)/i.test(target)) continue;
      checked++;
      const [rawPath, anchor] = target.split("#");
      const file = rawPath === "" ? doc : path.posix.normalize(path.posix.join(path.posix.dirname(doc), decodeURI(rawPath)));
      if (file.startsWith("..") || !fs.existsSync(path.join(REPO, file))) { problems.push(`${doc}:${n}: ${target} — no such file (${file})`); continue; }
      if (anchor !== undefined && /\.md$/i.test(file) && !anchorSet(file).has(anchor)) problems.push(`${doc}:${n}: ${target} — no heading with anchor #${anchor} in ${file}`);
    }
  }
  return { problems, checked };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const { problems, checked } = check();
  console.log(`${DOCS.length} docs · ${checked} relative links checked`);
  for (const p of problems) console.log(`DOCS  ${p}`);
  console.log(`\n${problems.length} problem(s)`);
  process.exit(problems.length ? 1 : 0);
}
