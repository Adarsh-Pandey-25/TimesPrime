// Import boundaries — rules F1–X1 and V1 (docs/architecture.md §5, ADR 0002),
// enforced by lint.
//
// Every message starts with the ID of the rule it implements. Path rules use
// import/no-restricted-paths (eslint-plugin-import, already installed by
// eslint-config-next) rather than core no-restricted-imports, because it
// judges the RESOLVED path: "@/backend/x" and "../../backend/x" are the same
// import to it, while the core rule only sees the string, which a relative
// path walks straight past. Resolution is eslint-config-next's TypeScript
// resolver, so tsconfig "paths" apply. Where two rules would match the same
// import, the zones are cut so that one reports it, in the order
// scripts/check-move-map.mjs applies them: D1, A1, F1, B1, S1, P1, CR-06, X1,
// V1, R3, R5, R9, R7, LIB.
//
// `npm run check:boundaries` (in verify and CI) tests the same rules over the
// whole import graph. What lint cannot see, and what covers it instead:
//  - F1 transitively (a client module importing a plain module that imports
//    backend/): every backend/ module begins with import "server-only", which
//    fails the build, and check:boundaries walks the client-bundle closure.
//    Lint checks each import as written.
//  - A2 for a route or page file that is gone: a missing file cannot be
//    linted. check:boundaries reports a moved body whose app/ file is missing.
//  - What app/ code does (the routing shell holds no business logic) is about
//    behaviour, not imports. Review enforces it.
import fs from "node:fs";
import path from "node:path";

import { SHIMS } from "./scripts/move-map.mjs";

// Relative to the working directory, which import/no-restricted-paths resolves
// zones against (its default basePath): lint runs from the repo root.
const APP = "./app";
const FRONTEND = "./frontend";
const BACKEND = "./backend";
const SHARED = "./shared";
const DATABASE = "./database";
const SCRIPTS = "./scripts";
const PROXY = "./proxy.ts";
const NEXT_CONFIG = "./next.config.ts";
// The root files Next pins in place, by the runtime they load in.
const CLIENT_ROOT = "./instrumentation-client.ts";
const SERVER_ROOT = ["./instrumentation.ts", "./sentry.server.config.ts", "./sentry.edge.config.ts"];
const FEATURES = "./frontend/features";
const VIEWS = "./frontend/views";
const UI = "./frontend/components/ui";
const CONTEXT = "./frontend/context";
const SERVICES = "./backend/services";
const CONFIG = "./shared/config";
const TYPES = "./shared/types";
const VALIDATION = "./shared/validation";

// Every file outside one top-level folder: the other folders, and the root files.
const outside = (dir) => [`./!(${dir})/**`, "./*"];
// A folder's modules, without its colocated tests. A test is not a module and
// never ships, so the rules about what a layer may import (X1's entry points,
// R5, R9, R7, LIB) leave tests out, as check:boundaries does.
const modules = (dir) => `${dir}/**/!(*.test).{ts,tsx}`;

// Features and services are read from disk, so X1 covers a new one the day it
// is created. A service's index.ts, where it has one, is its entry point.
const subdirs = (dir) => fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const features = subdirs(FEATURES);
const services = subdirs(SERVICES);
const servicesWithEntry = services.filter((s) => fs.existsSync(`${SERVICES}/${s}/index.ts`));
const backendBelowServices = subdirs(BACKEND).filter((d) => d !== "services").map((d) => `${BACKEND}/${d}`);

