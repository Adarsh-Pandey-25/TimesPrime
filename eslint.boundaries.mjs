// Import boundaries — the rules in docs/architecture.md §5, enforced by lint.
//
// Each block below names the architecture rule it implements. Most use
// import/no-restricted-paths (eslint-plugin-import, already installed by
// eslint-config-next) rather than core no-restricted-imports, because it
// judges the RESOLVED path: "@/server/x" and "../../server/x" are the same
// import to it, while the core rule only sees the string, which a relative
// path walks straight past. Resolution is eslint-config-next's TypeScript
// resolver, so tsconfig "paths" apply.
//
// What lint cannot see, and what covers it instead:
//  - Rule 6 transitively (a client module importing a plain module that
//    imports server/): `import "server-only"` fails the build, and
//    scripts/check-move-map.mjs walks the client bundle closure. Lint checks
//    the direct import only.
//  - Rule 8 (app/ holds no business logic) is about what code does, not what
//    it imports. Review enforces it.
//  - Rule 4 (shared things move down) is the remedy for rule 2, not a check.
import path from "node:path";

const FEATURES = ["news", "admin", "chat"];
const feature = (f) => `./src/features/${f}`;
const APP = "./src/app";
const PINNED = [
  "./src/proxy.ts",
  "./src/instrumentation.ts",
  "./src/instrumentation-client.ts",
  "./src/sentry.server.config.ts",
  "./src/sentry.edge.config.ts",
];
const UI = "./src/components/ui";
const CONTEXT = "./src/context";
const SERVER = "./src/server";
const LIB = "./src/lib";
const CONFIG = "./src/config";
const TYPES = "./src/types";

const zones = [
  // Rule 2 — no sideways imports between features.
  ...FEATURES.flatMap((a) =>
    FEATURES.filter((b) => b !== a).map((b) => ({
      target: feature(a),
      from: feature(b),
      message: `Rule 2: features/${a} may not import features/${b}. Move what both need into a shared layer (rule 4).`,
    })),
  ),
  // Rule 1 — outside a feature, only its two surfaces are public. (Other
  // features are already barred by rule 2, shared layers by rule 3.)
  ...FEATURES.map((f) => ({
    target: [APP, ...PINNED],
    from: feature(f),
    except: ["./index.ts", "./server.ts"],
    message: `Rule 1: import features/${f} through "@/features/${f}" or "@/features/${f}/server", not its internals.`,
  })),
  // Rule 3 — shared layers never import upward into a feature.
  {
    target: [UI, CONTEXT, SERVER, CONFIG, TYPES],
    from: "./src/features",
    message: "Rule 3: shared layers import downward only; a feature is above them.",
  },
  // What lib/ means — cross-cutting and domain-free: it imports no project module.
  {
    target: LIB,
    from: "./src",
    message: "lib/ is domain-free and imports no project module (architecture.md, \"What lib/ means\"). A module that needs one belongs elsewhere.",
  },
  // Rule 6 — components/ui never imports server/.
  { target: UI, from: SERVER, message: "Rule 6: components/ui may not import server/." },
  // Rule 5 — components/ui imports only ui, lib, types and context/ThemeContext.
  {
    target: UI,
    from: CONTEXT,
    except: ["./ThemeContext.tsx"],
    message: "Rule 5: components/ui may read the theme, but no other app state.",
  },
  {
    target: UI,
    from: [CONFIG, APP],
    message: "Rule 5: components/ui imports only ui/, lib/, types/ and ThemeContext — config/ holds product data.",
  },
  // Rule 7 — config/ imports only config/ and types/.
  {
    target: CONFIG,
    from: [APP, "./src/components", CONTEXT, SERVER, LIB],
    message: "Rule 7: config/ imports only config/ and types/.",
  },
  // context/ (rule R9) — imports only config/ and types/.
  {
    target: CONTEXT,
    from: [APP, "./src/components", SERVER, LIB],
    message: "context/ imports only config/ and types/ (architecture.md, \"What context/ means\").",
  },
];

