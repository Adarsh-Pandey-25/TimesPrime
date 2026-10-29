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
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/*.test.{ts,tsx}",
    "!src/types/**",
    "!src/instrumentation.ts",
    "!src/instrumentation-client.ts",
    "!src/sentry.*.config.ts",
  ],
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};

export default createJestConfig(config);