const zones = [
  // D1 — nothing imports database/.
  {
    target: outside("database"),
    from: DATABASE,
    message: "D1: nothing imports database/. It holds the SQL and the seed script, which are applied by hand; no code depends on them.",
  },
  // A1 — app/ composes frontend/, backend/ and shared/, and is the only place
  // they meet. Nothing outside it imports app/ ...
  {
    target: outside("app"),
    from: APP,
    message: "A1: nothing outside app/ imports app/. app/ is the routing shell on top: it imports frontend/, backend/ and shared/, never the other way round.",
  },
  // ... and the pinned root files keep to their runtime's side.
  {
    target: CLIENT_ROOT,
    from: BACKEND,
    message: "A1: instrumentation-client.ts runs in the browser and never imports backend/. Only app/ joins frontend and backend.",
  },
  {
    target: SERVER_ROOT,
    from: FRONTEND,
    message: "A1: server instrumentation never imports frontend/. Only app/ joins frontend and backend.",
  },
  // F1 — frontend never imports backend.
  {
    target: FRONTEND,
    from: BACKEND,
    message: "F1: frontend/ never imports backend/. Backend data reaches the UI through app/ (a page passes it as props) or an API route.",
  },
  // B1 — backend never imports frontend.
  {
    target: BACKEND,
    from: FRONTEND,
    message: "B1: backend/ never imports frontend/. What both sides need belongs in shared/.",
  },
  // S1 — shared imports nothing from frontend/ or backend/ (app/ is A1's).
  {
    target: SHARED,
    from: [FRONTEND, BACKEND],
    message: "S1: shared/ imports nothing from frontend/, backend/ or app/. Both sides import it, so it can depend on neither.",
  },
  // P1 — the proxy imports only backend/auth and shared/ (app/ is A1's, database/ D1's).
  {
    target: PROXY,
    from: BACKEND,
    except: ["./auth"],
    message: "P1: proxy.ts imports only backend/auth and shared/. Authorisation is one choke point, and what it needs lives in backend/auth.",
  },
  {
    target: PROXY,
    from: [FRONTEND, SCRIPTS],
    message: "P1: proxy.ts imports only backend/auth and shared/.",
  },
  // CR-06 — next.config.ts imports only shared/config (app/ is A1's, database/ D1's).
  {
    target: NEXT_CONFIG,
    from: SHARED,
    except: ["./config"],
    message: "CR-06: next.config.ts imports only shared/config. Next evaluates it at config-load time.",
  },
  {
    target: NEXT_CONFIG,
    from: [FRONTEND, BACKEND, SCRIPTS],
    message: "CR-06: next.config.ts imports only shared/config. Next evaluates it at config-load time.",
  },
  // X1 — no imports between features ...
  ...features.flatMap((a) =>
    features.filter((b) => b !== a).map((b) => ({
      target: `${FEATURES}/${a}`,
      from: `${FEATURES}/${b}`,
      message: `X1: frontend/features/${a} may not import frontend/features/${b}. Move what both need down a layer (frontend/components/ui or shared/).`,
    })),
  ),
  // ... and from outside a feature, only its index.ts. (Other features are
  // barred above, ui/ and context/ by R3, backend/ by B1, shared/ by S1.)
  ...features.map((f) => ({
    target: [modules(APP), modules(VIEWS), CLIENT_ROOT],
    from: `${FEATURES}/${f}`,
    except: ["./index.ts"],
    message: `X1: import frontend/features/${f} through "@/frontend/features/${f}" (its index.ts), not its internals.`,
  })),
  // X1 — the same for backend services: no imports between them ...
  ...services.flatMap((a) =>
    services.filter((b) => b !== a).map((b) => ({
      target: `${SERVICES}/${a}`,
      from: `${SERVICES}/${b}`,
      message: `X1: backend/services/${a} may not import backend/services/${b}. Services never import each other; move what both need down a layer.`,
    })),
  ),
  // ... and a service with an index.ts is reached only through it.
  ...servicesWithEntry.map((s) => ({
    target: [modules(APP), ...backendBelowServices.map(modules), ...SERVER_ROOT],
    from: `${SERVICES}/${s}`,
    except: ["./index.ts"],
    message: `X1: import backend/services/${s} through "@/backend/services/${s}" (its index.ts), not its internals.`,
  })),
  // V1 — features never import views.
  {
    target: FEATURES,
    from: VIEWS,
    message: "V1: frontend/features never imports frontend/views. A view composes features through their entry points; a feature that imports a view closes a cycle.",
  },
  // R3 — ui and context sit below features and views.
  {
    target: [UI, CONTEXT],
    from: [FEATURES, VIEWS],
    message: "R3: frontend/components/ui and frontend/context sit below features and views, and never import them.",
  },
  // R5 — ui imports only ui/, shared/types, shared/validation and ThemeContext.
  {
    target: modules(UI),
    from: CONTEXT,
    except: ["./ThemeContext.tsx"],
    message: "R5: frontend/components/ui may read the theme (ThemeContext), but no other app state.",
  },
  {
    target: modules(UI),
    from: CONFIG,
    message: "R5: frontend/components/ui imports only ui/, shared/types, shared/validation and ThemeContext. shared/config holds product data.",
  },
  // R9 — context imports only shared/config and shared/types.
  {
    target: modules(CONTEXT),
    from: [UI, VALIDATION],
    message: "R9: frontend/context imports only shared/config and shared/types.",
  },
  // R7 — config imports only config and types; types import only types.
  {
    target: modules(CONFIG),
    from: VALIDATION,
    message: "R7: shared/config imports only shared/config and shared/types.",
  },
  {
    target: modules(TYPES),
    from: [CONFIG, VALIDATION],
    message: "R7: shared/types imports only shared/types.",
  },
  // LIB — backend/lib is domain-free: it imports no project module.
  {
    target: modules("./backend/lib"),
    from: [BACKEND, SHARED, SCRIPTS],
    message: "LIB: backend/lib is domain-free and imports no project module. A module that needs one belongs in a service or a repository.",
  },
];

// ---- local rules ------------------------------------------------------------
// tsconfig "paths", one alias per layer. Kept in step with tsconfig.json.
const ALIASES = [
  ["@/frontend/", "frontend/"],
  ["@/backend/", "backend/"],
  ["@/shared/", "shared/"],
];
const relative = (filename) => path.relative(process.cwd(), filename).split(path.sep).join("/");

