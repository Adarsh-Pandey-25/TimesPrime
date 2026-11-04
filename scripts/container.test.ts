/**
 * @jest-environment node
 *
 * The container build's rules (Dockerfile, .dockerignore; R1-01): no env file reaches the build
 * context, no secret is a build argument, and both apps build the standalone server the images run.
 */

import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");
const lines = (file: string) =>
  read(file)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

describe(".dockerignore", () => {
  test("every env file, in any folder, is left out of the build context", () => {
    expect(lines(".dockerignore")).toContain("**/.env*");
  });

  test("no line lets a file back in (a ! exception could re-admit an env file)", () => {
    expect(lines(".dockerignore").filter((l) => l.startsWith("!"))).toEqual([]);
  });
});

describe("Dockerfile", () => {
  const instructions = lines("Dockerfile");

  test("its build arguments are the base image and NEXT_PUBLIC_ values only: secrets are set at run time", () => {
    const args = instructions.filter((l) => /^ARG\s/i.test(l)).map((l) => l.split(/\s+/)[1].split("=")[0]);
    expect(args.length).toBeGreaterThan(1);
    expect(args.filter((name) => name !== "NODE_IMAGE" && !name.startsWith("NEXT_PUBLIC_"))).toEqual([]);
  });

  test("no COPY names an env file", () => {
    expect(instructions.filter((l) => /^COPY\s/i.test(l) && /\.env/.test(l))).toEqual([]);
  });

  test("the web, admin and worker targets exist, and the apps run their standalone server", () => {
    const targets = instructions.filter((l) => /^FROM\s/i.test(l)).map((l) => l.split(/\s+/).pop());
    expect(targets).toEqual(expect.arrayContaining(["web", "admin", "worker"]));
    expect(instructions).toContain('CMD ["node", "apps/web/server.js"]');
    expect(instructions).toContain('CMD ["node", "apps/admin/server.js"]');
  });
});

describe("next.config", () => {
  test.each(["web", "admin"])("%s builds the standalone output the image copies", (app) => {
    // Read as text: importing the config would load the root env files into the test process.
    expect(read(`apps/${app}/next.config.ts`)).toMatch(/^\s*output: "standalone",$/m);
  });
});
