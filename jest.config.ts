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
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};

export default createJestConfig(config);