// ---- local rules ------------------------------------------------------------
// tsconfig "paths", longest prefix first. Kept in step with tsconfig.json.
const ALIASES = [
  ["@/features/", "src/features/"],
  ["@/server/", "src/server/"],
  ["@/config/", "src/config/"],
  ["@/lib/", "src/lib/"],
  ["@/ui/", "src/components/ui/"],
  ["@/", "src/"],
];
const isServerPath = (p) => /^src\/server(\/|$)/.test(p) || /^src\/features\/[^/]+\/server(\.ts|\/|$)/.test(p);

function resolveSpecifier(spec, filename) {
  const alias = ALIASES.find(([prefix]) => spec.startsWith(prefix));
  if (alias) return alias[1] + spec.slice(alias[0].length);
  if (!spec.startsWith(".")) return null; // a package
  const from = path.relative(process.cwd(), filename).split(path.sep).join("/");
  return path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
}

const hasUseClient = (program) =>
  program.body.some((s) => s.type === "ExpressionStatement" && s.directive === "use client");

const noServerInClient = {
  meta: {
    type: "problem",
    docs: { description: "Rule 6: a \"use client\" module may not import server/ or a feature's server.ts" },
    schema: [],
    messages: {
      server:
        "Rule 6: a \"use client\" module may not import server code ({{target}}). import \"server-only\" would fail the build; this says so at lint time.",
    },
  },
  create(context) {
    let client = false;
    const check = (node, source, typeOnly) => {
      if (!client || typeOnly || !source || typeof source.value !== "string") return;
      const target = resolveSpecifier(source.value, context.filename);
      if (target && isServerPath(target)) context.report({ node, messageId: "server", data: { target } });
    };
    return {
      Program(node) { client = hasUseClient(node); },
      ImportDeclaration(node) {
        const allTypes = node.specifiers.length > 0 && node.specifiers.every((s) => s.importKind === "type");
        check(node, node.source, node.importKind === "type" || allTypes);
      },
      ExportNamedDeclaration(node) { check(node, node.source, node.exportKind === "type"); },
      ExportAllDeclaration(node) { check(node, node.source, node.exportKind === "type"); },
      ImportExpression(node) { check(node, node.source, false); },
    };
  },
};

const serverOnlyFirst = {
  meta: {
    type: "problem",
    docs: { description: "Rule 6: server modules begin with import \"server-only\"" },
    schema: [],
    messages: {
      missing:
        "Rule 6: the first statement of a server module must be `import \"server-only\";`, so a client import of it fails the build.",
    },
  },
  create(context) {
    return {
      Program(node) {
        const first = node.body[0];
        const ok =
          first &&
          first.type === "ImportDeclaration" &&
          first.source.value === "server-only" &&
          first.specifiers.length === 0;
        if (!ok) context.report({ node: first ?? node, messageId: "missing" });
      },
    };
  },
};

export const boundaries = [
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries: { rules: { "no-server-in-client": noServerInClient, "server-only-first": serverOnlyFirst } } },
    rules: {
      "import/no-restricted-paths": ["error", { zones }],
      "boundaries/no-server-in-client": "error",
    },
  },
  {
    files: ["src/server/**/*.ts", "src/features/*/server.ts"],
    rules: { "boundaries/server-only-first": "error" },
  },
  // Rule 7 — config/ holds static data: no React, no server-only.
  {
    files: ["src/config/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          { name: "react", message: "Rule 7: config/ is static data — no React." },
          { name: "react-dom", message: "Rule 7: config/ is static data — no React." },
          { name: "server-only", message: "Rule 7: config/ is read at config-load time and by client code — no server-only." },
        ],
        patterns: [{ group: ["react/*", "react-dom/*"], message: "Rule 7: config/ is static data — no React." }],
      }],
    },
  },
  // CR-06 — next.config.ts evaluates imageDomains.ts at config-load time, so it imports nothing.
  {
    files: ["src/config/imageDomains.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ regex: ".*", message: "CR-06: imageDomains.ts imports nothing; next.config.ts evaluates it at config-load time." }],
      }],
    },
  },
];
