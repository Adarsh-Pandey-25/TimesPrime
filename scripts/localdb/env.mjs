// Reads `.env.localdb` and checks it is complete. The launcher passes every value it holds to the
// process it starts, and Next's env loader never overrides a variable already in the process
// (process.env comes first in its load order), so none of `.env.local`'s values is used. For that to
// hold, `.env.localdb` must set every variable `.env.local.example` sets: a missing one would fall
// through to `.env.local`. `missingKeys` finds them, and the launcher refuses to start.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** KEY=VALUE lines; comments and blank lines skipped; surrounding quotes removed. */
export function parseEnv(text) {
  const out = {};
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

/** The variables `.env.local.example` assigns: the ones the code reads (its sync test keeps that true). */
export function requiredKeys(exampleText) {
  return [...exampleText.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]);
}

export function missingKeys(localdb, required) {
  return required.filter((key) => !Object.prototype.hasOwnProperty.call(localdb, key));
}

export function loadLocalDb(file = path.join(ROOT, ".env.localdb")) {
  if (!fs.existsSync(file)) return null;
  return parseEnv(fs.readFileSync(file, "utf8"));
}

export function loadRequired() {
  return requiredKeys(fs.readFileSync(path.join(ROOT, ".env.local.example"), "utf8"));
}
