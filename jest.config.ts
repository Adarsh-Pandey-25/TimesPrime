import type { Config } from "jest";
import nextJest from "next/jest.js";

// One Jest run over the monorepo: a project per app, each with its own `@/` alias and its own
// Next config (next/jest: the SWC transform the app builds with, .env loading, mocks for CSS,
// images, fonts and server-only), and one project for the shared packages.

// Mirrors the packages' `exports` (packages/*/package.json), as the Next jest guide recommends
// mirroring tsconfig paths.
const PACKAGES = {
  "^@timesprime/server/(.*)$": "<rootDir>/packages/server/src/$1",
  "^@timesprime/shared/(.*)$": "<rootDir>/packages/shared/src/$1",
  "^@timesprime/ui/(.*)$": "<rootDir>/packages/ui/src/$1",
};

async function project(name: string, nextDir: string, root: string, alias?: string): Promise<Config> {
  const config = await nextJest({ dir: nextDir })({
    displayName: name,
    rootDir: process.cwd(),
    roots: [`<rootDir>/${root}`],
    testEnvironment: "jsdom",
    setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
    moduleNameMapper: { ...(alias ? { "^@/(.*)$": `<rootDir>/${alias}/$1` } : {}), ...PACKAGES },
  })();
  return config as Config;
}

export default async function config(): Promise<Config> {
  return {
    coverageProvider: "v8",
    // Without this, coverage only instruments files a test happens to import, which once
    // reported 91.42% while describing 5 of 73 source files. Exclusions are files with no
    // runtime branches to cover: type-only modules and the Sentry/instrumentation entrypoints.
    collectCoverageFrom: [
      "apps/*/src/**/*.{ts,tsx}",
      "packages/*/src/**/*.{ts,tsx}",
      "!**/*.d.ts",
      "!**/*.test.{ts,tsx}",
      "!packages/shared/src/types/**",
      "!apps/*/src/instrumentation*.ts",
      "!apps/*/src/sentry.*.config.ts",
    ],
    projects: [
      await project("web", "./apps/web", "apps/web", "apps/web/src"),
      await project("admin", "./apps/admin", "apps/admin", "apps/admin/src"),
      await project("worker", "./apps/web", "apps/worker"),
      await project("packages", "./apps/web", "packages"),
    ],
  };
}
