// The local database: the Supabase CLI stack in Docker (supabase/config.toml), and the repository's
// SQL applied to it in order. Never production: every command here talks to the local container
// only, and the app and tests reach it through scripts/localdb/run.mjs, which runs the guard.
//
//   node scripts/local-db.mjs start         start the stack (minimal services), then apply "base"
//   node scripts/local-db.mjs stop          stop the stack (data kept in its Docker volume)
//   node scripts/local-db.mjs reset         recreate the database empty, then apply "base"
//   node scripts/local-db.mjs apply <set|file...>
//        base    database/schema.sql, policies.sql, migrations/2026-11-02-indexes.sql
//        access  the Panel 0 migrations access-1 and access-2 (access-3, the freeze, is separate)
//   node scripts/local-db.mjs sql "<query>" run one query as postgres and print the result
//   node scripts/local-db.mjs env [--force]  write .env.localdb from .env.localdb.example and the
//                                           stack's keys (`supabase status -o env`)
//
// SQL goes in through `docker exec ... psql` in the database container, so no local psql is needed.
// The container is supabase_db_<project_id>, and project_id is "timesprime" (supabase/config.toml).

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = "supabase_db_timesprime";
// Not needed by the app or the tests; off to fit the owner's 5 GB WSL limit (supabase/config.toml).
const EXCLUDED = ["vector", "imgproxy", "supavisor", "logflare", "realtime", "storage-api", "edge-runtime"];
const SETS = {
  base: ["database/schema.sql", "database/policies.sql", "database/migrations/2026-11-02-indexes.sql"],
  access: ["database/migrations/2026-11-02-access-1-foundation.sql", "database/migrations/2026-11-02-access-2-catalog.sql"],
};

const supabase = (...args) => {
  const r = spawnSync(process.execPath, [path.join(ROOT, "node_modules/supabase/dist/supabase.js"), ...args], { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

function psql(input, label) {
  const r = spawnSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-X", "-q", "-f", "-"], {
    input,
    encoding: "utf8",
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    console.error(`FAILED: ${label} (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

function apply(names) {
  const files = names.flatMap((n) => SETS[n] ?? [n]);
  for (const file of files) {
    console.log(`--- applying ${file}`);
    psql(fs.readFileSync(path.join(ROOT, file), "utf8"), file);
  }
}

function writeEnv(force) {
  const target = path.join(ROOT, ".env.localdb");
  if (fs.existsSync(target) && !force) {
    console.log(".env.localdb exists; left as it is (use --force to rewrite it)");
    return;
  }
  const status = execFileSync(process.execPath, [path.join(ROOT, "node_modules/supabase/dist/supabase.js"), "status", "-o", "env"], { cwd: ROOT, encoding: "utf8" });
  const keys = Object.fromEntries([...status.matchAll(/^([A-Z_]+)="?([^"\n]*)"?$/gm)].map((m) => [m[1], m[2]]));
  for (const k of ["API_URL", "ANON_KEY", "SERVICE_ROLE_KEY", "DB_URL"]) {
    if (!keys[k]) {
      console.error(`supabase status did not report ${k}; is the stack running?`);
      process.exit(1);
    }
  }
  const text = fs
    .readFileSync(path.join(ROOT, ".env.localdb.example"), "utf8")
    .replace(/^NEXT_PUBLIC_SUPABASE_URL=.*$/m, `NEXT_PUBLIC_SUPABASE_URL=${keys.API_URL}`)
    .replace(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=.*$/m, `NEXT_PUBLIC_SUPABASE_ANON_KEY=${keys.ANON_KEY}`)
    .replace(/^SUPABASE_SERVICE_ROLE_KEY=.*$/m, `SUPABASE_SERVICE_ROLE_KEY=${keys.SERVICE_ROLE_KEY}`)
    .replace(/^LOCAL_DB_URL=.*$/m, `LOCAL_DB_URL=${keys.DB_URL}`);
  fs.writeFileSync(target, text);
  console.log(`wrote .env.localdb (Supabase ${keys.API_URL}; the local stack's well-known development keys)`);
}

const [command, ...args] = process.argv.slice(2);
switch (command) {
  case "start":
    supabase("start", "-x", EXCLUDED.join(","));
    apply(["base"]);
    break;
  case "stop":
    supabase("stop");
    break;
  case "reset":
    supabase("db", "reset");
    apply(["base"]);
    break;
  case "apply":
    if (!args.length) throw new Error("apply what? base, access, or file paths");
    apply(args);
    break;
  case "sql":
    psql(`${args.join(" ")}\n`, "query");
    break;
  case "env":
    writeEnv(args.includes("--force"));
    break;
  default:
    console.error("usage: local-db.mjs start | stop | reset | apply <base|access|file...> | sql \"<query>\" | env [--force]");
    process.exit(64);
}
