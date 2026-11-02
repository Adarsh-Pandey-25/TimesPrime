// The launcher for every run against the local database:
//
//   node scripts/localdb/run.mjs next dev -p 3100        (npm run dev:local)
//   node scripts/localdb/run.mjs next build | next start  (npm run start:local)
//   node scripts/localdb/run.mjs jest -c jest.db.config.ts (npm run test:db)
//   node scripts/localdb/run.mjs playwright test          (npm run test:e2e)
//
// It loads `.env.localdb` (never `.env.local`), refuses to start if any variable the code reads is
// missing from it (it would fall through to `.env.local`), runs the guard on the database URLs, and
// only then starts the tool with those values in its environment. Spawned from Node so an empty value
// stays "set" (HANDOFF §3.20). Option `--env-file <path>` uses another file (for the guard's tests).

import path from "path";
import { spawn } from "child_process";
import { ROOT, loadLocalDb, loadRequired, missingKeys } from "./env.mjs";
import { checkEnv } from "./guard.mjs";

const TOOLS = {
  next: "node_modules/next/dist/bin/next",
  jest: "node_modules/jest/bin/jest.js",
  playwright: "node_modules/@playwright/test/cli.js",
};

let args = process.argv.slice(2);
let envFile;
if (args[0] === "--env-file") {
  envFile = path.resolve(args[1]);
  args = args.slice(2);
}
const [tool, ...rest] = args;
if (!TOOLS[tool]) {
  console.error(`usage: run.mjs [--env-file <path>] <${Object.keys(TOOLS).join("|")}> [args...]`);
  process.exit(64);
}

const localdb = loadLocalDb(envFile);
if (!localdb) {
  console.error("REFUSED: .env.localdb not found. Create it with: node scripts/local-db.mjs env");
  process.exit(2);
}
const missing = missingKeys(localdb, loadRequired());
if (missing.length) {
  console.error(`REFUSED: .env.localdb does not set ${missing.join(", ")}. Each would come from .env.local instead.`);
  process.exit(2);
}
const verdict = checkEnv(localdb);
console.error(`[localdb] ${verdict.message}`);
if (!verdict.ok) process.exit(3);

const child = spawn(process.execPath, [path.join(ROOT, TOOLS[tool]), ...rest], {
  cwd: ROOT,
  env: { ...process.env, ...localdb },
  stdio: "inherit",
});
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
