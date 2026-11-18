/**
 * @jest-environment node
 *
 * The deploy kit (deploy/; E-08, E-06, E-09): the single-EC2 release the owner's senior approved on
 * 16 Nov 2026. Read as text, so no YAML library is needed. What it keeps true: images pinned,
 * only Nginx reachable, Redis on an internal network, the trusted-proxy counts, Nginx's header
 * rules the app's audit log relies on, the timers' ticks, and no secret in the repository.
 */

import fs from "fs";
import path from "path";
import { NEWS_REFRESH_TICK_MINUTES } from "@timesprime/shared/config/newsRefresh";
import { PUBLISH_TICK_MINUTES } from "@timesprime/shared/config/desk";

const ROOT = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const compose = read("deploy/compose.yml");

/** The text of one service's block in compose.yml (from its name to the next service). */
function service(name: string): string {
  const services = compose.slice(compose.indexOf("\nservices:\n"), compose.indexOf("\nnetworks:\n"));
  const match = new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-z-]+:\\n|$)`).exec(services);
  if (!match) throw new Error(`no service ${name}`);
  return match[1];
}

const SERVICES = ["web", "admin", "worker", "nginx", "redis", "redis-rest"];

describe("compose.yml", () => {
  test("has exactly the six services", () => {
    const names = [...compose.matchAll(/^ {2}([a-z-]+):$/gm)].map((m) => m[1]).filter((n) => SERVICES.includes(n));
    expect(names.sort()).toEqual([...SERVICES].sort());
  });

  test("every image is pinned: the apps by the build's tag, the others by an exact version", () => {
    for (const app of ["web", "admin", "worker"]) {
      expect(service(app)).toContain(`image: \${ECR_REGISTRY}/timesprime-${app}:\${TAG}`);
    }
    for (const other of ["nginx", "redis", "redis-rest"]) {
      expect(service(other)).toMatch(/image: [a-z/-]+:\d+\.\d+\.\d+(-alpine)?\n/);
    }
    expect(compose).not.toMatch(/:latest\b/);
  });

  test("only Nginx publishes ports, 443 and 8443", () => {
    const withPorts = SERVICES.filter((s) => /\n\s+ports:/.test(service(s)));
    expect(withPorts).toEqual(["nginx"]);
    expect(service("nginx")).toContain('- "443:443"');
    expect(service("nginx")).toContain('- "8443:8443"');
  });

  test("Redis and its REST proxy sit on the internal network alone", () => {
    expect(service("redis")).toContain("networks: [data]");
    expect(service("redis-rest")).toContain("networks: [data]");
    expect(compose).toMatch(/\n {2}data:\n {4}internal: true\n/);
    expect(service("redis")).toMatch(/--requirepass "\$\$REDIS_PASSWORD" --maxmemory 256mb --maxmemory-policy allkeys-lru --save "" --appendonly no/);
  });

  test("the trusted proxies: 2 in front of the reader (CloudFront, Nginx), 1 in front of the back office", () => {
    expect(service("web")).toContain('TRUSTED_PROXY_HOPS: "2"');
    expect(service("admin")).toContain('TRUSTED_PROXY_HOPS: "1"');
  });

  test("the worker runs only when started (profile jobs), with its state on a volume", () => {
    const worker = service("worker");
    expect(worker).toContain("profiles: [jobs]");
    expect(worker).toContain("WORKER_STATE_DIR: /var/lib/timesprime");
    expect(worker).toContain("- worker-state:/var/lib/timesprime");
  });

  test("every service logs to its own CloudWatch group in Mumbai", () => {
    for (const s of SERVICES) {
      const group = s === "redis-rest" ? "redis" : s;
      expect(service(s)).toContain(`awslogs-group: /timesprime/${group}`);
    }
    expect(compose).toContain("driver: awslogs");
    expect(compose.match(/awslogs-region: ap-south-1/g)?.length).toBe(SERVICES.length);
  });

  test("secrets come only from the server's env files: none is written here", () => {
    expect(compose).not.toMatch(/(PASSWORD|SECRET|TOKEN|KEY)\s*[:=]\s*["']?[A-Za-z0-9]/);
  });
});

describe("Nginx", () => {
  const reader = read("deploy/nginx/templates/10-reader.conf.template");
  const admin = read("deploy/nginx/templates/20-admin.conf.template");

  test("the reader origin refuses any request without CloudFront's secret header, and the app never sees it", () => {
    expect(reader).toContain("listen 8443 ssl;");
    expect(reader).toContain('if ($http_x_origin_verify != "${ORIGIN_SECRET}") {\n        return 403;');
    expect(reader).toContain('proxy_set_header X-Origin-Verify "";');
  });

  test("the back office clears X-Amz-Cf-Id (no CloudFront there) and both sites set X-Request-Id (E-03)", () => {
    expect(admin).toContain("listen 443 ssl;");
    expect(admin).toContain('proxy_set_header X-Amz-Cf-Id "";');
    // The Desk uploads images of up to 15 MB; the reader keeps the shared 1m.
    expect(admin).toContain("client_max_body_size 20m;");
    for (const site of [reader, admin]) {
      expect(site).toContain("proxy_set_header X-Request-Id $request_id;");
      expect(site).toContain("proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;");
    }
  });

  test("any other name is refused at the TLS handshake", () => {
    const fallback = read("deploy/nginx/templates/default.conf.template");
    expect(fallback).toContain("listen 443 ssl default_server;");
    expect(fallback).toContain("listen 8443 ssl default_server;");
    expect(fallback).toContain("ssl_reject_handshake on;");
  });

  test("no secret is written in a template: only ${VARIABLES} from .env.edge", () => {
    const all = [reader, admin, read("deploy/nginx/templates/00-common.conf.template")].join("\n");
    expect(all).not.toMatch(/X-Origin-Verify[^\n]*"[A-Za-z0-9]{8,}"/);
    expect([...new Set([...all.matchAll(/\$\{([A-Z_]+)\}/g)].map((m) => m[1]))].sort()).toEqual([
      "ADMIN_HOST",
      "ORIGIN_SECRET",
      "READER_ORIGIN_HOST",
    ]);
  });
});

describe("the refresh timer", () => {
  test("fires every NEWS_REFRESH_TICK_MINUTES (15), and runs the worker's refresh-news", () => {
    expect(NEWS_REFRESH_TICK_MINUTES).toBe(15);
    expect(read("deploy/systemd/timesprime-refresh.timer")).toContain(`OnCalendar=*:0/${NEWS_REFRESH_TICK_MINUTES}`);
    expect(read("deploy/systemd/timesprime-refresh.service")).toMatch(/--profile jobs run --rm worker refresh-news/);
  });
});

// Panel 2 (design §6, owner decision 3): the Desk's scheduled stories.
describe("the scheduled-publishing timer", () => {
  test("fires every PUBLISH_TICK_MINUTES (5), and runs the worker's publish-scheduled", () => {
    expect(PUBLISH_TICK_MINUTES).toBe(5);
    expect(read("deploy/systemd/timesprime-publish.timer")).toContain(`OnCalendar=*:0/${PUBLISH_TICK_MINUTES}`);
    expect(read("deploy/systemd/timesprime-publish.service")).toMatch(/--profile jobs run --rm worker publish-scheduled/);
  });

  test("a run times out before the next tick could start", () => {
    const timeout = Number(/^TimeoutStartSec=(\d+)$/m.exec(read("deploy/systemd/timesprime-publish.service"))?.[1]);
    expect(timeout).toBeGreaterThan(0);
    expect(timeout).toBeLessThan(PUBLISH_TICK_MINUTES * 60);
  });

  test("deploy.sh installs and starts every timer in the kit, and stops one the kit does not carry", () => {
    const deploy = read("deploy/scripts/deploy.sh");
    expect(deploy).toContain('install -m 0644 "$KIT"/systemd/timesprime-*.service "$KIT"/systemd/timesprime-*.timer /etc/systemd/system/');
    expect(deploy).toContain('for timer in "$KIT"/systemd/timesprime-*.timer; do');
    expect(deploy).toContain('systemctl enable --now "$(basename "$timer")"');
    expect(deploy).toContain('[ -e "$KIT/systemd/$name" ] || systemctl disable --now "$name"');
  });
});

describe("the env templates", () => {
  const dir = path.join(ROOT, "deploy/env");
  const templates = fs.readdirSync(dir).filter((f) => f.endsWith(".env.example"));
  const rootNames = new Set([...read(".env.example").matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]));
  const KIT_ONLY = new Set(["ECR_REGISTRY", "REDIS_PASSWORD", "SRH_TOKEN", "SRH_CONNECTION_STRING", "READER_ORIGIN_HOST", "ADMIN_HOST", "ORIGIN_SECRET"]);
  const PUBLIC_DEFAULTS: Record<string, string> = {
    NEXT_PUBLIC_APP_URL: "https://timesprime247.com",
    READER_ORIGIN_HOST: "origin.timesprime247.com",
    ADMIN_HOST: "admin.timesprime247.com",
  };

  test("there is one per env file the kit reads", () => {
    expect(templates.sort()).toEqual(["admin", "build", "edge", "redis", "shared", "web", "worker"].map((n) => `${n}.env.example`));
  });

  test.each(templates)("%s holds no value but a public default", (file) => {
    for (const [, name, value] of read(`deploy/env/${file}`).matchAll(/^([A-Z0-9_]+)=(.*)$/gm)) {
      expect([name, value]).toEqual([name, PUBLIC_DEFAULTS[name] ?? ""]);
    }
  });

  test.each(templates)("%s names only variables the apps read (.env.example) or the kit uses", (file) => {
    for (const [, name] of read(`deploy/env/${file}`).matchAll(/^([A-Z0-9_]+)=/gm)) {
      expect(rootNames.has(name) || KIT_ONLY.has(name) ? name : `unknown: ${name}`).toBe(name);
    }
  });

  test("the real env files never reach git or an image", () => {
    expect(read(".gitignore")).toMatch(/^\.env\*$/m);
    expect(read(".dockerignore")).toMatch(/^deploy\/env$/m);
  });
});

describe("the scripts and the image", () => {
  test("images are built on the laptop for the server's x86_64, and the server never builds", () => {
    expect(read("deploy/scripts/build-and-push.sh")).toContain("--platform linux/amd64");
    for (const script of ["deploy.sh", "rollback.sh"]) {
      expect(read(`deploy/scripts/${script}`)).not.toMatch(/docker (build|buildx)/);
    }
  });

  test("the worker image carries the kit the server deploys from", () => {
    expect(read("Dockerfile")).toMatch(/^COPY deploy \/deploy$/m);
  });

  // npm ci runs before the sources are copied, from the lockfile and each workspace's package.json;
  // a workspace left out (packages/editor was, from Panel 2's M2) breaks or unlinks it in the image.
  test("the dependencies stage copies every workspace's package.json before npm ci", () => {
    const dockerfile = read("Dockerfile");
    const deps = dockerfile.slice(dockerfile.indexOf("AS deps"), dockerfile.indexOf("RUN npm ci"));
    const workspaces = ["apps", "packages"].flatMap((dir) =>
      fs
        .readdirSync(path.join(ROOT, dir), { withFileTypes: true })
        .filter((e) => e.isDirectory() && fs.existsSync(path.join(ROOT, dir, e.name, "package.json")))
        .map((e) => `${dir}/${e.name}`)
    );
    expect(workspaces).toEqual(expect.arrayContaining(["apps/web", "apps/admin", "apps/worker", "packages/editor"]));
    for (const workspace of workspaces) expect(deps).toContain(`COPY ${workspace}/package.json ${workspace}/`);
  });

  // The kit is built into the image from a Windows checkout: CRLF would break bash on the server.
  test("every kit file has LF line endings in this checkout, and .gitattributes keeps it so", () => {
    expect(read(".gitattributes")).toMatch(/^deploy\/\*\* text eol=lf$/m);
    const walk = (dir: string): string[] =>
      fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]
      );
    // A laptop's real env files (deploy/env/.env.*) are never opened.
    const kit = walk("deploy").filter((f) => !path.basename(f).startsWith(".env"));
    const crlf = kit.filter((f) => fs.readFileSync(path.join(ROOT, f), "utf8").includes(String.fromCharCode(13)));
    expect(crlf).toEqual([]);
  });
});
