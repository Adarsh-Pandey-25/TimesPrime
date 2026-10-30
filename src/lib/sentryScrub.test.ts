import fs from "fs";
import path from "path";
import { scrubSentryEvent, SECRET_ENV_KEYS } from "./sentryScrub";

// Every env var the code reads that holds a secret. Derived by grepping
// process.env.* across src/ and next.config.ts (N-01), not from docs.
const EXPECTED_SECRET_KEYS = [
  "ANTHROPIC_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEWSDATA_API_KEY",
  // Read by app/api/admin/seed-supabase as a fallback for NEWSDATA_API_KEY,
  // so when set it holds the same secret despite the public prefix.
  "NEXT_PUBLIC_NEWSDATA_API_KEY",
  "ADMIN_PASSWORD",
  "ADMIN_SESSION_SECRET",
  "CRON_SECRET",
  "UPSTASH_REDIS_REST_TOKEN",
  "SENTRY_AUTH_TOKEN",
];

// Names that look secret but are public by design: the Supabase anon key is
// shipped to every browser and is guarded by row-level security, not secrecy.
const PUBLIC_BY_DESIGN = ["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of [...EXPECTED_SECRET_KEYS, ...PUBLIC_BY_DESIGN]) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function eventCarrying(value: string) {
  return {
    message: `request failed with ${value}`,
    exception: { values: [{ value: `Error: bad token ${value}` }] },
    breadcrumbs: [{ data: { header: `Bearer ${value}` } }],
    request: { headers: { authorization: value } },
  };
}

describe("scrubSentryEvent", () => {
  test.each(EXPECTED_SECRET_KEYS)("redacts %s wherever it appears in an event", (key) => {
    const secret = `${key.toLowerCase()}-value-1234567890`;
    process.env[key] = secret;

    const scrubbed = JSON.stringify(scrubSentryEvent(eventCarrying(secret)));

    expect(scrubbed).not.toContain(secret);
    expect(scrubbed.match(/\[REDACTED\]/g)).toHaveLength(4);
  });

  test("leaves the event untouched when no secret is set", () => {
    const event = eventCarrying("nothing-secret-here");
    expect(scrubSentryEvent(event)).toEqual(event);
  });

  test("does not treat a public-by-design key as a secret", () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-anon-key-1234567890";
    const event = eventCarrying("public-anon-key-1234567890");
    expect(scrubSentryEvent(event)).toEqual(event);
  });

  // Pins existing behaviour: values under 8 characters are skipped, so a short
  // value cannot shred every matching substring in an event.
  test("ignores values shorter than 8 characters", () => {
    process.env.CRON_SECRET = "short";
    const event = eventCarrying("short");
    expect(scrubSentryEvent(event)).toEqual(event);
  });

  test("does not mutate the event it is given", () => {
    process.env.ADMIN_PASSWORD = "admin-password-1234567890";
    const event = eventCarrying("admin-password-1234567890");
    const before = JSON.stringify(event);
    scrubSentryEvent(event);
    expect(JSON.stringify(event)).toBe(before);
  });
});

describe("SECRET_ENV_KEYS", () => {
  test("matches the expected list exactly", () => {
    expect([...SECRET_ENV_KEYS].sort()).toEqual([...EXPECTED_SECRET_KEYS].sort());
  });

  // The guard that keeps N-01 fixed: any env var the code reads whose name
  // says it is secret must be on the scrub list, or be declared public above.
  test("covers every secret-named env var the code reads", () => {
    const root = path.resolve(__dirname, "..", "..");
    const files: string[] = [path.join(root, "next.config.ts")];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(full);
      }
    };
    walk(path.join(root, "src"));

    const read = new Set<string>();
    for (const file of files) {
      for (const match of fs.readFileSync(file, "utf8").matchAll(/process\.env\.([A-Z0-9_]+)/g)) read.add(match[1]);
    }
    const secretNamed = [...read].filter((name) => /KEY|SECRET|TOKEN|PASSWORD/.test(name));

    expect(secretNamed.length).toBeGreaterThan(0);
    for (const name of secretNamed) {
      expect({ name, covered: SECRET_ENV_KEYS.includes(name as never) || PUBLIC_BY_DESIGN.includes(name) }).toEqual({
        name,
        covered: true,
      });
    }
  });
});