function resolveSpecifier(spec, filename) {
  const alias = ALIASES.find(([prefix]) => spec.startsWith(prefix));
  if (alias) return alias[1] + spec.slice(alias[0].length);
  if (!spec.startsWith(".")) return null; // a package
  return path.posix.normalize(path.posix.join(path.posix.dirname(relative(filename)), spec));
}

const hasUseClient = (program) =>
  program.body.some((s) => s.type === "ExpressionStatement" && s.directive === "use client");

// F1 in app/: A1 lets app/ import backend/, but a "use client" module there is
// part of the client bundle. (In frontend/, the F1 zone already bars every
// backend/ import, client module or not.)
const noServerInClient = {
  meta: {
    type: "problem",
    docs: { description: "F1: a \"use client\" module may not import backend/" },
    schema: [],
    messages: {
      server:
        "F1: a \"use client\" module may not import backend/ ({{target}}). import \"server-only\" would fail the build; this says so at lint time.",
    },
  },
  create(context) {
    let client = false;
    const check = (node, source, typeOnly) => {
      if (!client || typeOnly || !source || typeof source.value !== "string") return;
      const target = resolveSpecifier(source.value, context.filename);
      if (target && /^backend(\/|$)/.test(target)) context.report({ node, messageId: "server", data: { target } });
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

// F1, at build time: a backend/ module begins with import "server-only", so a
// client import of it fails the build instead of shipping server code.
const serverOnlyFirst = {
  meta: {
    type: "problem",
    docs: { description: "F1: backend/ modules begin with import \"server-only\"" },
    schema: [],
    messages: {
      missing:
        "F1: the first statement of a backend/ module must be `import \"server-only\";`, so a client import of it fails the build.",
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

// A2 — an app/ route file, and a page whose body moved to frontend/views/,
// holds only re-exports and literal segment config. The moved pages are
// SHIMS, derived from the move map; check:boundaries checks the same files.
const SEGMENT_CONFIG = new Set(["dynamic", "dynamicParams", "revalidate", "fetchCache", "runtime", "preferredRegion", "maxDuration"]);
const SHIM_FILES = new Set(SHIMS);
const isLiteral = (n) =>
  (n.type === "Literal" && ["string", "number", "boolean"].includes(typeof n.value)) ||
  (n.type === "TemplateLiteral" && n.expressions.length === 0) ||
  (n.type === "ArrayExpression" && n.elements.every((e) => e !== null && isLiteral(e)));
const isShimStatement = (st) =>
  (st.type === "ExportNamedDeclaration" && st.source !== null) ||
  st.type === "ExportAllDeclaration" ||
  (st.type === "ExportNamedDeclaration" &&
    st.declaration?.type === "VariableDeclaration" &&
    st.declaration.declarations.every(
      (d) => d.id.type === "Identifier" && SEGMENT_CONFIG.has(d.id.name) && d.init !== null && isLiteral(d.init),
    ));

const shimOnly = {
  meta: {
    type: "problem",
    docs: { description: "A2: app/ route files and moved pages hold only re-exports and literal segment config" },
    schema: [],
    messages: {
      statement:
        "A2: {{file}} holds only re-exports and literal segment config, and this statement is neither. Put the code in {{home}} and re-export it.",
    },
  },
  create(context) {
    const file = relative(context.filename);
    const route = file.endsWith("/route.ts");
    if (!route && !SHIM_FILES.has(file)) return {};
    return {
      Program(node) {
        for (const st of node.body) {
          if (!isShimStatement(st))
            context.report({ node: st, messageId: "statement", data: { file, home: route ? "backend/api/" : "frontend/views/" } });
        }
      },
    };
  },
};

export const boundaries = [
  {
    // The files eslint-config-next registers the import plugin for.
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    plugins: {
      boundaries: { rules: { "no-server-in-client": noServerInClient, "server-only-first": serverOnlyFirst, "shim-only": shimOnly } },
    },
    rules: { "import/no-restricted-paths": ["error", { zones }] },
  },
  {
    files: ["app/**/*.{ts,tsx}"],
    rules: {
      "boundaries/no-server-in-client": "error",
      "boundaries/shim-only": "error",
    },
  },
  {
    files: ["backend/**/*.ts"],
    // A colocated test is not a module and never ships; next/jest maps
    // server-only to an empty module.
    ignores: ["**/*.test.ts"],
    rules: { "boundaries/server-only-first": "error" },
  },
  // R7 — shared/config holds static data: no React, no server-only.
  {
    files: ["shared/config/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          { name: "react", message: "R7: shared/config is static data — no React." },
          { name: "react-dom", message: "R7: shared/config is static data — no React." },
          { name: "server-only", message: "R7: shared/config is read at config-load time and by client code — no server-only." },
        ],
        patterns: [{ group: ["react/*", "react-dom/*"], message: "R7: shared/config is static data — no React." }],
      }],
    },
  },
  // CR-06 — next.config.ts evaluates imageDomains.ts at config-load time, so it imports nothing.
  {
    files: ["shared/config/imageDomains.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ regex: ".*", message: "CR-06: imageDomains.ts imports nothing; next.config.ts evaluates it at config-load time." }],
      }],
    },
  },
];
