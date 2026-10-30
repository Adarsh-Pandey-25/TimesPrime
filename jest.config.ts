import type { Config } from "jest";
import nextJest from "next/jest.js";

// next/jest handles: SWC-based TS/JSX transform matching the app's own
// build, .env loading, next.config.ts loading, and mocking CSS/image/font
// imports — the recommended setup for this Next.js version over ts-jest,
// which doesn't share Next's own SWC pipeline.
const createJestConfig = nextJest({
  dir: "./",
});

const config: Config = {
  coverageProvider: "v8",
  // Without this, coverage only instruments files a test happens to import,
  // which reported 91.42% while actually describing 5 of 73 source files.
  // Measuring the whole tree makes the number mean what it appears to mean.
  // Exclusions are files with no meaningful runtime branches to cover:
  // type-only modules, and the Sentry/instrumentation entrypoints, which are
  // location-pinned Next.js conventions that only call SDK init.
  // The globs name no folder, so moving code (restructure 2 empties src/)
  // cannot quietly drop it from the measurement; root tooling is excluded.
  collectCoverageFrom: [
    "**/*.{ts,tsx}",
    "!**/node_modules/**",
    "!**/*.d.ts",
    "!**/*.test.{ts,tsx}",
    "!**/types/**",
    "!**/instrumentation.ts",
    "!**/instrumentation-client.ts",
    "!**/sentry.*.config.ts",
    "!next.config.ts",
    "!jest.config.ts",
    "!jest.setup.ts",
  ],
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    // Mirrors tsconfig "paths", as the Next jest guide recommends. In practice
    // next/jest's SWC transform already rewrites those aliases in transformed
    // files (measured: the @/ui probe passed with this line removed), so this
    // is the fallback for anything that bypasses the transform. Order matters:
    // Jest takes the first match, so every alias that does not map 1:1 onto
    // the repo root comes before the catch-all.
    "^@/frontend/(.*)$": "<rootDir>/frontend/$1",
    "^@/backend/(.*)$": "<rootDir>/backend/$1",
    "^@/shared/(.*)$": "<rootDir>/shared/$1",
    "^@/ui/(.*)$": "<rootDir>/components/ui/$1",
    "^@/(.*)$": "<rootDir>/$1",
  },
};

export default createJestConfig(config);
