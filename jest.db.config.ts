import type { Config } from "jest";
import nextJest from "next/jest.js";

// The database tests (`*.db.test.ts`): against the local Supabase stack, never a mock. Run them with
// `npm run test:db`, which goes through scripts/localdb/run.mjs: it loads .env.localdb (never
// .env.local) and refuses to start unless the database is local. Each test file checks the guard
// again before it connects. One worker, in file order: they share one database.
//
// `npm test` (jest.config.ts) ignores these files, so the unit suite never needs a database.
const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/**/*.db.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/.next/"],
  maxWorkers: 1,
  testTimeout: 30_000,
  moduleNameMapper: {
    "^@/frontend/(.*)$": "<rootDir>/frontend/$1",
    "^@/backend/(.*)$": "<rootDir>/backend/$1",
    "^@/shared/(.*)$": "<rootDir>/shared/$1",
  },
};

export default createJestConfig(config);
