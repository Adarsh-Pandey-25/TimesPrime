# Operations

Running, deploying and picking up TimesPrime:

1. [Environment variables](#environment-variables): every variable, where it is set, and which files
   hold them.
2. [Deployment](#deployment): the single server: the AWS runbook, every deploy, the go-live gates.
3. [Runbooks](#runbooks): procedures for the owner, to follow under pressure.
4. [Current status](#current-status): where the work stands, the baselines, the gotchas, the history.
   **A new session starts here**, after [`CLAUDE.md`](../CLAUDE.md).
5. [Backlog](#backlog): deferred work, each item with the reason it was deferred.
6. [Audit ledger](#audit-ledger): the 28 audit findings and their status.

> **Paths in carried records.** The runbooks, the backlog, the audit ledger and the history below
> keep the paths of their time where they describe what happened then. Instructions meant for today
> use today's paths: `apps/web`, `apps/admin`, `apps/worker`, `packages/server`, `packages/shared`,
> `packages/ui`, `database/`, and the env file `.env` at the root.

## Environment variables

**Files.** Locally, one env file serves every app: `.env` at the repository root holds the owner's
real values. It is git-ignored, and a session never reads, prints, copies or edits it (`CLAUDE.md`;
`.claude/settings.json` denies it). Create it from `.env.example`, the committed template, which
names every variable the code reads; a test keeps the two in step (F-009, `10c8b47`). `.env.test`,
committed with every key empty, is the test environment: Next loads it before `.env` when
`NODE_ENV` is `test`, and keeps the first value it finds, so tests never see the real values. Each
app's `next.config.ts` loads the root files (gotcha 3.25); the worker passes
`--env-file-if-exists=../../.env`. **On the server** each container gets its own env file, with
only the secrets it needs ([where each is set](#where-each-is-set-on-the-server)). **Never commit
real values.** (Until 2026-11-04 the local file was `.env.local` at the root on this branch, and
`frontend/.env` on `main`.)

| Variable | Read by | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | all | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | all | Public anon key; RLS restricts it to reads. Used only without the service-role key, and then every write fails (BL-025) |
| `SUPABASE_SERVICE_ROLE_KEY` | admin, worker (web until R12-03's gate) | Bypasses RLS for server writes. Never expose to the client. The reader site writes nothing (R12-03), so it drops the key once `database/policies.sql` is applied and checked |
| `NEWSDATA_API_KEY` | worker, admin | NewsData.io: the worker's refresh and the back office's Sync now. The reader site reads only the database (R1-12) and holds no key. Without it the refresh exits 1 and the feed stays as it was; there are no mock articles (B-04) |
| `ANTHROPIC_API_KEY` | worker, admin; web if the chat is on | Category classification (the refresh and Sync now), and `/api/chat` when `NEXT_PUBLIC_AI_CHAT_ENABLED` is `1` |
| `ADMIN_PASSWORD` | admin | The shared admin password, compared in constant time. Unset (or without `ADMIN_SESSION_SECRET`), login answers 503 and `/admin` stays locked |
| `ADMIN_SESSION_SECRET` | admin | HMAC key signing the 12-hour admin session cookie; changing it signs every admin out |
| `ADMIN_LEGACY_LOGIN` | admin | The two variables above are the shared password, retired in code at 2027-01-01 00:00 IST. Set this to `off` to retire it sooner |
| `UPSTASH_REDIS_REST_URL` | web, admin | The shared cache and rate limits. On the server: the local Redis's REST proxy, `http://redis-rest`, set by `deploy/compose.yml`. Unset locally: an in-process cache |
| `UPSTASH_REDIS_REST_TOKEN` | web, admin | The proxy's token: the same value as `SRH_TOKEN` in `.env.redis` |
| `NEXT_PUBLIC_SENTRY_DSN` | build | Error reporting (Sentry, EU region). Not a secret; `NEXT_PUBLIC_` so it reaches the browser. A build argument |
| `SENTRY_AUTH_TOKEN` | build | Source-map upload at build time only (not done by the image builds yet) |
| `SENTRY_ORG` | build | Sentry org slug |
| `SENTRY_PROJECT` | build | Sentry project slug |
| `NEXT_PUBLIC_APP_URL` | build | The site's public origin, `https://timesprime247.com`: `metadataBase`, canonical links, `robots.txt`, the sitemap and `og:url` (`packages/shared/src/config/site.ts`). Fixed at build |
| `NEXT_PUBLIC_SITE_NOINDEX` | build | `1` builds a copy search engines must not index: `robots.txt` disallows everything, every response says `X-Robots-Tag: noindex`. Unset for the public site. Fixed at build (gotcha 3.26) |
| `NEXT_PUBLIC_AI_CHAT_ENABLED` | build | `1` turns the readers' AI chat on (B-06). Unset, it is off: no chat button, no ask panel, and `/api/chat` answers 404. Fixed at build |
| `TRUSTED_PROXY_HOPS` | web, admin | Proxies that append to `X-Forwarded-For`: `2` for the reader site (CloudFront, then Nginx), `1` for the back office (Nginx), `0` locally. The client IP for rate limits and the audit log is the entry this many from the right (R1-05). Set by `deploy/compose.yml` |
| `WORKER_STATE_DIR` | worker | When the news refresh last started, so a timer tick before the interval has passed skips (R12-04). On the server a Docker volume at `/var/lib/timesprime`, set by `deploy/compose.yml` |
| `NEWS_REFRESH_BATCHED` | worker | `1` makes the refresh name several categories per NewsData call: 4 calls a run instead of 14 (R12-05, option (c)). Unset, it is off. Switch it on only after the dry run ([the news refresh](#the-news-refresh-interval-calls-and-the-admin-setting)) |
| `MEDIA_BUCKET` | web, admin, worker | The Desk's images (Panel 2, M4): the S3 bucket they are kept in, read and written with the server's role. Unset, a local folder (`MEDIA_LOCAL_DIR`, or `.media` at the root), which each app serves at `/media`; on the server an upload then fails, as the container has no folder it may write. Set only after [the Desk's images](#the-desks-images-panel-2-after-the-release) |
| `MEDIA_REGION` | web, admin, worker | The bucket's region; `ap-south-1` when unset |
| `MEDIA_PUBLIC_BASE` | web, admin | Where pages show the renditions: `https://timesprime247.com/media` on the server (CloudFront's `/media/renditions/*`), set together with `MEDIA_BUCKET`. Unset, `/media`. Originals have no public address |
| `MEDIA_LOCAL_DIR` | web, admin, worker | The local folder, on a laptop; unset, `.media` at the root (git-ignored) |

### Where each is set on the server

- **Build arguments,** on the laptop, from `deploy/env/.env.build` (git-ignored; template
  `deploy/env/build.env.example`): every `NEXT_PUBLIC_` variable, which Next inlines at build, and
  `NEXT_DEPLOYMENT_ID` (the git SHA, set by `build-and-push.sh`; Next's `deploymentId`). Never a
  secret: `scripts/container.test.ts` fails a build argument that is not one of these.
- **One env file per service**, on the server in `/opt/timesprime/env/`, mode 600, filled in by
  hand from the templates in `deploy/env/` (names only). Each container gets only its own:

  | File | For | Variables |
  |---|---|---|
  | `.env.shared` | web, admin, worker | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the worker is not a Next build, so it reads them at run time), `UPSTASH_REDIS_REST_TOKEN`, `NEXT_PUBLIC_SENTRY_DSN`; `MEDIA_BUCKET` and `MEDIA_PUBLIC_BASE` once the Desk's images are set up |
  | `.env.web` | web | `SUPABASE_SERVICE_ROLE_KEY`, only until R12-03's gate; then the line is deleted |
  | `.env.admin` | admin | `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `ADMIN_LEGACY_LOGIN`, `NEWSDATA_API_KEY`, `ANTHROPIC_API_KEY` |
  | `.env.worker` | worker | `SUPABASE_SERVICE_ROLE_KEY`, `NEWSDATA_API_KEY`, `ANTHROPIC_API_KEY`; `NEWS_REFRESH_BATCHED` once the dry run passes |
  | `.env.redis` | redis, redis-rest | `REDIS_PASSWORD`, `SRH_TOKEN`, `SRH_CONNECTION_STRING` (`redis://:<REDIS_PASSWORD>@redis:6379`) |
  | `.env.edge` | nginx | `READER_ORIGIN_HOST`, `ADMIN_HOST`, `ORIGIN_SECRET` (also CloudFront's custom origin header) |
  | `.env.backup` | the weekly backup only | `SUPABASE_DB_URL` (Supabase's Session pooler connection string) |

- **Set by `deploy/compose.yml`** (not secret): `TRUSTED_PROXY_HOPS`, `UPSTASH_REDIS_REST_URL`,
  `WORKER_STATE_DIR`.
- **Not needed:** `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`. The app has no Server Function, so nothing
  is encrypted across instances. Set it the day one is added (bundled docs: guides/self-hosting.md
  "Server Functions encryption key").

Gone since the apps/packages split: `CRON_SECRET` (the refresh is the worker's `refresh-news` job,
started by the server's timer, not an HTTP route) and `NEXT_PUBLIC_BASE_URL` (the article page no
longer fetches its own API, BL-016). `ADMIN_SECRET_TOKEN` and `MEDIASTACK_API_KEY` appear in some
older env files and are **read by nothing**; `NEXT_PUBLIC_NEWSDATA_API_KEY` is no longer read either
(`45223f0`) and must never be set. The code also reads `NODE_ENV`, `CI` and `NEXT_RUNTIME`, which
the platform sets.

Generate the two admin secrets with the first command, and `REDIS_PASSWORD`, `SRH_TOKEN` and
`ORIGIN_SECRET` (each its own value) with the second:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
openssl rand -hex 32
```

## Deployment

**The release runs on one server** (the owner's senior, 16 Nov 2026, replacing the 4 Nov ECS plan):
an EC2 t3.medium (x86_64, Ubuntu 24.04 LTS) in `ap-south-1` (Mumbai), running Docker Compose.
- **Who reaches what:** the reader site sits behind CloudFront; the back office is reached directly.
- **Images:** built on a laptop and pushed to ECR. The server only pulls; it never builds.
- **Deploys:** manual, each approved by Adarsh, with a one-command rollback.
- **Not used:** ECS, ALB, EventBridge, NAT.
- **The kit is `deploy/`:** compose file, Nginx, the timers (the news refresh, and the Desk's
  scheduled publishing every 5 minutes), scripts and env templates
  ([where new code goes](README.md#where-new-code-goes)). `scripts/deploy.test.ts` checks it.

The plan's Phase I ([`NEWSROOM_PLAN.md`](NEWSROOM_PLAN.md)) adds what the full launch needs
(infrastructure as code, staging).

```
readers  -> timesprime247.com (CloudFront Pro, WAF) -> origin.timesprime247.com:8443 -> Nginx -> web
the team -> admin.timesprime247.com (Elastic IP)    -> :443                          -> Nginx -> admin
timer, every 15 min -> worker refresh-news -> NewsData -> Supabase
web, admin -> Redis (internal network, through its REST proxy);  web, admin, worker -> Supabase
```

| Service | Image | Port | Reached by | Health |
|---|---|---|---|---|
| `web` | `timesprime-web:<tag>` | 3000, internal | Nginx on 8443, which only CloudFront reaches | Docker `HEALTHCHECK`, `GET /about` |
| `admin` | `timesprime-admin:<tag>` | 3001, internal | Nginx on 443, which only the team's IPs reach | `GET /admin/login` |
| `worker` | `timesprime-worker:<tag>` | — | the systemd timer, every 15 minutes | its exit code (journal, log group) |
| `nginx` | `nginx:1.27.3-alpine` | 443 and 8443, the only published ports | the security groups | — |
| `redis`, `redis-rest` | `redis:7.4.1-alpine`, `hiett/serverless-redis-http:0.0.10` | internal network only | web and admin | — |

**The two health checks** are prerendered pages whose rendering calls no upstream (measured at
STOP R1):
- `/about`'s server code holds no Supabase, NewsData, Redis or Anthropic client;
- it answers 200 from a container with no network at all;
- its client components fetch only in effects, in the browser.

Each `/about` request still reads Redis twice through the shared cache handler. If Redis fails, the
handler skips it for 10 seconds after the one failed call (E-07, BL-040). `/admin/login` reads
nothing.

**`/api/health`** is for the uptime monitor. It answers 503 when Supabase is down or a configured
Redis fails. The NewsData and Anthropic keys are optional: the reader site holds neither.

**What Nginx enforces** (`deploy/nginx/templates`):
- **Reader origin (8443):** refuses any request without CloudFront's secret `X-Origin-Verify`
  header, and strips it before the app.
- **Back office (443):** clears `X-Amz-Cf-Id`, which a client could forge there, since no
  CloudFront is in front.
- **Both:** set `X-Request-Id`, which the audit log records (E-03).
- **Any other name:** refused at the TLS handshake.

### Every deploy

Adarsh approves each deploy. On the laptop, from `main` as merged:

```bash
git switch main && git pull --ff-only
deploy/scripts/build-and-push.sh --no-push   # builds the three images (linux/amd64), prints the tag
deploy/scripts/run-local.sh <tag>            # the same images: http://localhost:3200 and :3201/admin
```

1. **Check the local run.** Look at the reader and the back office in a browser, then stop them:
   `deploy/scripts/run-local.sh <tag> down`. This replaces a staging server (owner's senior).
   The laptop needs these files, made from the templates in `deploy/env` and git-ignored:
   `deploy/env/.env.build`, plus `.env.shared`, `.env.web`, `.env.admin` and `.env.redis`.
2. **Push the same tag:** `deploy/scripts/build-and-push.sh`. It needs `aws sso login` with push
   rights on the three ECR repositories; Docker's build cache makes this second build quick.
3. **Deploy on the server.** Open EC2 → the instance → Connect → Session Manager, and run
   `sudo bash /opt/timesprime/current/scripts/deploy.sh <tag>`.
   - It takes the tag's kit from the worker image, records the previous tag, installs the kit's
     timers (and stops one an older kit installed that this kit does not carry), pulls, starts,
     and waits up to three minutes for web and admin to report healthy.
4. **Clear CloudFront's copy of the pages:**
   `aws cloudfront create-invalidation --distribution-id <id> --paths "/*"`.
   - Static pages (`/about`, `/privacy`, `/terms`, `/contact`, `/saved`) are sent with
     `s-maxage=31536000`, so CloudFront keeps them for a year.
   - The home and article pages, and the Desk's story pages (Panel 2), are `no-store`.
   - `/_next/static` files have hashed names and are immutable.
   - One `/*` path counts once against the monthly allowance.
5. **Run the [smoke test](#smoke-test).**
6. **If anything is wrong,** roll back: `sudo bash /opt/timesprime/current/scripts/rollback.sh`.
   - It deploys the previous tag with that tag's own kit. Run it again to come back.
   - Then invalidate CloudFront again, as in step 4.
   - Back to a tag from before the scheduled-publishing timer (Panel 2, M3)? That tag's
     `deploy.sh` does not know the timer, so stop it by hand:
     `sudo systemctl disable --now timesprime-publish.timer`. Kits from M3 on do this themselves.

### The AWS resources, in order

For the manager, in the AWS console, region **Asia Pacific (Mumbai) ap-south-1**. The only
exception is the step 13 certificate, which must be in **us-east-1**. Each step says what to choose.

**Account and access**
1. **IAM Identity Center:** a user for each of the one or two team members, with MFA. No shared
   logins, and the root user is not used.
   - **Deployer:** `AmazonEC2ContainerRegistryPowerUser` on the three repositories, and
     `cloudfront:CreateInvalidation` on the distribution.
   - **Manager:** what the steps below need.
2. **Billing → Budgets:** a monthly cost budget of **$50**, alerting `adarsh@timesprime247.com` at
   80% and 100%.

**Storage and logs**

3. **S3:** two buckets in ap-south-1, both with Block Public Access on and default encryption on.
   - `timesprime-logs-<suffix>`: CloudFront's logs. Lifecycle rule: expire objects after
     **365 days**.
   - `timesprime-backups-<suffix>`: the weekly Supabase backup, under `supabase/`. Lifecycle rule:
     expire after **90 days**.
4. **CloudWatch → Log groups:** create `/timesprime/web`, `/timesprime/admin`,
   `/timesprime/worker`, `/timesprime/nginx` and `/timesprime/redis`, each with retention
   **365 days**. Docker writes to them; it does not create them.
5. **ECR:** three private repositories, `timesprime-web`, `timesprime-admin` and
   `timesprime-worker`.
   - Scan on push: on.
   - Lifecycle rule: keep the last **10** images.
   - Note the registry, `<account-id>.dkr.ecr.ap-south-1.amazonaws.com`.

**The server's role**

6. **IAM → Roles → Create role** for EC2, named `timesprime-ec2`, with:
   - the managed policies `AmazonSSMManagedInstanceCore` and
     `AmazonEC2ContainerRegistryReadOnly`;
   - an inline policy allowing `logs:CreateLogStream` and `logs:PutLogEvents` on the five log
     groups;
   - `s3:PutObject` on `timesprime-backups-<suffix>/supabase/*`;
   - `route53:ListHostedZones` and `route53:GetChange`, plus `route53:ChangeResourceRecordSets` on
     the `timesprime247.com` hosted zone only. Let's Encrypt's DNS check needs these.

**DNS: only the DNS moves; the domain stays registered at GoDaddy**

7. **Route 53 → Hosted zones → Create** `timesprime247.com`.
   - **First copy every record from GoDaddy's DNS:** MX, TXT (SPF, DKIM, DMARC, site
     verifications), CNAMEs and CAA. If there is a CAA record, add `letsencrypt.org` and
     `amazon.com` to it.
   - **Check that every subdomain in use answers on HTTPS.** The site sends HSTS with
     `includeSubDomains`, and browsers will then refuse plain HTTP on all of them.
   - **A day before:** lower the TTLs at GoDaddy to 300 seconds.
   - **Then:** set GoDaddy's nameservers to the four Route 53 servers.
   - **After the switch:** check that email still arrives.

**The server**

8. **EC2 → Launch instance:**
   - `timesprime-1`, Ubuntu Server 24.04 LTS (x86_64), **t3.medium**;
   - **no key pair** (Session Manager only);
   - the default VPC, a public subnet, "auto-assign public IP" off;
   - storage **30 GB gp3**, encrypted;
   - Advanced details: IAM instance profile `timesprime-ec2`, metadata version **IMDSv2 only**,
     termination protection on.

   Then **Elastic IPs → Allocate**, and associate it with the instance.
9. **Security groups,** attached to the instance. There is no port 22 anywhere; outbound stays open.
   - `timesprime-admin`: inbound TCP 443 from the team's IPs only. The senior sets the IPs himself.
   - `timesprime-origin`: inbound TCP 8443 from the managed prefix list
     `com.amazonaws.global.cloudfront.origin-facing`. Keep it in its own group: the prefix list
     uses most of a group's rule quota.
10. **Route 53 records:**
    - `admin.timesprime247.com`, an A record to the Elastic IP;
    - `origin.timesprime247.com`, an A record to the Elastic IP (only CloudFront uses it).
11. **EC2 → Lifecycle Manager:** a policy for EBS snapshots of the instance's volume, **daily**,
    keeping **7**.
12. **CloudWatch → Alarms** on the instance's `StatusCheckFailed_System`, with the action
    **Recover**, notifying an SNS topic. The topic has an email subscription to
    `adarsh@timesprime247.com`, confirmed from that inbox.
13. **ACM, in us-east-1 (N. Virginia):** request a public certificate for `timesprime247.com` and
    `www.timesprime247.com`, with DNS validation → "Create records in Route 53".

Then set up the server ([below](#the-servers-first-setup)) and deploy the first tag, so the origin
answers before CloudFront points at it.

**CloudFront and the public names**

14. **CloudFront → Create distribution,** on the **Pro** flat-rate plan ($15/month).
    - **Origin:** `origin.timesprime247.com`, protocol HTTPS only, HTTPS port **8443**, minimum
      TLS 1.2.
    - **Custom header on the origin:** `X-Origin-Verify` = the `ORIGIN_SECRET` from the server's
      `.env.edge`.
    - **Alternate names:** `timesprime247.com` and `www.timesprime247.com`, with the step 13
      certificate.
    - **Viewers:** redirect HTTP to HTTPS, compression on.
    - **Behaviours, in this order:**

      | Path | Cache policy | Origin request policy |
      |---|---|---|
      | `/_next/static/*` | CachingOptimized | none |
      | `/api/*` | CachingDisabled | AllViewerExceptHostHeader |
      | default (`*`) | UseOriginCacheControlHeaders-QueryStrings | AllViewerExceptHostHeader |

    - **CloudFront Function** `www-to-apex`, on viewer request for every behaviour. It keeps the
      query string (`?search=`), building it as AWS's own example does
      (aws-samples/amazon-cloudfront-functions, normalize-query-string-parameters):

      ```js
      function handler(event) {
        var request = event.request;
        var host = request.headers.host.value;
        if (host.indexOf('www.') !== 0) return request;
        var parts = [];
        for (var key in request.querystring) {
          var entry = request.querystring[key];
          var values = entry.multiValue || [entry];
          for (var i = 0; i < values.length; i++) parts.push(key + '=' + values[i].value);
        }
        var location = 'https://' + host.slice(4) + request.uri + (parts.length ? '?' + parts.join('&') : '');
        return { statusCode: 301, statusDescription: 'Moved Permanently',
          headers: { location: { value: location } } };
      }
      ```

      **Before publishing,** use the function's **Test** tab with a viewer request to
      `www.timesprime247.com`, URI `/` and query string `search=new%20delhi`. The location
      should be `https://timesprime247.com/?search=new%20delhi`. Then test URI `/about` with no
      query string; the location should be `https://timesprime247.com/about`.

    - **Standard logging (v2)** to `timesprime-logs-<suffix>`.

    The plan's WAF stays on with its defaults. CloudFront appends the viewer's address to
    `X-Forwarded-For`; Nginx and the app count it (`TRUSTED_PROXY_HOPS=2`).
15. **Route 53:** for `timesprime247.com` and `www.timesprime247.com`, A and AAAA alias records to
    the distribution.

**The services**

16. **Supabase → Authentication → URL configuration:** Site URL
    `https://admin.timesprime247.com`.
    - Note the Postgres major version (Database → Settings) for the backup.
    - Note the **Session pooler** connection string (IPv4) for `.env.backup`.
17. **Sentry:** an organisation in the **EU (Frankfurt)** region, with two projects, `web` and
    `admin`. The browser DSN goes into `.env.build`.
18. **UptimeRobot:** a monitor on `https://timesprime247.com/api/health`, alerting on any status
    other than 200, by email to `adarsh@timesprime247.com`.
19. **Anthropic console:** a monthly spend limit. The chat is off; the worker's category
    classification still uses the account.

### The server's first setup

In a Session Manager shell, as root (`sudo -i`). Values written as `<...>` are filled in by hand,
never pasted into a ticket or a chat.

```bash
# 2 GB of swap
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Docker Engine and the Compose plugin, from Docker's repository
apt-get update && apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable" > /etc/apt/sources.list.d/docker.list
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# The AWS CLI, and certbot with its Route 53 plugin
snap install aws-cli --classic
apt-get install -y certbot python3-certbot-dns-route53

# The two certificates Nginx needs (port 80 stays closed: the check is a DNS record)
certbot certonly --dns-route53 --non-interactive --agree-tos -m adarsh@timesprime247.com -d admin.timesprime247.com
certbot certonly --dns-route53 --non-interactive --agree-tos -m adarsh@timesprime247.com -d origin.timesprime247.com
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'EOF'
#!/bin/sh
cd /opt/timesprime/current && docker compose --env-file /opt/timesprime/release.env --profile edge exec -T nginx nginx -s reload
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

# The folders, the registry, and the env files (from deploy/env/*.env.example, mode 600)
mkdir -p /opt/timesprime/env && chmod 700 /opt/timesprime/env
echo 'ECR_REGISTRY=<account-id>.dkr.ecr.ap-south-1.amazonaws.com' > /opt/timesprime/server.conf
nano /opt/timesprime/env/.env.shared   # and .env.web, .env.admin, .env.worker, .env.redis, .env.edge, .env.backup
chmod 600 /opt/timesprime/env/.env.*

# The first deploy: deploy.sh comes from the tag's own image
. /opt/timesprime/server.conf
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin "$ECR_REGISTRY"
docker run --rm --entrypoint cat "$ECR_REGISTRY/timesprime-worker:<tag>" /deploy/scripts/deploy.sh > /tmp/deploy.sh
bash /tmp/deploy.sh <tag>
```

From then on every deploy is `sudo bash /opt/timesprime/current/scripts/deploy.sh <tag>`. Check
the timers with `systemctl list-timers 'timesprime-*'` (the news refresh every 15 minutes, the
Desk's scheduled publishing every 5, the image renditions every 5 at two past), and a run with
`journalctl -u timesprime-refresh.service -n 20`, `journalctl -u timesprime-publish.service -n 20`
or `journalctl -u timesprime-renditions.service -n 20`.

### The Desk's images (Panel 2), after the release

For the manager, in the AWS console (ap-south-1), when the Desk's media library is to be used on the
server (Panel 2 design §9, item 6). Until then `MEDIA_BUCKET` and `MEDIA_PUBLIC_BASE` stay unset, and
an upload on the server fails, keeping nothing. `<suffix>` is the one the other buckets use (step 3).

1. **S3 → Create bucket** `timesprime-media-<suffix>` in ap-south-1: Block Public Access on, default
   encryption SSE-S3, object ownership "bucket owner enforced". No lifecycle rule: images are the
   newsroom's record and are never deleted by the app.
2. **IAM → Roles → `timesprime-ec2`:** add to its inline policy `s3:PutObject` and `s3:GetObject` on
   `arn:aws:s3:::timesprime-media-<suffix>/media/*` (the app writes only under `media/`).
3. **EC2 → the instance → Actions → Instance settings → Modify instance metadata options:** IMDSv2
   still required, **hop limit 2**. The containers reach the role's credentials through Docker's
   network, one hop more than the host.
4. **CloudFront → the distribution.** It serves the **renditions only**: the originals keep the
   camera's metadata (EXIF can say where a photo was taken), so they never leave the bucket except
   through the back office, to staff.
   - **Origins → Create origin:** the bucket (`timesprime-media-<suffix>.s3.ap-south-1.amazonaws.com`),
     with **Origin access control** (create one: S3, sign requests). Copy the bucket policy it offers
     into the bucket (S3 → the bucket → Permissions → Bucket policy), with the resource narrowed to
     `arn:aws:s3:::timesprime-media-<suffix>/media/renditions/*`.
   - **Behaviours → Create behaviour:** path `/media/renditions/*` to that origin, viewers redirected
     to HTTPS, GET and HEAD only, cache policy **CachingOptimized**, no origin request policy, and the
     `www-to-apex` function on viewer request like the others. Move it above `/api/*`, so the order
     is `/_next/static/*`, `/media/renditions/*`, `/api/*`, default.
5. **The server:** in `/opt/timesprime/env/.env.shared` set `MEDIA_BUCKET=timesprime-media-<suffix>`
   and `MEDIA_PUBLIC_BASE=https://timesprime247.com/media`, then deploy the running tag again
   (`sudo bash /opt/timesprime/current/scripts/deploy.sh <tag>`) so the containers read them (the
   worker's renditions job reads the bucket too).

**Check:** upload a small test image in `/admin/desk/media`.
- At once its tile shows the picture (the original, through the back office) and "Sizes for
  readers: on the way". Its Original link opens the file.
- Within 5 minutes, after a reload, it says "made", and the tile's image address is
  `https://timesprime247.com/media/renditions/<its id>/4x3-480.webp`, which answers 200 with
  `cache-control: public, max-age=31536000, immutable`.
- `https://timesprime247.com/media/originals/<its id>.<ext>` answers **404**: the original is not public.
- In S3 the files are under `media/originals/` and `media/renditions/<its id>/` (14 for a large picture).

Then retire the test image in the library (images are never deleted).

### Weekly: the Supabase backup

Until Supabase is on Pro (with its own daily backups), a copy each week, by hand, from the server.
Use a Postgres image whose major version is at least Supabase's (step 16):

```bash
sudo -i
set -a; . /opt/timesprime/env/.env.backup; set +a
docker run --rm -e SUPABASE_DB_URL postgres:17-alpine sh -c 'pg_dump "$SUPABASE_DB_URL" --format=custom' \
  | aws s3 cp - "s3://timesprime-backups-<suffix>/supabase/$(date +%F).dump"
aws s3 ls "s3://timesprime-backups-<suffix>/supabase/" --human-readable | tail -3
```

A file of a few kilobytes means the dump failed: read the command's output. The bucket keeps 90
days.

### The news refresh: interval, calls and the admin setting

- **Today: English and Hindi every 120 minutes, on NewsData's free plan** (the owner, 17 Nov 2026).
  7 categories each, so 14 NewsData calls a run and **168 a day**, under the free plan's 200 a day
  ("200 API credits per day", newsdata.io/pricing).
  - **The back office's "Sync now" makes 7 calls**, so at most **4 syncs a day** fit. A fifth, or a
    run of the dry run (18 calls), takes the day past 200, and the next refreshes fail until
    NewsData's daily reset.
  - **Once the Basic plan is bought,** the interval goes back to **60 minutes**, the senior's figure:
    336 a day, 50% of Basic (20,000 a month, about 666 a day), under its **70%** ceiling (owner
    decision 7 of R0 v2). That is a one-line change and a deploy.
  - The value is `NEWS_REFRESH_INTERVAL_MINUTES` in
    `packages/shared/src/config/newsRefresh.ts`; `refreshNews.test.ts` and `newsRefresh.test.ts`
    pin the arithmetic.
- **The timer** fires every 15 minutes. The job runs only when the interval (less 2 minutes' grace)
  has passed since the last run started, and otherwise logs a skip.
- **Every 15 minutes needs option (c) first** (R12-05, built, off by default): several categories
  per call, at most 5 (NewsData's limit), 50 articles a call, 4 calls a run, about 384 a day (58%).
  - **The calls** (`refreshPlan` in `packages/server/src/services/news/refreshNews.ts`): English
    top, world, technology, business and sports from the United States; English India and
    entertainment from India; Hindi top, world, technology, business and sports; Hindi
    entertainment. **English entertainment moves from the United States' feed to India's.**
  - **The dry run comes first,** once the Basic plan is bought (the batched calls ask for 50
    articles, which the free plan refuses). It makes both runs' calls, 18 credits, prints articles
    per category and language for today's run and the batched one, and writes nothing:

    ```bash
    cd /opt/timesprime
    docker compose --env-file /opt/timesprime/release.env --profile jobs run --rm worker refresh-news-dry-run
    ```

    It exits 1 if a call failed. Go on only if every category's batched count is close to today's.
  - **To switch on:** add `NEWS_REFRESH_BATCHED=1` to `/opt/timesprime/env/.env.worker` (each
    tick starts a fresh container, so the next one reads it). For every 15 minutes, `NEWS_REFRESH_INTERVAL_MINUTES` becomes 15 on a branch
    (with `refreshNews.test.ts`'s arithmetic), through a PR, and is deployed. **To switch off:**
    remove the line; at 15 minutes the single-category refresh would be 1,344 calls a day, so the
    interval goes back to 60 first.
- **The admin setting (design, not built; owner's senior, 16 Nov 2026).** A screen in the back
  office's Sync panel to change the interval without a deploy:
  - **Storage:** one row in a new table `news_refresh_settings` (`interval_minutes`, 15 to 1,440, a
    multiple of 15; `updated_at`; `updated_by`), from a migration the owner applies (`[SCHEMA]`),
    with RLS on and nothing granted to `anon` or `authenticated`.
  - **Permission:** the existing `settings.manage`, so no catalogue change. Super Admin and
    Security Lead may change it; Managing Editor and Ingestion Ops may read it. Changes need MFA
    and are written to the audit log, before and after.
  - **The server refuses an interval above 70%.** It works out calls a day = (1,440 ÷ interval) ×
    calls a run, against the plan's daily limit (`NEWSDATA_PLAN_DAILY_CALLS`, one config value).
    The screen shows calls a day and the share of the plan for each choice, and disables the ones
    above 70%.
  - **The worker reads the row on every tick,** so no restart is needed. If the table is missing,
    it uses the default.
  - **It works only after the Panel 0 SQL is applied and a Super Admin exists.** The shared
    password can never hold `settings.manage`. **Until then, the interval changes only by changing
    `NEWS_REFRESH_INTERVAL_MINUTES` and deploying.**

### R2 design: brand colour, section and story URLs, structured data

**Status:** approved by the owner on 17 Nov 2026 and built on `site/brand-design` (in review). The
owner decided two things on 17 Nov 2026:
- Hindi keeps its reader setting; `/hi/` URLs come with Phase F.
- Outside stories move to `/article/{headline-slug}-{article_id}`.

R2 is the release's share of Phase F, for a site whose stories are still all outside ones. What
Phase F needs our own stories for (NewsArticle markup, news sitemaps, IndexNow, author and tag
pages) waits for Panel 2.

1. **The brand colour, `#E7000B`.**
   - Tailwind 4's `red-600` is already this colour (`oklch(57.7% 0.245 27.325)`), and the reader
     site uses it 112 times.
   - Fourteen places still hard-code Tailwind 3's `#dc2626`: both apps' `globals.css` and
     `global-error.tsx`, and `categoryColors.ts`.
   - They move to one token, `--color-brand: #E7000B` (`@theme`), with a test that no `#dc2626`
     is left.
   - No other visual change: a redesign needs a design from the owner first.
2. **Section URLs.**
   - Each section gets its own URL: `/india`, `/world`, `/tech`, `/business`, `/sports`,
     `/entertainment`, `/health` and `/science`. The top stories stay at `/`.
   - Each section page is server-rendered, has a self-canonical link and its own title and
     description, and is listed in the sitemap.
   - `/?category=<section>` answers 308 to the section's URL, so old links and bookmarks keep
     working.
   - The menu, the footer, the ticker and the home feed link the new URLs, and the feed follows
     the path, not `?category=`.
   - Search stays `/?search=`, with its canonical pointing to `/`.
   - An unknown section answers 404.
3. **Story URLs (BL-042).**
   - An outside story's page moves from `/article/<slug>?url=<publisher link>` to
     `/article/{headline-slug}-{article_id}`. It resolves by `article_id` (NewsData's id, unique in
     `articles`), so a changed headline still resolves, and the page 308s to its current slug.
   - The publisher's link no longer travels in our URLs.
   - An old `?url=` link answers 308 to the new URL while the story is stored, and 404 once it is
     not.
   - **A real 404 (BL-042).** The root `loading.tsx` moves into a route group `(feed)` with the
     home page, the sections and `/saved`, so the article route has no loading boundary. Next can
     then still send 404 when `notFound()` runs (bundled docs: file-conventions/loading.md, "When
     does streaming start?"). No URL changes, and no Proxy lookup.
   - The page keeps noindex, follow, and stays out of the sitemap. Its canonical and `og:url` are
     its own new URL.
4. **Structured data.**
   - The home page and About carry `NewsMediaOrganization` and `WebSite` JSON-LD:
     - the name, the URL and the logo (`logo-light.png`);
     - the address and the contact email from `site.ts` (R3);
     - the grievance page, as `publishingPrinciples` is not yet written.
   - No `NewsArticle` on outside stories: they are not ours and are noindex. It comes with our own
     stories (Phase F).
   - Every string is escaped for `<script>` (`<` as `<`), with a test.
5. **Not in R2:**
   - `/hi/` URLs and server-rendered Hindi (Phase F, owner);
   - news sitemaps and IndexNow (our own stories, Phase F);
   - a visual redesign (needs the owner's design).

**As built, two details differ from the text above:**
- **The section route sits at the app's root** (`app/[section]`), not in the `(feed)` group: under
  the group's loading file, an unknown section answered 200. The feed's own Suspense skeleton
  still shows while a section loads.
- **The 308 keeps the query string:** `/?category=world` goes to `/world?category=world`, because
  Next passes a redirect's query on. The section page ignores `category`, and its canonical link
  has no query.

**Commits** (each one green on `npm run verify`):
1. the brand token;
2. the route group and the real 404;
3. story URLs and the redirects;
4. section URLs and the redirects;
5. structured data;
6. docs.

**Checks:**
- jest tests for every redirect, 404 and canonical;
- the read-only browser tests extended to a section page, a story page by its new URL, an old
  `?url=` link and an unknown story's 404;
- `check-js-budget` before and after.

### Go-live gates

The site is public only when **all** of these hold:
1. **Supabase is on Pro:** the same project, no data migration; daily backups and no pausing.
2. **Panel 0's SQL is applied** ([the staff-access runbook](#staff-access-switching-on-panel-0-and-getting-back-in),
   Part B) and two Super Admins exist. Without it, every admin change in production answers 503.
3. **`database/policies.sql` is applied and checked** (F-008,
   [the database runbook](#applying-the-database-files)). Then the `SUPABASE_SERVICE_ROLE_KEY` line
   leaves `.env.web` (R12-03).
4. **Phase B is in the deployed tag** (`fix/aggregator-off`, merged 16 Nov 2026):
   - no scraped full text, no Google Translate, no stock or publisher photos, no mock articles;
   - outside-story pages carry noindex;
   - the AI chat is off.
5. **The NewsData Basic plan is bought.** Until then the refresh runs every 120 minutes on the free
   plan ([the news refresh](#the-news-refresh-interval-calls-and-the-admin-setting)); once it is
   bought, the interval goes back to 60. If the refresh moves to option (c), the R12-05 dry run
   (`refresh-news-dry-run`) has been done first.
6. **The grievance and contact pages show the real officer and address** (R3): Adarsh Pandey,
   `adarsh@timesprime247.com`, 704A-704B, Iris Tech Park, Sector 48, Gurgaon 122018. He is also
   the CERT-In contact. No phone number in the repository. Built on `site/grievance-details`
   (`/grievance`, contact, privacy and terms, from `packages/shared/src/config/site.ts`); the
   gate holds once that branch is in the deployed tag.
7. **The smoke test passes,** and the alarms, the budget, UptimeRobot and the snapshots are in
   place.

### Smoke test

After every deploy, from a browser and a shell:
- **NewsData accepts the key in its header** (R1-02b). From the server, in a shell that holds the
  key, this answers 200:
  `curl -s -o /dev/null -w "%{http_code}" -H "X-ACCESS-KEY: $NEWSDATA_API_KEY" "https://newsdata.io/api/1/latest?language=en"`.
  On 401 or 403 every refresh fails, and the worker exits 1.
- **Health:** `https://timesprime247.com/api/health` answers 200.
- **The feed:** `X-Data-Source` is `supabase` or `cache` on `/api/news/top-headlines`.
- **Outside stories:** an article page shows a headline, a summary, the source and "Read the full
  story at …", with `<meta name="robots" content="noindex, follow">`.
- **Images:** the page loads none but `/placeholders/*.svg` and the logos.
- **Removed and switched-off routes:** `/api/chat`, `/api/translate` and
  `/api/news/scrape-article` answer 404.
- **The refresh:** `journalctl -u timesprime-refresh.service` shows a run or a skip within 15
  minutes. A run's `audit_log` row (`system:cron`, `cron.refresh_news`) carries the purge count
  (F-015).
- **Scheduled publishing:** `journalctl -u timesprime-publish.service` shows a run every 5 minutes,
  each a JSON line (`"due":0` when nothing is scheduled). A story it publishes has `audit_log` rows
  `story.publish` by `system:scheduler`, with the editor who scheduled it as `on_behalf_of`.
- **Image renditions:** `journalctl -u timesprime-renditions.service` shows a run every 5 minutes, at
  two past, each a JSON line (`"made":0` when no image waits). Once the Desk's images are set up,
  `/media/originals/...` on the site answers 404.
- **The origin is locked:** `https://origin.timesprime247.com:8443/` without the header answers 403
  (from a team IP; anything else does not even connect).
- **The back office:** `https://admin.timesprime247.com/` redirects to `/admin`. Its files load
  from `/admin-assets/`, and an admin action's `audit_log` row carries Nginx's `X-Request-Id`.
- **The login limit:** the 11th attempt in 15 minutes answers 429, even with a different forged
  `X-Forwarded-For` on every attempt (R1-05).
- **Security headers:** every response has the six headers, and the browser console shows no
  `Content-Security-Policy-Report-Only` report on `/`, an article page and `/admin/login` (R1-06).
- **robots and sitemap:** `https://timesprime247.com/robots.txt` names the sitemap, and
  `/sitemap.xml` lists the static pages.

**Before production** (a list; Phase I plans it):
- **Staging:** skipped for the release (owner's senior; `run-local.sh` stands in).
- **A tested restore** of the weekly backup.
- **A load test** of the reader paths and the admin API.
- **Reviews:** dependencies (BL-031) and the CSP, which is report-only today.
- **Infrastructure as code.**
- **The incident runbook,** with CERT-In's 6-hour report.
- **The Supabase log drain** (BL-041).
- **Legal pages:** a legal review of the privacy policy and terms (BL-008).

---

## Runbooks

Operational procedures, written to be followed under pressure by someone who did
not write the system. Steps are literal and copy-pasteable; every check states
the expected output so the reader can tell pass from fail without judgement.

Candidates, based on failure modes already observed in this system:

- **Supabase unreachable** — every call returns `TypeError: fetch failed`. The
  app does not surface this: it silently degrades to calling NewsData.io per
  request, so the first visible symptom is upstream quota burn, not an error.
  Confirm with the `X-Data-Source` response header on
  `/api/news/top-headlines?refresh=true` — `newsdata` where `supabase` is
  expected means the store is not being read.
- **NewsData.io quota exhausted or key invalid** — feed falls back to built-in
  mock articles; header reads `mock`.
- **Refresh not running** — stale feed. Check `lastSyncAt` in `/api/admin/stats`
  against the worker's 30-minute schedule (`npm run job -- refresh-news`, started by
  the scheduler; its exit code is 1 when a run failed).
- **Admin lockout** — `ADMIN_PASSWORD` or `ADMIN_SESSION_SECRET` unset makes
  the shared-password login return 503 and every `/admin/*` path redirect to the
  login page. Staff accounts (Panel 0) have their own recovery: `staff-access.md`.
- **Restoring the database** — schema from `database/schema.sql`, then
  `database/policies.sql`.

Written:

- [`apply-database.md`](#applying-the-database-files) — apply the SQL files in `database/` in order, and verify each. Restoring the schema follows the same steps.
- [`staff-access.md`](#staff-access-switching-on-panel-0-and-getting-back-in) — switch on Panel 0 in order (migrations, deploy, bootstrap Super Admins, staff sign-in, freeze `admin_logs`, and only then the shared password off), and get back in when locked out.
- [`sign-in-broken.md`](#staff-sign-in-or-an-admin-action-is-failing) — staff sign-in or an admin action is failing: by what the person sees, the cause, how to confirm it and what to do, with the Sentry operation each failure reports.

### Applying the database files

For the owner, at deployment. Nothing in the app or its tooling applies these files; this runbook
is the only way they reach a database. Every file is idempotent, so a step that fails halfway can be
run again. Every step has a rollback, which relies on the snapshot you take in step 0.

**Before you start**
- Confirm which Supabase project you are connected to. The local `.env` may point at the
  production project ([Deployment](#deployment)); apply to the project you mean to change.
- Confirm that `SUPABASE_SERVICE_ROLE_KEY` is set in the deployment's environment variables. Check
  only that it is present; never copy its value anywhere. See [Which key the app uses](#which-key-the-app-uses-and-what-rls-does-to-it):
  without it, Row Level Security makes the app's writes fail.
- Take a backup, or confirm point-in-time recovery is on (Dashboard → Database → Backups).
- Open Dashboard → SQL Editor → New query. Paste each file whole, then Run.

#### Which key the app uses, and what RLS does to it

Every database call is made by the server, through one client (`packages/server/src/lib/supabase.ts`). The
browser never talks to Supabase. That client uses `SUPABASE_SERVICE_ROLE_KEY` when it is set, and
falls back to `NEXT_PUBLIC_SUPABASE_ANON_KEY` otherwise.

In Supabase, the `service_role` bypasses RLS (`rolbypassrls`), so with the service key every call
below works whatever the policies say. The policies matter only on the anon fallback, where only
the two public reads are allowed. How the rest fails depends on the grants:

- **After step 2**, anon holds no write grant on any table and nothing at all on `admin_logs`, so
  every other call fails with `permission denied`. The app logs it and reports it to Sentry. The
  activity log answers 500, and the audit-log insert is logged but not raised.
- **Between step 1 and step 2**, or anywhere anon still holds Supabase's default grants, RLS
  filters instead: reads and `UPDATE`/`DELETE` match **0 rows with no error**, so the activity log
  looks empty and a purge deletes nothing. Only an `INSERT` reports an error.

Granting anon those rights is not a fix: the anon key is public by design, so a write policy for
anon would let anyone write.

| Table | What the app does | Where | Service key | Anon fallback: the policy that allows it |
|---|---|---|---|---|
| `articles` | SELECT: the feed, the freshness check, the new-story count, the row count, the link lookup (F-005) | `packages/server/src/repositories/db.ts` | ✅ bypass | ✅ "Public read access" |
| `articles` | SELECT: health probe, admin list and stats, classifier column probe | `services/health`, `api/admin/articles.ts`, `api/admin/stats.ts`, `services/classify` | ✅ bypass | ✅ "Public read access" |
| `articles` | UPSERT: cron ingest, admin publish | `db.ts` `saveArticlesToDB`, `api/admin/publish-article.ts` | ✅ bypass | ❌ none |
| `articles` | UPDATE: admin edit, `category_mismatches`, scraped `content` | `api/admin/articles.ts`, `services/classify`, `services/scrape` | ✅ bypass | ❌ none |
| `articles` | DELETE: the 7-day purge, admin delete and bulk delete | `db.ts` `purgeOldArticles`, `api/admin/articles*.ts` | ✅ bypass | ❌ none |
| `breaking_news` | SELECT: the homepage banner (public `GET /api/admin/breaking-news`, CR-08) | `api/admin/breaking-news.ts` | ✅ bypass | ✅ "Public read access" |
| `breaking_news` | INSERT, UPDATE (`is_active = false`): admin set and remove | `api/admin/breaking-news.ts` | ✅ bypass | ❌ none |
| `admin_logs` | INSERT: every admin action and cron run | `packages/server/src/repositories/auditLog.ts` | ✅ bypass | ❌ none |
| `admin_logs` | SELECT, DELETE: the activity log and its clear button | `api/admin/logs.ts` | ✅ bypass | ❌ none |

Before the F-008 files existed, `articles` already had RLS enabled and the same policies through
`database/policies.sql`. So if the live cron is ingesting today (`lastSyncAt` advancing in
`/admin`), the service key is already in use.

#### 0. Snapshot the current state

Run these queries and keep their results (the SQL Editor's results grid has a download button).
Every rollback below restores what they show.

```sql
SELECT relname, relrowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('articles', 'breaking_news', 'admin_logs');

SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('articles', 'breaking_news', 'admin_logs')
ORDER BY tablename, policyname;

SELECT table_name, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('articles', 'breaking_news', 'admin_logs')
  AND grantee IN ('anon', 'authenticated', 'service_role')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;

SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'articles' ORDER BY indexname;

SELECT extname FROM pg_extension WHERE extname = 'pg_trgm';

SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname IN ('service_role', 'anon', 'authenticated');
```

The last query should show `service_role` = `true` and the other two = `false`. If `service_role`
is `false`, stop: the table above no longer holds, and RLS would block the app's writes.

#### 1. `database/schema.sql` — the tables

Creates whichever of `articles`, `breaking_news` and `admin_logs` is missing (the last two were
never in a file before F-008), with the `created_at` and `article_id` indexes on `articles`, and
enables Row Level Security on all three. A table that already exists is left as it is: `IF NOT
EXISTS` adds no columns or constraints to it. On the live project, where all three exist, the only
possible change is turning RLS on.

Verify:

```sql
SELECT relname, relrowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('articles', 'breaking_news', 'admin_logs');
```

Expected: 3 rows, every `relrowsecurity` = `true`.

**Rollback.** Turn RLS back off only on a table where the snapshot showed `relrowsecurity` =
`false`:

```sql
ALTER TABLE public.breaking_news DISABLE ROW LEVEL SECURITY;  -- only if the snapshot showed false
ALTER TABLE public.admin_logs DISABLE ROW LEVEL SECURITY;     -- only if the snapshot showed false
ALTER TABLE public.articles DISABLE ROW LEVEL SECURITY;       -- only if the snapshot showed false
```

Drop only what this step created, as the snapshot shows. That means a table with no row in the
first snapshot query, or `idx_articles_created_at` / `idx_articles_article_id` missing from the
index list. A table created by this step is new and empty. Run `SELECT count(*)` on it first and
drop it only at 0.

```sql
DROP INDEX IF EXISTS public.idx_articles_created_at;  -- only if missing from the snapshot
DROP INDEX IF EXISTS public.idx_articles_article_id;  -- only if missing from the snapshot
DROP TABLE IF EXISTS public.breaking_news;            -- only if missing from the snapshot, and empty
DROP TABLE IF EXISTS public.admin_logs;               -- only if missing from the snapshot, and empty
```

Never drop `articles`.

#### 2. `database/policies.sql` — who may read and write

Drops and recreates the policies on all three tables, and sets the table grants. `articles` and
`breaking_news` get public read access, `admin_logs` gets none, and only `service_role` writes.
Runs as one transaction: either all of it applies or none of it does, so a failed run needs no
rollback.

Verify:

```sql
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE tablename IN ('articles', 'breaking_news', 'admin_logs')
ORDER BY tablename, policyname;

SELECT has_table_privilege('anon', 'public.articles', 'INSERT');       -- false
SELECT has_table_privilege('anon', 'public.breaking_news', 'SELECT');  -- true
SELECT has_table_privilege('anon', 'public.admin_logs', 'SELECT');     -- false
```

Expected: 7 policies. `articles` has 4 (Public read access, Service role delete, insert, update),
`breaking_news` has 2 (Public read access, Service role full access), and `admin_logs` has 1
(Service role full access). Then false, true, false.

**Rollback.** The policies have the same names and rules as those in `policies.sql` and the code
comments before F-008, so on a project that already had them, nothing about them changed. What is
new is the grants: `breaking_news` loses INSERT, UPDATE and DELETE for anon and authenticated, and
`admin_logs` loses every privilege for them.

1. **Grants.** For each `anon` or `authenticated` row in the snapshot's grants query that differs
   from the verify output, grant its privileges back, for example:

   ```sql
   GRANT INSERT, UPDATE, DELETE ON public.breaking_news TO anon, authenticated;  -- as the snapshot listed
   ```

2. **Policies.** For a policy that the snapshot shows with a different rule, or that it does not
   show at all, drop it, then recreate it from the snapshot's `roles`, `cmd`, `qual` and
   `with_check` columns:

   ```sql
   DROP POLICY IF EXISTS "Service role full access" ON public.admin_logs;  -- one per policy, by name
   CREATE POLICY "<policyname>" ON public.<table> FOR <cmd> TO <roles>
     USING (<qual>) WITH CHECK (<with_check>);  -- leave out a clause the snapshot shows as null
   ```

Put the rollback in `BEGIN; … COMMIT;` so it applies whole or not at all.

#### 3. `database/migrations/2026-11-02-indexes.sql` — the indexes (F-018)

Enables `pg_trgm`, then adds five indexes to `articles`: GIN on `category` and `country`, trigram
GIN on `title` and `description`, and a btree on `link`. **The link index matters most.** The
article page (F-005) and the public scrape route look up every request's URL by `link`, and without
the index each lookup scans the whole table.

Optional pre-check, for information only (the link index is deliberately not unique):

```sql
SELECT link, count(*) FROM public.articles GROUP BY link HAVING count(*) > 1 ORDER BY 2 DESC LIMIT 10;
```

Verify:

```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'articles' ORDER BY indexname;

EXPLAIN SELECT title, link FROM public.articles WHERE link = 'https://example.com/x';
```

Expected indexes, beside the primary key and `articles_article_id_key`:
- `idx_articles_article_id`
- `idx_articles_category_gin`
- `idx_articles_country_gin`
- `idx_articles_created_at`
- `idx_articles_description_trgm`
- `idx_articles_link`
- `idx_articles_title_trgm`

The `EXPLAIN` should show `Index Scan using idx_articles_link`. On a very small table the planner
may still choose a sequential scan; that is expected, not a failure.

**Rollback.** Dropping an index loses no data; the queries only get slower again. Drop the five,
except any the snapshot already listed:

```sql
DROP INDEX IF EXISTS public.idx_articles_category_gin;
DROP INDEX IF EXISTS public.idx_articles_country_gin;
DROP INDEX IF EXISTS public.idx_articles_title_trgm;
DROP INDEX IF EXISTS public.idx_articles_description_trgm;
DROP INDEX IF EXISTS public.idx_articles_link;
```

Then, only if the snapshot did not list `pg_trgm`:

```sql
DROP EXTENSION IF EXISTS pg_trgm;  -- refuses (and changes nothing) if anything else still uses it
```

#### 4. In the app, afterwards

- `/admin` → the activity log loads, and adding a breaking-news item shows it on the homepage banner.
- Open an article from the feed: the page shows "Read on publisher's site" with the publisher's link.
- `GET /api/health` answers 200 with `{"status":"ok"}`. A 503 (`degraded`) means a dependency is
  down; the result is cached for 60 seconds, so wait a minute before checking again.

#### 5. The Panel 0 access files

Three more files, for staff accounts, roles and the audit log:
`database/migrations/2026-11-02-access-1-foundation.sql`, `2026-11-02-access-2-catalog.sql` and
`2026-11-02-access-3-freeze-admin-logs.sql`, plus `database/bootstrap/super-admin.sql`. They have
an order relative to the code deploy (migrations before it, the freeze after it), so they are not
listed here. Follow [`staff-access.md`](#staff-access-switching-on-panel-0-and-getting-back-in), which gives each step's check and undo.
Each file also carries its own verification queries and rollback.

From the Panel 0 deploy, the activity log reads `audit_log` (`admin_logs` is history), and an admin
change that cannot write its audit row is refused with 503.

If the activity log is empty or fails right after an admin action, the app may be on the anon
fallback; see
[Which key the app uses](#which-key-the-app-uses-and-what-rls-does-to-it). Roll back step 1 for
`admin_logs` and `breaking_news` (if their snapshot showed RLS off) until the key is set.

### Staff access: switching on Panel 0, and getting back in

For the owner. Panel 0 replaces the shared admin password with named staff accounts, roles and a
second factor ([design](PANEL_DOCS.md#panel-0-design-the-access-foundation), [PANEL_DOCS](PANEL_DOCS.md)).
Nothing in the app applies SQL or changes settings: every step below is yours. Each step says how to
check it and how to undo it.

**Where.** Against the real database, the one the env file names (owner decision, 2026-11-02): the
six steps in [Part B](#part-b--at-the-aws-deployment), when panels resume, with the app run locally
on that database for step 2. Nothing is deployed until the whole project is complete; on the day of
the AWS deployment the same steps apply there ([Deployment](#deployment)). These steps are
yours: no session and no test writes to that database.

#### The order

Do these in order, and do not start a step until the one before it checks out.

| # | Step | Check | Undo |
|--:|---|---|---|
| 1 | **Apply the SQL migrations** (before any code) | The verification queries at the end of each file | The foundation file's rollback (only before go-live) |
| 2 | **Run the code** | The shared password still works; an admin change writes an audit row | Run the previous version |
| 3 | **Bootstrap two Super Admins** | `database/bootstrap/super-admin.sql`'s checks 1–4 | Revoke the assignment (in the file) |
| 4 | **Sign in with a staff account and verify** | `/admin` says "Signed in as …"; the audit log shows the sign-in and the second factor | Nothing to undo; the shared password still works |
| 5 | **Freeze `admin_logs`** | It is still readable and no longer writable | Grant writes back (in the file) |
| 6 | **Only then, consider turning the shared password off** | It answers 403 "retired" | Remove the switch, before 1 January 2027 |

The shared password keeps working through steps 1–5, so there is always a way in while you set
staff accounts up. It stops by itself at 00:00 IST on 1 January 2027, whatever is configured.

---

#### Part A — dropped

Part A ran the same steps against a local Supabase stack. The owner dropped the local database
(2026-11-02), so the database-level checks (the two-admin trigger, the audit hash chain, the
bootstrap's checks 1–4) wait for Part B against the real database.

---

#### Part B — at the AWS deployment

Against the real database: when panels resume (then "deploy" in B2 means running the app locally
on the root `.env`), and again at the AWS deployment.

##### B1. Apply the SQL migrations

**Before you start.** In the Supabase dashboard:
- Authentication → Sign In / Providers: turn **off** "Allow new users to sign up". Staff accounts are
  invited, never self-registered.
- Authentication → Multi-factor: TOTP (authenticator app) **enabled**. It is on by default and free.
- Authentication → Sessions: leave the JWT expiry at the default, 1 hour.
- Take a backup, or confirm point-in-time recovery (Database → Backups).

Then in SQL Editor → New query, run each file whole, in this order:
1. `database/migrations/2026-11-02-access-1-foundation.sql`: the six tables, their triggers and
   grants.
2. `database/migrations/2026-11-02-access-2-catalog.sql`: the 15 roles, 41 permissions and the
   matrix (generated from the access rules (`docs/PANEL_DOCS.md`)). It is idempotent: when the
   matrix changes (Panel 2 added `author.manage` and `media.manage`, 17 Nov 2026), apply it again.

**Check.** The verification queries at the end of each file, each with its expected answer. In short:

```sql
SELECT count(*) FROM public.roles;             -- 15
SELECT count(*) FROM public.permissions;       -- 41
SELECT count(*) FROM public.role_permissions;  -- 140
SELECT has_table_privilege('authenticated', 'public.audit_log', 'SELECT');  -- false
SELECT has_table_privilege('service_role', 'public.audit_log', 'UPDATE');   -- false
SELECT public.audit_verify_chain();            -- NULL (an empty chain is intact)
```

The running app does not use these tables until step 2, so nothing changes for anyone yet.

**Undo.** The rollback section at the end of the foundation file drops the tables and functions.
Use it only before go-live: once `audit_log` holds real rows, it is never dropped (logs are kept at
least one year).

##### B2. Run the code

Deploy `main` (with Panel 0 merged) on AWS. No new environment variable is needed. `ADMIN_LEGACY_LOGIN` stays unset (the shared password stays
on).

**Check.**
- `/admin/login` shows the staff form (email and password) and "Use the shared admin password".
- The shared password still signs in. `/admin` shows a notice that it stops working on 1 January
  2027.
- Make one admin change with it, for example set a breaking-news item, then:

  ```sql
  SELECT seq, at, actor_label, action, outcome FROM public.audit_log ORDER BY seq DESC LIMIT 5;
  ```
  Expect two rows from `legacy:shared-password`, `breaking_banner.set`: `attempted`, then
  `succeeded`.
- Within 30 minutes the cron writes a `system:cron` row, action `cron.refresh_news`.

If every admin change answers 503 "The audit log could not be written", step 1 is missing, or
`SUPABASE_SERVICE_ROLE_KEY` is not set where the app runs (see
[apply-database.md](#which-key-the-app-uses-and-what-rls-does-to-it)). Nothing was
changed in either case: the app refuses a change it cannot record.

**Undo.** Roll back to the host's previous release. The new tables stay; the previous code ignores them.

##### B3. Bootstrap two Super Admins

Super Admins are the only accounts created outside the app, and only by you (owner decision D4).
Two of them, because granting any privileged role in the app needs two different Super Admins, and
there is no single-admin mode.

For each person:
1. Authentication → Users → **Add user → Create new user**, with their email and a strong password,
   and **Auto Confirm User** ticked. Hand the password over in person. Not **Invite user**: the admin
   has no page yet where an invited person sets a password (it comes with Panel 1; found while
   running B3, 17 Nov 2026). The script's own message still says "invite".
2. Open `database/bootstrap/super-admin.sql`, fill in `v_email` and `v_name` at the top, and run it.
   It refuses to run with the placeholders, refuses if the person has not accepted the invite, and
   does nothing if they are already a Super Admin.

**Check.** The verification block at the end of the file. Run all four. Checks 3 and 4 must
**fail** with an error, and roll back:
1. Lists the Super Admins so far.
2. Lists one `bootstrap` audit row per grant; `audit_verify_chain()` returns NULL.
3. The app's role tries to bootstrap and the trigger refuses.
4. The app's role tries to edit the audit log and is refused.

**Undo.** The file's rollback revokes the assignment (assignments are history, never deleted), and
optionally suspends the profile. It applies to the person's next request.

##### B4. Sign in with a staff account, and verify

Each Super Admin, on their own device:
1. `/admin/login` → email and password → **Sign In**.
2. The first time: "Set up your second factor". Scan the QR code with an authenticator app (any TOTP
   app), or type the key shown under it, then enter the 6-digit code.
3. Every time after: the code only.

**Check.**
- `/admin` says "Signed in as <name> · super admin". A Super Admin sees sync, stats, the activity
  log and the articles list, but no editorial controls: no publish form, no banner manager, and the
  list's edit and delete buttons answer 403. The plan gives Super Admin no editorial verbs. That is
  intended, not a fault.
- The audit log has the sign-in and the factor:

  ```sql
  SELECT actor_label, action, outcome, at FROM public.audit_log
   WHERE action LIKE 'auth.%' ORDER BY seq DESC LIMIT 10;
  ```
  Expect `auth.sign_in` / `succeeded`, `auth.mfa_enroll_started`, `auth.mfa_enrolled`, then
  `auth.mfa_verified` at later sign-ins.

**Undo.** Nothing to undo. If a staff sign-in fails, the shared password still works.

Granting editorial roles (Managing Editor, Desk Editor and the rest) in the app is Panel 1. Until
then, editorial work continues on the shared password, now recorded as `legacy:shared-password`.

##### B5. Freeze `admin_logs`

Nothing writes `admin_logs` since the deploy: staff actions and the cron write `audit_log`. Run
`database/migrations/2026-11-02-access-3-freeze-admin-logs.sql`.

**Check.** The queries at the end of the file:

```sql
SELECT has_table_privilege('service_role', 'public.admin_logs', 'SELECT');  -- true  (still readable)
SELECT has_table_privilege('service_role', 'public.admin_logs', 'INSERT');  -- false
```

Its history stays readable in the app at `GET /api/admin/logs?source=legacy` (`audit.read`).

**Undo.** `GRANT ALL ON public.admin_logs TO service_role;` (in the file).

##### B6. Only then: turning the shared password off

Turn it off only when all three hold:
- two Super Admins have signed in with their second factor, in production (after the AWS deployment);
- Panel 1 is done, so editorial staff have their own accounts and roles;
- you decide to.

Set `ADMIN_LEGACY_LOGIN=off` in the app's environment (on AWS, where its variables are configured),
then restart or redeploy it: the variable is read by the running server.

**Check.** The shared password gets 403 "The shared admin password has been retired". An old
shared-password cookie gets 401 from the proxy.

**Undo.** Remove the variable and restart. This works only until 00:00 IST on 1 January 2027. After
that, the shared password is refused by the code itself and no setting brings it back. The last
step is a code change that deletes it, with `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` (design §7).

---

#### Getting back in, and other emergencies

Your own way in never depends on the app: the Supabase dashboard and the SQL editor (locally, Studio
and `psql`; there, a reset is also always available).

**A staff member lost their authenticator device.** Authentication → Users → the user → remove
their MFA factor. Then sign them out of all sessions on the same page. At their next sign-in they
get the set-up step again. Record what you did:

```sql
INSERT INTO public.audit_log (actor_type, actor_label, action, outcome, entity_type, entity_id, reason)
VALUES ('bootstrap', 'owner:sql-editor:' || current_user, 'auth.mfa_reset', 'succeeded',
        'staff', '<user id>', 'lost device: <who asked, how you checked it was them>');
```

The app itself refuses to replace a verified factor (409). A stolen password alone cannot swap one.

**The last Super Admin is locked out** (lost device and no other admin, or a forgotten password).
Reset their password or factor in the dashboard as above. Or invite a new account and run the
bootstrap script for it (step 3).

**A session may be stolen.** Authentication → Users → the user → sign out of all sessions. Then
revoke their assignments, and suspend them if needed. Until Panel 1 this is SQL:

```sql
BEGIN;
UPDATE public.role_assignments
   SET revoked_at = now(), revoked_by = NULL, revoke_reason = '<why>'
 WHERE user_id = '<user id>' AND revoked_at IS NULL;
UPDATE public.staff_profiles SET status = 'suspended' WHERE user_id = '<user id>';
COMMIT;
```

The app reads assignments and status on every request, so this applies to their next request.
Signing them out ends the session itself.

**Is the audit log intact?** Run `SELECT public.audit_verify_chain();` weekly, and whenever in
doubt. NULL means intact. A number is the first row that does not verify. A rewrite of the whole
chain is caught only by a copy of its head kept elsewhere ([BL-034](#backlog)).

### The Desk (Panel 2): applying its tables

For the owner, before the Desk's routes are deployed (M1b). It needs Panel 0's Part B, steps B1 to B3,
first: the Desk's tables point at `staff_profiles` and reuse Panel 0's `reject_change()`. Nothing in
the app applies SQL.

1. **Re-apply the catalogue,** `database/migrations/2026-11-02-access-2-catalog.sql`. It is
   idempotent, and adds `author.manage` and `media.manage`. **Check:**
   `SELECT count(*) FROM public.permissions;` → 41, and
   `SELECT count(*) FROM public.role_permissions;` → 140.
2. **Apply `database/migrations/2026-11-17-desk-1-stories.sql`.** **Check:** the verify block at the
   end of the file:
   - eight sections;
   - ten tables with RLS on;
   - `service_role` cannot update a revision or delete a transition;
   - readers cannot see `pending_actions` or `created_by`, but can see `slug`;
   - readers cannot call `desk_transition`.

   Its `BEGIN … ROLLBACK` smoke test runs on a test project only, never on production data.
   **Done by the owner on 17 Nov 2026,** with every check passing.
3. **Apply `database/migrations/2026-11-17-desk-2-restore.sql`** (the two-person restore).
   **Check:**
   - `SELECT indexname FROM pg_indexes WHERE indexname = 'pending_actions_one_open';` → one row;
   - `SELECT has_function_privilege('anon', 'public.desk_decide_pending(uuid,uuid,text,text,text)', 'EXECUTE');`
     → false.
4. **Apply `database/migrations/2026-11-17-desk-3-corrections.sql`** (M3: a Sub-editor's correction
   request, decided by a second person). It replaces `desk_decide_pending` with one that decides
   corrections too; restores work as before. Paste the whole file into the SQL Editor and run it.
   **Check,** in one query (the editor shows only the last result):
   ```sql
   SELECT position('correction' IN pg_get_functiondef('public.desk_decide_pending(uuid,uuid,text,text,text)'::regprocedure)) > 0 AS decides_corrections,
          has_function_privilege('anon', 'public.desk_decide_pending(uuid,uuid,text,text,text)', 'EXECUTE') AS anon_may_call;
   ```
   → `true`, `false`. Until it is applied, a Desk Editor or the Managing Editor still publishes a
   correction at once; only deciding a Sub-editor's request fails (the screen shows the database's
   refusal). **Done by the owner on 17 Nov 2026,** the check returning `true`, `false`.
5. **Apply `database/migrations/2026-11-18-desk-4-credits.sql`** (M4: a story's credits). It adds
   `desk_set_credits`; nothing else changes. Paste the whole file into the SQL Editor and run it.
   **Check,** in one query:
   ```sql
   SELECT has_function_privilege('service_role', 'public.desk_set_credits(uuid,text,uuid,text,jsonb)', 'EXECUTE') AS service_may_call,
          has_function_privilege('anon', 'public.desk_set_credits(uuid,text,uuid,text,jsonb)', 'EXECUTE') AS anon_may_call;
   ```
   → `true`, `false`. Until it is applied, authors can be added and edited, but saving a story's
   credits fails (the screen shows the database's refusal). **Done by the owner on 18 Nov 2026,**
   the check returning `true`, `false`.
6. **Apply `database/migrations/2026-11-18-desk-5-media.sql`** (M4: the media library). It adds the
   tables `media_assets` and `asset_usages`; nothing else changes. Paste the whole file into the SQL
   Editor and run it. **Check,** in one query:
   ```sql
   SELECT (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('media_assets', 'asset_usages') AND rowsecurity) AS tables_with_rls,
          has_table_privilege('service_role', 'public.media_assets', 'DELETE') AS service_may_delete,
          has_column_privilege('anon', 'public.media_assets', 'uploaded_by', 'SELECT') AS anon_sees_uploader;
   ```
   → `2`, `false`, `false` once step 7 is applied too. Until desk-5 is applied, the media library shows
   the database's error, and on the server the image renditions job fails every 5 minutes (exit 1, in
   the journal): apply it before deploying a tag that carries the job (from `panel-2-desk-renditions`
   on). **Done by the owner on 18 Nov 2026:** the check returned `2`, **`true`**, `false`. Its REVOKE
   left out `service_role`, so Supabase's default privileges kept the app's DELETE; step 7 fixes it.
7. **Apply `database/migrations/2026-11-18-desk-6-media-grants.sql`** (the fix to desk-5). It takes
   every right on the two media tables from `service_role`, then grants exactly what the app needs
   (no DELETE; usages insert-only); readers' rights are not touched. Paste the whole file into the SQL
   Editor and run it. **Check,** in one query:
   ```sql
   SELECT has_table_privilege('service_role', 'public.media_assets', 'DELETE') AS assets_may_delete,
          has_table_privilege('service_role', 'public.asset_usages', 'UPDATE')
            OR has_table_privilege('service_role', 'public.asset_usages', 'DELETE') AS usages_may_change,
          has_table_privilege('service_role', 'public.media_assets', 'UPDATE') AS app_may_edit;
   ```
   → `false`, `false`, `true` (the last shows the app can still edit an image's record). Step 6's
   check then returns `2`, `false`, `false`.

**Undo.** The rollback at the end of the file, only before the first real story: stories are the
newsroom's record and are never dropped after that. desk-3's undo is to run desk-2 again; desk-4's
is to drop its function, and desk-5's to drop its two tables, before the first real image (each at
the end of its file). desk-6 needs none: it removes only rights the app never uses.

#### Granting the first Desk roles, until Panel 1

Panel 1 grants roles in the app. Until then the owner grants Writer, Sub-editor and Desk Editor
with the SQL below, one person and one role at a time.
- **Managing Editor** is privileged: the database takes it only from two different, active Super
  Admins (`granted_by` and `approved_by`), so it waits for the second Super Admin.
- **Create the person's account first:** Authentication → Users → Add user → Create new user, with
  **Auto Confirm User** ticked (see B3 of the staff-access runbook).
- Writer, Sub-editor and Desk Editor need a language (`en` or `hi`). The section may be one key
  (`india`, `sports` …) or NULL for all.

```sql
BEGIN;
DO $
DECLARE
  v_granter_email TEXT := 'adarsh@timesprime247.com';   -- you: an active Super Admin
  v_email         TEXT := 'REPLACE_ME@example.com';     -- the staff member, created first
  v_name          TEXT := 'REPLACE ME';
  v_role          TEXT := 'writer';                     -- writer, sub_editor or desk_editor
  v_language      TEXT := 'hi';                         -- en or hi: these roles need one
  v_section       TEXT := NULL;                         -- one section key, or NULL for all
  v_days          INT  := 180;                          -- the assignment expires
  v_granter UUID;
  v_user    UUID;
  v_id      UUID;
BEGIN
  IF v_email LIKE 'REPLACE_ME%' OR v_name = 'REPLACE ME' THEN
    RAISE EXCEPTION 'Fill in v_email and v_name first';
  END IF;
  IF v_role NOT IN ('writer', 'sub_editor', 'desk_editor') THEN
    RAISE EXCEPTION 'This grants writer, sub_editor or desk_editor only';
  END IF;
  SELECT id INTO v_granter FROM auth.users WHERE lower(email) = lower(v_granter_email);
  IF v_granter IS NULL OR NOT public.is_active_super_admin(v_granter) THEN
    RAISE EXCEPTION '% is not an active Super Admin', v_granter_email;
  END IF;
  SELECT id INTO v_user FROM auth.users WHERE lower(email) = lower(v_email) AND email_confirmed_at IS NOT NULL;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Create % first: Authentication -> Users -> Add user -> Create new user, Auto Confirm', v_email;
  END IF;
  INSERT INTO public.staff_profiles (user_id, display_name, status, mfa_required, created_by)
    VALUES (v_user, v_name, 'active', true, v_granter)
    ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.role_assignments (user_id, role_key, language, section, granted_by, reason, expires_at)
    VALUES (v_user, v_role, v_language, v_section, v_granter, 'Desk role by SQL until Panel 1',
            now() + make_interval(days => v_days))
    RETURNING id INTO v_id;
  INSERT INTO public.audit_log (actor_type, actor_label, action, outcome, entity_type, entity_id, after, reason)
    VALUES ('bootstrap', 'owner:sql-editor:' || current_user, 'role.assign', 'succeeded', 'role_assignment', v_id::text,
            jsonb_build_object('user_id', v_user, 'role_key', v_role, 'language', v_language, 'section', v_section),
            'Desk role by SQL until Panel 1');
  RAISE NOTICE '% is now % for %/%', v_email, v_role, v_language, coalesce(v_section, 'all sections');
END $;
COMMIT;
```

**Check.** The person signs in at `/admin/login` and sets up their second factor. Then
`GET /api/admin/desk/stories` answers 200 with the stories of their desk.

#### The Desk's Hindi typing check (M2, week 1)

The design's first checkpoint. If Devanagari input fails and cannot be fixed, the work stops and the
owner decides; the fallback is Quintype (research D3).

**Before:**
- Each tester has a staff account with a second factor.
- Each tester holds a Desk role for Hindi: the SQL above, with `v_language = 'hi'` (Writer or Desk
  Editor).

**On `/admin/desk/new`,** choose Hindi and open the story. Type into the headline, the dek and the body
with **InScript** and with a **phonetic** keyboard (Google Input Tools, or the phone's own):
1. Matras, halant and conjuncts: क्ष, त्र, ज्ञ, श्र, द्ध, and a word like विद्यार्थी.
2. Nukta letters (क़, ज़, फ़), chandrabindu and anusvara (हँसना, संसद), and the danda (।).
3. A paragraph pasted from Word or WhatsApp.
4. Select, delete and retype inside a conjunct; undo and redo.
5. **Save, then reload the page.** The text must come back exactly as typed.

**Record:** each tester, the keyboard, and pass or fail per step, with a screenshot of any failure.

**Undo** (for the role grant above). Revoke the assignment (rows are history, never deleted):
`UPDATE public.role_assignments SET revoked_at = now(), revoke_reason = '<why>' WHERE id = '<id>';`

### Staff sign-in or an admin action is failing

Panel 0's main flow is: email and password, then the authenticator code, then an admin action that
writes two audit rows. This page starts from what the person sees, names the cause, says how to
confirm it, and what to do. Getting a locked-out person back in is in
[`staff-access.md`](#getting-back-in-and-other-emergencies).

Two rules hold whatever is wrong:

- **Nothing here needs the app.** The Supabase dashboard and its SQL editor always work, and the
  SQL in this page runs there. The queries that only read are safe at any time; anything that writes
  is an owner action.
- **A refusal never changes anything.** Every 403 and 503 below was decided before the change, so
  there is nothing to undo. Check `audit_log` to see what was refused, and why.

#### First: what Sentry says

Every failure of the system on this path reaches Sentry with `tags.source = supabase` and an
`extra.operation`. A person's own mistake (a wrong password or code) is not reported.

| `extra.operation` | Where | What failed |
|---|---|---|
| `loadStaffRecord` | sign-in (`extra.at = sign-in`), and every admin request | reading `staff_profiles` or `role_assignments` |
| `listFactors` | `POST /api/admin/mfa` | reading the user's factors from Supabase Auth |
| `enroll` | `POST /api/admin/mfa` | starting a TOTP enrolment |
| `beginAudit` | every audited change | writing the `attempted` row: the change was refused |
| `finishAudit` | every audited change | writing the outcome row: the change happened, its outcome row is missing |

#### By what the person sees

| They see | Cause | Confirm | Do |
|---|---|---|---|
| **"Incorrect email or password."** for everyone, right password or not | The email provider is off, or Supabase Auth is down. Supabase answers "Email logins are disabled", which the app does not pass on (it never says which part was wrong) | Dashboard → Authentication → Sign In / Providers → Email: the provider must be on | Turn the provider on. Sign-ups stay off through "Allow new users to sign up" |
| "Incorrect email or password." for one person | Their password | Dashboard → Users → the user → last sign-in | Send them a password reset |
| **"This account is not a staff account."** (403) | A valid user without a `staff_profiles` row | `SELECT * FROM public.staff_profiles WHERE user_id = '<id>';` returns nothing | Add the profile. Until Panel 1, by SQL, as in `staff-access.md` |
| **"This staff account is suspended."** (403) | `status = 'suspended'` | The same query | Reactivate only if that was a mistake; the suspension is recorded in the audit log |
| **"Could not check your account. Try again."** (503 at sign-in) | The staff record could not be read: the database is unreachable, or a grant is missing | Sentry `loadStaffRecord`. `SELECT has_table_privilege('service_role', 'public.staff_profiles', 'SELECT');` must be `true` | Restore the database or the grant (re-apply `2026-11-02-access-1-foundation.sql`: idempotent). The person was signed back out; they retry |
| "Staff sign-in is not configured." (503) | `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` unset on the server | The deployment's environment | Set both, redeploy. The shared password still works meanwhile, until it is retired |
| **"Could not start the set-up."** (502), or "Could not read your second-factor status." (503) | Supabase Auth refused the MFA call; TOTP is off for the project | Sentry `enroll` or `listFactors`. Dashboard → Authentication → Multi-factor: TOTP on | Turn TOTP on |
| **"That code is not right."** (401) every time | The phone's clock is off: a code is valid for 30 seconds | The time on the phone against an accurate clock | Set the phone to automatic time. After five tries in 15 minutes, that user gets 429 |
| "A second factor is already set up." (409) at set-up | They lost the device and are enrolling again | — | The lost-device steps in `staff-access.md`. The app never replaces a verified factor, on purpose |
| "Too many login attempts." (429) | Ten attempts from one address in 15 minutes | — | Wait the minutes the message names. Without Upstash each server instance counts on its own |
| **"This action needs a second factor."** (403, `mfa_required`) | Signed in with the password, not yet the code | `audit_log`: a `denied` row with `reason = 'mfa_required'` and `aal = 'aal1'` | Finish signing in with the code (the dashboard links to it) |
| "You don't have permission for this action." (403, `forbidden`) | No live assignment grants it (none, revoked or expired), or the shared password, which has a fixed list | `SELECT role_key, language, section, expires_at, revoked_at FROM public.role_assignments WHERE user_id = '<id>';` | Grant the role. A privileged role needs two Super Admins (the database refuses otherwise) |
| "This action needs a second approver…" (403, `needs_approval`) | The permission is A (two people) in the plan's matrix, and approvals come with a later panel | — | Nothing to fix: refused by design until then |
| **"The audit log could not be written, so nothing was changed."** (503) | The `attempted` row failed, so the change was refused (owner decision Q2) | Sentry `beginAudit`. `SELECT has_table_privilege('service_role', 'public.audit_log', 'INSERT');` must be `true`. Then `SELECT public.audit_verify_chain();` | Restore the grant (re-apply access-1) or the database. Retry the action: nothing was half-done |
| "Could not check your permissions. Nothing was changed." (503) | The staff record could not be read on an admin request | Sentry `loadStaffRecord` | As for "Could not check your account" |
| "The shared admin password has been retired." (403) | `ADMIN_LEGACY_LOGIN=off`, or it is 2027-01-01 IST or later | — | Use a staff account. Before the date, removing the variable brings it back (`staff-access.md`, step B6) |
| "Unauthorized: please log in." (401) on every request after signing in | The session cookie is not kept: a `secure` cookie over plain HTTP, or a clock far off on the server | The browser's cookies for the site | Serve over HTTPS. A production build (`next start`) marks both session cookies `secure`; browsers accept that on `http://localhost` only, so a LAN address over HTTP signs no one in |

#### If an action happened but its outcome row is missing

Sentry `finishAudit`. The change was made. Its `attempted` row stands, and no row points back to it
(an attempt without an outcome, owner decision Q2). Check the change itself, then record it:

```sql
INSERT INTO public.audit_log (actor_type, actor_label, action, outcome, attempt_id, entity_type, entity_id, reason)
VALUES ('bootstrap', 'owner:sql-editor:' || current_user, '<the action>', 'succeeded', '<attempted row id>',
        '<entity type>', '<entity id>', 'outcome written by hand: <how the change was checked>');
```

#### What the automated tests cover

The unit tests cover the routes' answers on this page with Supabase stubbed:
`apps/admin/src/app/api/admin/login/route.test.ts`, `mfa/route.test.ts`, `access.test.ts` and
`packages/server/src/auth/*.test.ts`.
What Supabase itself answers (a provider switched off, TOTP disabled) they cannot show. The browser tests (`npm run test:e2e`)
are read-only: the refused access while signed out, and the sign-in page's accessibility. Nothing
automated signs in against the real database, so after a change to this flow the check is the
owner's, by hand: [`staff-access.md`](#staff-access-switching-on-panel-0-and-getting-back-in), step B4.

## Current status

> **The release first (owner, 2026-11-02; hosting decided 4 and 16 Nov 2026).** The owner's senior
> asked for a deployment. The release runs on **one EC2 server in Mumbai with Docker Compose**
> ([Deployment](#deployment)); panel work waits for it. Its code is on `main` (16 and 17 Nov
> 2026, PRs #4 to #14), and the runbook below is what remains, for the owner's manager in the AWS console.
>
> **The real database (owner decision, 2026-11-02).** The env file (the root `.env`; `.env.local`
> until 2026-11-04) holds the real database's credentials, and the app uses them. The local database
> was dropped. **Never read, print or edit an env file.** You never write to the real database yourself: no SQL, no migrations, no
> bootstrap, no test users, no destructive or tamper tests. The app's normal behaviour (reading news,
> ingesting articles) is fine. Browser tests are read-only. A schema change
> is an owner action in a runbook. Since `78e58b6` every admin change writes `audit_log` first and
> refuses with 503 without it, so the admin needs Panel 0's migrations wherever it runs.
>
> **Branch rule:** all work happens on a branch (`panel-N-<name>`, `fix/<topic>`, `chore/<topic>`),
> and only that branch is pushed. **Nothing is merged into `main` by a session, not even locally:**
> each branch goes up as a pull request, and the owner's senior merges it.

**For:** a fresh Claude session (or engineer) continuing this work with no prior context.
**State as of:** 2026-11-16. On `main` since 16 Nov 2026, each through a PR the senior merged:
- **R1** (PR #5): containers, the shared Next cache, the NewsData key in a header, security
  headers, error pages, robots and the sitemap, the client IP and request ID, the AI caps.
- **Reader bug fixes** (PR #4): the category menu's sub-topic search, the search box.
- **EC2 basics** (PR #6):
  - the domain `timesprime247.com`;
  - proxy hops (reader 2, admin 1) and Nginx's request ID;
  - host-only staff cookies;
  - the Redis circuit breaker (BL-040).
- **R1-12** (PR #7): readers read only the database; the worker fetches English and Hindi every
  60 minutes on a 15-minute timer; the CI browser test reads a Supabase stand-in.
- **Phase B** (PR #8): outside news is headline + summary + source + link.
  - No scraper, no Google Translate, no stock or publisher photos, no mock articles.
  - Outside-story pages carry noindex.
  - The AI chat is off behind a flag.
  - `/api/health` no longer needs the NewsData key.
- **The deploy kit** (PR #9): `deploy/`, with Compose, Nginx, the refresh timer, and the build,
  deploy, rollback and local-run scripts.

**Panel 0 (Access foundation) is complete in code** ([`PANEL_DOCS.md`](PANEL_DOCS.md), §4) and
paused for the release. **Its SQL is partly applied** (the owner, 17 Nov 2026):
- B1 is done: the foundation and the catalogue (41 permissions, 140 cells).
- The first Super Admin is bootstrapped.
- The Desk's migrations (desk-1, the stories; desk-2, the restore) are applied and checked.
- Still to do: their second factor, the second Super Admin, the deploy (B2) and the `admin_logs`
  freeze (B5). Its database-level checks (the two-admin trigger,
the audit hash chain, the bootstrap) are **unverified**: the owner verifies them against the real
database with [the staff-access runbook](#staff-access-switching-on-panel-0-and-getting-back-in),
Part B; it is a [go-live gate](#go-live-gates). Before it, five restructures and all five audit
phases were done:
- **Restructure 5** (the plan's Phase C, ADR 0006): `apps/web`, `apps/admin` and `apps/worker` over
  `packages/server`, `packages/shared` and `packages/ui`.
- **Restructure 4** ([ADR 0005](ARCHITECTURE.md#adr-0005--the-standard-nextjs-src-layout-2026-11-02-superseded-by-0006), superseded by ADR 0006): the
  standard `src/` layout and the cleanup.
- **Restructure 3** (on `main`, [ADR 0004](ARCHITECTURE.md#adr-0004--four-top-level-folders-four-documents-2026-11-03-superseded-in-part-by-0006)):
  four top-level folders and four documents. Its code layout gave way to restructure 5 when `main`
  was merged here; its env-file, docs and settings rules carried over.
- **Audit Phases 1–5** fixed the 28 audit findings. None is open: 22 are resolved, 5 await a check
  that needs production or the owner, and 1 (F-028) is partial. Status per finding:
  [the audit ledger](#audit-ledger).
- **Restructure 2** (S0–S5, [ADR 0002](ARCHITECTURE.md#adr-0002--frontend-backend-shared-and-database-separation-in-one-nextjs-app-2026-10-30-superseded-by-0004-in-part-and-by-0005), now superseded by
  ADR 0005) split the code into `app/`, `frontend/`, `backend/`, `shared/` and `database/`.
- **Restructure 1** (Phases A–E, [ADR 0001](ARCHITECTURE.md#adr-0001--feature-first-structure-with-layer-separation-and-a-ci-enforced-boundary-2026-10-30-superseded-by-0002), now superseded)
  came before it.

**Next:**
1. **The AWS setup and the first deploy** ([Deployment](#deployment)): the manager follows the
   runbook, then the [go-live gates](#go-live-gates).
2. **R12-05** (PR #11, merged 16 Nov 2026): several categories per NewsData call, behind
   `NEWS_REFRESH_BATCHED`, with the dry run `refresh-news-dry-run`. After the Basic plan is bought,
   the manager runs the dry run on the server and switches it on
   ([the news refresh](#the-news-refresh-interval-calls-and-the-admin-setting)). Then the admin
   refresh-interval setting, once it is approved to build (its design is in the same section).
3. **The rest of the release:**
   - **R2** (`site/brand-design`, in review; [its design](#r2-design-brand-colour-section-and-story-urls-structured-data)):
     - the brand colour as one token;
     - section URLs (`/india` and the rest), with 308s from `/?category=`;
     - story URLs (`/article/{headline-slug}-{article_id}`), with 308s from `?url=` and a real
       404 (BL-042);
     - the publisher's JSON-LD on home and About.

     BL-039, BL-044 and BL-045 were merged on 17 Nov 2026 (PR #14).
   - **R3** (PR #13, merged 17 Nov 2026): the `/grievance` page, and the real email, officer and
     office address on contact, privacy and terms, from one site-config value. Next.js went to
     16.4.6 first (PR #12, gotcha 3.36).
   - **R4:** go-live.
4. **Finish Panel 0** (the plan's Phase A): the owner applies the SQL and runs Part B; then the
   owner approves Panel 0 as Done.
5. **The audit close-out** (rest of Phase B, `fix/audit-closeout`):
   - F-028 / BL-028 (theme ternaries);
   - the SQL checks for F-006, F-008 and F-018;
   - the F-002 fallback check.
6. **The Publisher (Panel 2, the Desk)**, started before Panel 1 at the owner's request
   (17 Nov 2026); `NEWSROOM_PLAN.md` is unchanged. Its [design](PANEL_DOCS.md#panel-2-design-the-desk-publisher)
   is approved. M1a and M1b (the stories backend and the Desk API) were merged on 17 Nov 2026
   (PRs #17, #18), the two-person restore (PR #19), the editor package (PR #20), the Desk's
   screens (PR #21) and revisions on the story screen (PR #22). M2's code is complete; the Hindi
   typing check still closes it. M3 (approved by the owner, 17 Nov 2026): the reader's story page
   was merged (PR #23), and the preview, moved into the back office by the owner (design decision 7,
   so no `PREVIEW_SECRET`, PR #24), and scheduled publishing (the worker's `publish-scheduled` job and
   its 5-minute timer in `deploy/`, PR #25), and corrections (PR #26; the owner applied desk-3 on 17
   Nov 2026), and the Desk's alert list for takedowns (PR #27), which completes M3's code. M4
   (approved by the owner, 18 Nov 2026): authors and a story's credits were merged (PR #28; the
   owner applied desk-4 on 18 Nov 2026), and the image fixed for the editor package (PR #29). The
   media library's first part (upload, the record and its rights, S3 or a local folder) was merged
   (PR #30); the owner applied desk-5 on 18 Nov 2026, and its check showed the app kept DELETE on the
   media tables, which desk-6 (`fix/desk-media-grants`, "The Desk (Panel 2): applying its tables",
   step 7) takes away. The renditions (the worker's `make-renditions` job and its 5-minute timer;
   originals kept private) were merged (PR #31). On the server the images need the manager's
   [media steps](#the-desks-images-panel-2-after-the-release). Images in stories follow. Panel 1 will be built on `panel-1-administration`.

The plan is [`NEWSROOM_PLAN.md`](NEWSROOM_PLAN.md); the access rules are in [PANEL_DOCS.md](PANEL_DOCS.md#access-rules); the panels, one at a time, are in
[`PANEL_DOCS.md`](PANEL_DOCS.md). Run `git log --oneline -20` on the branch for the exact head.

Read §1 and §3 before touching anything. §3 in particular will save you from false conclusions
that have already been reached and discarded once.

---

### 1. Start here

**What this is.** A bilingual (English/Hindi) news aggregator on Next.js 16.4 / React 19.
NewsData.io → Supabase (7-day rolling window) → Supabase-first read path with Upstash Redis
caching. Plus a Cheerio article scraper, Claude Haiku for chat and category classification, an
unofficial Google Translate wrapper, and a session-gated admin panel at `/admin`.

**Where the work stands.**
- **Restructure 1** (Phases 0, 1, A–E) built the knowledge base (PRD, CODEMAP, architecture), took
  the owner's five product decisions (§9), and moved the code into a feature-first `src/`. It also
  made the import rules fail CI.
- **Audit Phase 1** cleared the critical and high dependency advisories and added `/api/health`.
  **Phases 2–5** (after restructure 2) fixed the security findings, the data layer and the
  failure and UX findings, then closed out (§4). Every finding has a status in the audit ledger.
- **Restructure 2** answered the reviewer's request to make frontend, backend, database and docs
  visibly separate. One app, with `src/app/` as a routing shell
  ([`ARCHITECTURE.md`](ARCHITECTURE.md#architecture) §4):
  - The cleanup came first (S1, with follow-ups the owner approved in S2): two stale docs, five
    unused SVGs, an unused script, three unused exports, 24 dead translation keys, two unused colour
    fields, four unused dependencies.
  - S3 moved 95 files in 11 slices. The route table stayed identical and the CSS byte-identical,
    and the client JS changed by 35 bytes.
  - S4 rewrote the lint boundary rules for the new layers (F1–X1 plus V1), opened every backend
    module with `import "server-only"`, and proved each rule with a deliberate violation (46
    probes).
  - S5 brought every document up to date.
- **Phase F (decomposing the oversized files) is optional and not started** (§6).

**The single most important fact:** Supabase **was** failing every call with `TypeError: fetch
failed` until about 29 Oct, and the app hid it by silently serving NewsData.io. On 30 Oct it is
reachable again with no code change (F-002 in the audit ledger). It can no longer fail silently:
`/api/health` answers 503 when it is down, and each fallback is reported to Sentry, rate-limited.
Check `/api/health` before assuming the database is either up or down.

**Key documents in this repo** (seven Markdown files and no others; `npm run check:docs` holds it):

| File | What it holds |
|---|---|
| `CLAUDE.md` | **Every session, first.** Start here: the plan, the branch rules, the database rules |
| `docs/README.md` | Setup, commands, the folder structure, where new code goes, the commit rules |
| `docs/OPERATIONS.md` | Environment variables, deployment, the runbooks, **this current status**, the backlog (BL-001..BL-040) and the audit ledger (F-001..F-028) |
| `docs/NEWSROOM_PLAN.md` | **The build plan.** The phases from Panel 0 to launch and after, their order, owner tasks and the sign-off |
| `docs/ARCHITECTURE.md` | The flows, the layout, the import rules, and the decisions (the owner's, and ADRs 0001–0006) |
| `docs/PANEL_DOCS.md` | **For the back office.** The definition of done; the access rules (panels, roles, the permission matrix the catalogue SQL is generated from, four-eyes and MFA rules, data model); progress (panels 0–9) and each finished panel's record; Panel 0's design as approved (D1–D12, Q1–Q8) |
| `docs/RESEARCH.md` | The sourced research behind the plan |

The runbooks that matter now, all in OPERATIONS: [apply the database files](#applying-the-database-files)
(an owner action), [staff access](#staff-access-switching-on-panel-0-and-getting-back-in) (switching Panel 0 on, in order, and
getting back in) and [sign-in broken](#staff-sign-in-or-an-admin-action-is-failing).

There is also a published audit artifact (28 findings, severity-filterable):
`https://claude.ai/artifact/Hpo9Q5pJg1vw7ZjXyuT8Ck` — private to the owner.

### 2. Environment and commands

| | |
|---|---|
| Platform | Windows 11. Both PowerShell and Git Bash available |
| Node / npm | v24.19.0 / 11.17.0. **Node 24 everywhere** since `974b255`: `engines` `24.x`, which CI reads (`.node-version` deleted, from `main`'s `5da44cd`) |
| Dependencies | Installed via `npm ci` |
| Dev server | **Stopped** during both restructures (its Turbopack watcher can lock files during `git mv`). `npm run dev` to start |
| Database | **The real one, in the root `.env`** (`.env.local` until 2026-11-04; owner, 2026-11-02; the local database was proposed, set up, and dropped: `d587e56`, reverted in `67359e6`). Never read, print or edit an env file. Never write to the database yourself; the app's normal reads, ingestion and caching are fine. Browser tests are read-only |
| Deployment | **The release now** (`release/v1`, owner, 2026-11-02), on AWS `ap-south-1` (owner, 4 Nov 2026; [Deployment](#deployment)) |
| Line endings | **CRLF** in a Windows working tree (`core.autocrlf=true`); LF on the owner's macOS checkout. The index is LF |
| Git identity | Set locally for this repo: `Vivek Singh <vivektech.dev25@gmail.com>`. Not global |

```bash
npm run dev               # the reader site (apps/web), http://localhost:3000
npm run dev:admin         # the back office (apps/admin), http://localhost:3001/admin
npm run job -- <name>     # a worker job (apps/worker); refresh-news writes to the configured database
npm run verify            # THE GATE: typecheck -> lint -> test -> build -> check:js-budget
npm run test:e2e          # Playwright (Chromium), read-only, against production builds of both apps
npm run check:js-budget   # each route's client JS against scripts/js-budget.json (needs a build)
npm run typecheck         # tsc --noEmit, for every app, every package and the root
npm run lint              # eslint, including the boundary rules (eslint.config.mjs)
npm test                  # jest
npm run test:ci           # jest with coverage
```

**Baselines at the pause of Panel 0, on the branch `panel-0-access` (`1a215a0`, 2026-11-02).** Compare against these after any change:

| Measure | Value |
|---|---|
| Routes | **30**, identical to `_baseline-routes.txt` (Panel 0 added `/api/admin/me` and `/api/admin/mfa`) |
| Client JS | **981,876 bytes** in 18 chunks (976,061 at the audit close-out). Per route (entry chunks only): `/admin` 164,372 · `/article/[slug]` 141,655 · `/` 125,795 · `/saved` 113,333 · `/contact` 100,601 · `/about`, `/privacy`, `/terms` 97,443 each · `/admin/login` 35,636 · `/_not-found` 28,259. Panel 0 changed only the two admin pages: `/admin` +1,929 (the clear button out, `/me` and the permission checks in; then +271 for the role, id and aria-label attributes), `/admin/login` +3,886 (staff sign-in and the MFA steps; then +13 for `role="alert"`). The JS budget (`scripts/js-budget.json`) counts each route with the shared framework chunks: `/admin` 753,710 of 791,552, `/admin/login` 624,974 of 656,384 |
| CSS | **93,942 bytes**, one file, 927 selectors (+6 in Panel 0, for the notices and the code field) |
| Tests | **49 suites, 757 tests**, all passing. Browser tests: **10**, read-only (`npm run test:e2e`) |
| Coverage | **93 files** (the shims excluded): 60.07% of statements (8,635 of 14,374), 74.98% of branches, 74.35% of functions. `backend/` + `shared/`: 78.02% (5,514 of 7,067). `proxy.ts`: 100% (it was 0%) |
| Lint | **0 errors, 13 warnings** (all in source; BL-002 accounts for two) |
| Boundaries | Lint zones (`eslint.config.mjs`) and `import "server-only"` on every `packages/server/src/` module; `check:boundaries` was removed in restructure 4 |
| `npm audit` | **37: 0 critical, 0 high, 34 moderate, 3 low**. The moderates are dev and build tooling (BL-031); the lows are the accepted jest set |

**After restructure 4 (`chore/restructure`, same machine as a fresh build of `panel-0-access`):**
routes identical (30); client JS **980,692 bytes** (−900): `/` 125,360 · `/article/[slug]` 141,469 ·
`/admin` 163,762 · `/saved` 113,090 · `/contact` 100,358 · `/about`, `/privacy`, `/terms` 97,307
each · `/admin/login` 35,541 · `/_not-found` 28,175; CSS **93,939 bytes**, byte-identical (the
93,942 above was measured on Windows); 47 suites, 736 tests; lint 0 errors, 13 warnings.

**After restructure 5 (the apps/packages split, same machine):** `apps/web` 15 routes, `apps/admin`
16 routes plus the proxy; every old route present (the cron route became the worker's
`refresh-news` job; `/api/news/breaking-news` is new). Client JS, web: `/` 125,071 ·
`/article/[slug]` 141,328 · `/saved` 112,909 · `/contact` 100,205 · `/about`, `/privacy`, `/terms`
96,768 each · `/_not-found` 28,135. Admin: `/admin` **80,206** (was 163,762) · `/admin/login`
**23,705** (was 35,541). CSS: web 83,122 bytes, admin 47,737. 50 suites, 753 tests; lint 0 errors,
13 warnings. Measure each app from its own folder (`apps/<app>/.next`).

**After Panel 0's second half joined the split (`chore/integrate`):** 52 suites, 774 tests; 10
browser tests (web runs `reader.spec`, admin `admin-access` and `accessibility`). The JS budget
counts each route with the shared framework chunks, per app: web `/` 713,895 · `/article/[slug]`
730,152 · `/saved` 701,733 · `/contact` 689,029 · `/about`, `/privacy`, `/terms` 685,592 each;
admin `/admin` **668,614** (was 753,710 in one app) · `/admin/login` **611,836** (was 624,974).

Client JS is the sum of `.next/static/chunks/**/*.js`. A route's JS is the chunks listed in
`entryJSFiles` of its `.next/server/app/**/page_client-reference-manifest.js`. Chunk bytes move
when module ids do (§3.17).

```
tsc --noEmit             exit 0
eslint                   exit 0   (0 errors, 13 warnings)
jest --ci                52 suites, 774 tests passed
next build               exit 0   (web 15 routes, admin 16 plus the proxy)
check:js-budget          exit 0   (13 routes in 2 apps within budget)
playwright test          10 passed (read-only)
```

### 3. Gotchas that have already burned time

These are not theoretical. Each one caused a wrong conclusion or a failed command in an earlier
session.

#### 3.1 This is not the Next.js you were trained on

Next 16.4 postdates most published material. **`CLAUDE.md` requires reading
`node_modules/next/dist/docs/` before relying on any framework convention.** Known traps:

| Looks wrong | Actually correct |
|---|---|
| `apps/admin/src/proxy.ts` instead of `middleware.ts` | Next 16 **renamed Middleware to Proxy**. Correct as-is, in `src/` beside `app/` (required with a `src/` folder) |
| `preload` prop on `next/image` | Correct. **`priority` is deprecated as of v16.0.0** — the familiar prop is the wrong one |
| `remotePatterns` hostnames using `{,*.}host` glob | Correct. Hostnames are matched with **picomatch**, not string equality (`next/dist/shared/lib/match-remote-pattern.js`) |

`remotePatterns` is capped at **50 entries** (zod `.max(50)` in `next/dist/server/config-schema.js`).
The list in `packages/shared/src/config/imageDomains.ts` holds 49. One slot free.

> A previous pass flagged `preload` as a bug. It was wrong, and the bundled docs settled it.
> **When docs and memory disagree, the bundled docs win.**

#### 3.2 Check whether Supabase is up before diagnosing anything

It was down until about 29 Oct — every operation failed: Select, Upsert, Purge, Freshness Check,
breaking-news read — and it is up again on 30 Oct. `GET /api/health` answers 200 or 503;
`/api/admin/health` (with a session) names the failing dependency and an error code. Or confirm
with:

```bash
curl -s -D - -o /dev/null "http://localhost:3000/api/news/top-headlines?refresh=true" | grep -i x-data-source
# newsdata on a fresh table means Supabase failed; supabase or cache means it answered
```

The `X-Data-Source` header tells you which tier answered: `cache` / `supabase` / `newsdata` / `mock`.
Also check `.next/dev/logs/next-development.log` for the actual errors.

#### 3.3 CRLF breaks multi-line string anchors

Source files use CRLF in the working tree. Any script doing a multi-line find/replace must
normalise:

```js
const crlf = s.includes('\r\n');
const fix = t => crlf ? t.replace(/\r?\n/g, '\r\n') : t;
```

Single-line anchors are fine. Multi-line ones silently fail to match without this.

#### 3.4 Bash heredocs choke on this content

Heredocs containing backticks, `${...}`, or HTML repeatedly failed with quoting errors. **Use the
Write tool for file content, or write a Node script to a scratch file and run it.** Do not fight
the shell. Inline `node -e` with backslash regexes breaks the same way.

#### 3.5 `/tmp` paths don't resolve in Node on Windows

`node -e "require('/tmp/x.json')"` fails. Node also resolves `require()` relative to the *script's*
directory, not the cwd. Use absolute Windows paths, and for project modules use
`require(process.cwd() + '/node_modules/...')`.

#### 3.6 Jest coverage was lying

`collectCoverageFrom` was unset, so coverage instrumented only files the tests imported — it
reported **91.42%** while describing 5 of 73 source files. Fixed in `4e79cb1`. The real number was
**4.41%**, fell to **3.50%** when `3805007` deleted the paraphraser — one of the few well-covered
modules — and was **3.63%** at `9f3b76f` only because later deletions shrank the denominator.
Restructure 2 measured the whole repo by glob (`7ef8ab8`), and the audit fixes added tests: **9.27%**
of statements at the end of restructure 2. Since restructure 4 the glob is `src/**`. The oversized files in §6 still read **0%**.

#### 3.7 `eslint-disable-next-line` placement

It disables the **next line**, including a comment line. Putting it at the top of a multi-line
explanation block disables the comment, not the code. The explanation goes first; the directive sits
immediately above the statement.

#### 3.8 Two npm postinstall scripts are blocked

`@sentry/cli` and `unrs-resolver` were blocked by sandbox policy. **This does not break anything** —
`npm run build` and `npm run lint` both work. (An earlier claim that it might break the build was
wrong.) `npm approve-scripts --allow-scripts-pending` if source-map upload is ever needed.

#### 3.9 Never print the env file

The root `.env` (`.env.local` until 2026-11-04) holds real credentials. It is never read, copied or moved, including for worktrees and probe
builds (owner instruction); a probe build runs without it. Keys set at the last check (names only):
`ADMIN_PASSWORD`, `ADMIN_SECRET_TOKEN`, `ADMIN_SESSION_SECRET`, `CRON_SECRET`,
`MEDIASTACK_API_KEY`, `NEWSDATA_API_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

Note `ADMIN_SECRET_TOKEN` is set but **read by nothing** — leftover from the stale
`.env.local.example` that the README now corrects.

#### 3.10 Moving or deleting a route breaks `typecheck` until `.next/types` is cleared

`npm run verify` runs `typecheck` **before** `build`, and `tsconfig.json` includes the previous
build's generated route types. After a route file moves or is deleted, `tsc` reads a stale validator
still importing the old path:

```
.next/types/validator.ts: error TS2307: Cannot find module '../../src/app/.../route.js'
```

The source is fine — do not "fix" it. `rm -rf .next/types` and re-run. It hit the RSS deletion
(`bcd5393`), and every restructure-2 slice that touched `src/app/` cleared `.next/types` first. Durable
fix: `next typegen` in the `typecheck` script (BL-007).

#### 3.11 Verify claims against the build, not just the graph

Lint checks imports one at a time. When it matters, check the production bundle: `grep -l <distinctive-string> .next/static/chunks/*.js`, then find which route loads that
chunk in `.next/server/app/**/page_client-reference-manifest.js`. That is how the Supabase SDK in
`/admin`'s chunk was confirmed (`GoTrueClient`), with server-only strings as a negative control, and
how S5 confirmed a same-length image URL change actually shipped.

#### 3.12 A barrel imported by a server component ships every client component it re-exports

Measured in restructure 1, slice 5: `apps/web/src/app/layout.tsx` importing `BreakingNewsBanner` from the admin
feature's barrel put all five admin dashboard components on **every** route (+46 KB on `/`).
`"use client"` on the barrel does not help — the module count drops but the bytes stay. What fixes
it was a `package.json` of `{ "sideEffects": false }` in each feature folder (`bae6f8a`; restructure
2 measured +457 to +84,579 bytes per route without it). **Restructure 4 removed the barrels
instead**: every component is imported from its own file, and client JS fell 900 bytes. **Do not add
an `index.ts` that re-exports client components**; if one is ever needed, it needs that
`package.json` back.

#### 3.13 `sed -i` silently converts CRLF files to LF

Git Bash's `sed -i` rewrites the line endings of every file it touches. The index is LF
(`core.autocrlf=true`), so commits are unaffected, but the working copy drifts. Rewrite with a Node
script that detects and restores `\r\n`, and check with `git ls-files --eol <file>`.

#### 3.14 Path-keyed lists go stale silently on a move

A policy list that tolerates a stale path reports success while checking nothing. The scripts this
was written about (`generate-codemap.mjs`, `move-map.mjs`) were deleted in restructure 4. What is
left that walks paths: the route walk in `apps/admin/src/app/api/admin/access.test.ts` (it reads
`apps/admin/src/app/api/admin/**/route.ts` and fails on a route the policy does not name).

#### 3.15 Directory renames fail on Windows while the editor watches them

`git mv src/app app` failed with "Permission denied": VS Code's TypeScript server holds watch
handles on the directories. Restructure 2 moved files one by one instead (`git mv` per file, with
`GIT_LITERAL_PATHSPECS=1` for paths like `[slug]`), then removed the empty folders. Do not kill
editor processes to get around it (owner instruction).

#### 3.16 Tailwind v4 scans every file that is not git-ignored

Class detection is automatic and reads Markdown and comments too. A word in a document once removed
a CSS rule when the document was deleted (BL-018). `apps/web/src/app/globals.css` now excludes
`docs/`, `scripts/`, `database/` and the root `.md` files with `@source not`, with paths relative to
the stylesheet. Code comments and tests are still scanned: `.transform` is in the CSS only because
`jest.config.ts` comments say "transform".

#### 3.17 Turbopack's chunk bytes move when module ids do

Module ids derive from paths, so a pure move changes chunk bytes with no code change. Restructure 2
compared a **normalised** JS size per route (digits, hashes, chunk names and UUIDs neutralised) to
tell that noise from real growth. In S3 the normalised size moved only where the code really
changed; the one growth kept was the X1 entry point on `/` (109 bytes at slice 9, 50 by the end of
S3; ADR 0002).

#### 3.18 `next start` reads the env file, so a local run uses the real Supabase

Next loads the env file itself (`.env.local` until 2026-11-04; the root `.env` since, §3.25). A local `next start` therefore runs the app's normal flow against
the configured project: a stale table triggers a NewsData fetch and an upsert. (Before F-015, the
feed's read path also purged old rows.) In audit Phase 4, `next start` was run only to read static
HTML (`/about`, and an `/article/...` URL without `?url=`), on port 3123, so the article page's
suggestions fetch to `localhost:3000` failed and wrote nothing. The S3 smoke tests did exactly that (reported to the owner). Nothing
in this repo writes to the database by hand: SQL changes are files in `database/` that the owner
applies.

#### 3.19 `TaskStop` leaves `next start` running on Windows

Stopping a background `npx next start` with `TaskStop` kills `npx`, not its `node` child, which keeps
the port. The next `next start` then fails with `EADDRINUSE`, and `curl` silently answers from the
**old** build. Before trusting a page, list them with
`Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ? CommandLine -match 'next.*start'` and
stop the leftovers with `Stop-Process`.

#### 3.20 PowerShell's `$env:X = ""` deletes X, so Next fills it from `.env.local`

Next's env loader fills only keys that are `undefined` in the process (`@next/env`, `processEnv`). A
Panel 0 smoke test set every key the code reads to `""` in PowerShell to keep `.env.local` out.
On Windows that **removes** the variable, so Next loaded the real `NEWSDATA_API_KEY` and the feed
made one real NewsData.io request. Nothing was written: Supabase pointed at a local stand-in, and
Upstash was not configured. To run the app without `.env.local`'s values, spawn it from Node with an
explicit `env` object, where an empty string survives as "set".

#### 3.21 Windows PowerShell 5.1 reads UTF-8 files as ANSI, and writes a BOM

`Get-Content -Raw` without `-Encoding` decodes a BOM-less UTF-8 file as Windows-1252, so writing it
back turns `§` into `Â§` (it happened to a test file in Panel 0, repaired before commit).
`Set-Content -Encoding utf8` and `Out-File` add a BOM, which once reached a commit subject (amended
before push). Read and write text with Node, or the Write and Edit tools. Check a commit message's
first bytes with `git cat-file -p`, not through a PowerShell pipe, which adds its own BOM. The
Write tool keeps the encoding of a file it overwrites: in R1 a message file that `Set-Content` had
once written kept its BOM through every later Write (amended before push). Write each message to a
new file, or with `[IO.File]::WriteAllText` and `UTF8Encoding($false)`.

#### 3.22 Tailwind reads test files too

§3.16 again: a test id `"row-1"` produced a `.row-1` rule (grid-row) in the shipped CSS. Choose
ids that are not utility class names.

#### 3.23 The env-var test sees only tracked files

`check:boundaries` (removed in restructure 4) read `git ls-files`, and so does
`packages/shared/src/config/envExample.test.ts`. A gate run before a new file is added cannot see it. Register new
files with `git add -N <file>` before the gate.

#### 3.24 A lint zone silently passes an import it cannot resolve

Found on `main` during its four-folder restructure (restructure 3 there; gotcha 3.21 in its
OPERATIONS.md): `import/no-restricted-paths` judges the resolved path, and skips an import whose
path does not resolve, without a message. When `main`'s tsconfig moved into `frontend/`,
eslint-config-next's TypeScript resolver (which looks for `tsconfig.json` in the working directory)
stopped resolving `@/` imports, and every boundary zone let every aliased import through, from
`93627ad` to `63bd34b`. Lint still reported 0 errors; only probes showed it. Here,
`eslint.config.mjs` gives the resolver every app's and package's tsconfig (`project`). Probed on
2026-11-04: in `apps/web/src/components`, `import x from "@/app/layout"` and an import of
`@timesprime/server/lib/rateLimit` both fail. After any change to a tsconfig's place or its `paths`,
probe at least one zone with an aliased import before trusting lint.

#### 3.25 Next loads env files from the app's folder, and caches them

Each app's `next.config.ts` loads the root `.env` files with `loadEnvConfig` from `@next/env`. Next
has already called it for the app's own folder before it evaluates the config, and `@next/env`
returns that cached result to any later call unless `forceReload` (the fourth argument) is set.
Without it, from the split until 2026-11-04, no app read the root env file in dev, build, start or
jest, and nothing reported it: the apps fell back to mock articles and the in-memory cache. Probed
with a fake `.env` in a scratch folder. `envExample.test.ts` now proves the root `.env.test` reaches
the tests, which only happens through that call.

#### 3.26 With the shared cache handler, a prerendered page renders again on its first request

The reader site's `cacheHandler` (`apps/web/cache-handler.mjs`, R1-02) is never asked for the
build's prerendered files (bundled docs: next-config-js/incrementalCacheHandlerPath.md), so `/about`,
`robots.txt` and the rest render once more, at run time, on their first request after a deploy.
Anything such a page reads from a plain environment variable set only for the build is gone by
then: the first R1-09 build sent staging's noindex header (fixed at build) but served
`Allow: /` from `robots.txt`. A value a page needs both at build and at run time is a
`NEXT_PUBLIC_` variable, which Next inlines, or is set in the task definition too.

#### 3.27 The root `error.tsx` and `not-found.tsx` load on every page, with their own copies

Every page route loads the root error and not-found components, and Turbopack gives each one's
chunk its own copy of what it imports, even when the page's chunk has it already. In R1-07,
`next/link` in the message component added 9 KB per copy, and `@sentry/nextjs` 12 KB a route (as
a dynamic `import()`, 20 KB). The boundaries report through `clientErrorReport.ts` instead, and
link with a plain `<a>`. Since BL-039, `not-found.tsx` is a server component, so it has no client
chunk at all, and the message picks its language with CSS (`.tp-lang-en`, `.tp-lang-hi` and
`<html lang>`), not the language context. Before a root special file imports anything, compare
`node scripts/check-js-budget.mjs --print` before and after.

#### 3.28 Tailwind turns words in comments into CSS

§3.16 and §3.22 again, for comments under `apps/` and `packages/`: in R1, "container" in a
config comment added 287 bytes of admin CSS, and "grow" 18 bytes of reader CSS. Before a commit,
check that the CSS bytes per app did not move. `table`, `inline`, `static`, `block`, `hidden` and
`contents` are utility names too.

#### 3.29 A `route.ts` may export only the route's own names

Next type-checks a route file's exports (`GET`, `POST`, `config` and the like). A helper constant
there, such as R1-05's rate-limit rules, stays unexported; a test reaches it through the route's
behaviour.

#### 3.30 `next.config.ts` imports packages, never a relative path into `src/`

Next's config loader, and next/jest's load of the same file, resolve a relative import from the
working directory, not the config file (§2 of ARCHITECTURE.md). `import "./src/..."` failed under
Jest with "Cannot find module"; R1-04's prefix lives in `@timesprime/shared/config/adminAssets`.

#### 3.31 An error boundary named `Error` shadows the global

The bundled docs' example names its `error.tsx` component `Error`. Inside it that name is the
function itself, so `error instanceof Error` is always false: R1-07's digest never showed until
the test caught it. The boundaries are named `RouteError`.

#### 3.32 Images built from a Windows checkout carry CRLF, and bash on the server fails on it

With `core.autocrlf` on, git checks text files out with CRLF on Windows. The worker image copies
`deploy/` from that checkout, so a script inside it would stop on the server with
"`$'\r': command not found`". `.gitattributes` keeps `deploy/**`, `*.sh` and the `Dockerfile` LF
in every checkout, and `scripts/deploy.test.ts` fails on a kit file holding a carriage return.
After adding such a rule, `git add --renormalize` the files it covers.

#### 3.33 A stale `*.tsbuildinfo` reports errors the code no longer has

`tsconfig.base.json` sets `incremental`. After a test file became a module (an `export {}` that
stopped its names colliding with another script-style test's), `tsc -p packages/server` still
reported the old "cannot redeclare" errors; `--incremental false` reported none. Delete the
package's `tsconfig.tsbuildinfo` (git-ignored, regenerated). CI starts clean and never sees it.

#### 3.34 `notFound()` after streaming has started answers 200, with noindex

Before BL-042 the root `loading.tsx` streamed every page, so the article page's `notFound()` for an
unknown link arrived after the status was sent: the not-found page rendered with status 200, and Next added
`<meta name="robots" content="noindex">` (bundled docs: functions/not-found.md, "Calling
`notFound()` after streaming has started"). A real 404 needs the check before the body streams.
Since BL-042 the root loading file lives in the `(feed)` route group, so the article and section
routes have none above them and answer a real 404. A page that must 404 stays outside that group.

#### 3.35 Docker on Windows needs `C:/...`, not Git Bash's `/c/...`

A path from Git Bash's `$PWD` (`/c/Users/...`) given to Docker Desktop, in a compose `env_file`
for instance, is read as relative to the compose file. `pwd -W` gives `C:/Users/...`
(`deploy/scripts/run-local.sh` uses it, and falls back to `pwd` on Linux and macOS).

#### 3.36 `next build` stops on a Next.js version with a published advisory

`next build` checks npm's advisory list (first seen 17 Nov 2026) and fails with `SecurityFatalError` when
the installed `next` is affected, even if the code never uses the affected feature. Then `npm run
verify` and CI fail on every branch until `next` (and `eslint-config-next`, kept at the same
version) moves to the fixed release, on a `fix/` branch through a PR. `npm audit` names the advisory
and the fixed version. The error text also suggests an upgrade command; the session does not run
it, since a dependency change needs approval. 16.4.3 → 16.4.6 for GHSA-mfr8-8qww-v76h was the first.
The build also fetches its Google fonts: "Failed to fetch ... from Google Fonts" is the network,
and a retry passes.

#### 3.37 Tiptap's `setEditable` sends an update event

`editor.setEditable(value)` emits `update` unless its second argument is `false`, so an `onUpdate`
that marks the story as changed fires with nothing edited. The Desk's story screen showed "Unsaved
changes" on every story until 17 Nov 2026; it now calls `setEditable(value, false)`. `setContent`
emits `update` by default too, which is wanted when a revision is brought back into the editor.

### 4. Commits — restructure 2, then audit Phases 2–5

`f260d3e` closed audit Phase 1. Everything after it is restructure 2. Restructure 1 and Phase 1 are
in `git log` before it, with their reasoning in ADR 0001 and the audit ledger.

| Stage | Commits | What it did |
|---|---|---|
| **S0** design | `b0c471b` | Move map v2 (95 files, 11 slices) and its checker, run against the rules before anything moved |
| **S1** cleanup | `26adbbd`..`8881bd1`, then `dbc4821`, `6327110`, `c2ab97a` | Deletions only, one category per commit. Two stale docs, five unused SVGs, an unused script, three unused exports, 24 dead translation keys, two unused colour fields (16 CSS rules), four unused dependencies |
| **S2** tooling | `6a1382d`..`381805f` | Tailwind stops scanning docs (BL-018); `@/frontend`, `@/backend`, `@/shared` aliases; layout-independent coverage, secret scan and CODEMAP; the per-slice checklist |
| **S3** moves | `b0fe915`..`2b9cb94` | 11 slices (slice 7 in six commits), pure moves. Plus `4460a40` (the news barrel stops exporting views), `ecdd8ea` (ADR 0002 draft), `bae6f8a` (`sideEffects: false`) |
| **S4** enforcement | `705b32e`..`5f6b0cc` | `@/*` removed; shims excluded from coverage by name; `import "server-only"` on all 32 backend modules (proved by a failing build); R5 restored; A1 and V1 added; lint rewritten for F1–X1 and V1, each rule proved by a probe (46 in all); BL-019 and BL-020 logged |
| **S5** docs | `c3c4387`..this file | BL-020 fixed (`c3c4387`); CONTRIBUTING's "Where does new code go?"; architecture, both ADRs, CODEMAP (and its generator's prose), README "Project structure", AUDIT-FINDINGS, PRD, backlog, this file |

Every commit passed `npm run verify`. Every commit that touched `src/app/` or deleted anything was
diffed against the route table, and every one matched it. CI was green at each push.

**Audit Phases 2–5** (after `f1d268c`). One finding per commit, each prefixed with its ID; tests first
for security code, and characterization tests first for untested UI and route logic.

| Phase | Commits | What it did |
|---|---|---|
| **2** security | `487eb47`..`25d1c7f` | F-003 (redirects revalidated, connections pinned), F-010 (size caps), F-020 and BL-013 (eviction), F-004 (login limit, digest compare), F-011 (scraper limit), F-005 (stored-article trust anchor), F-006 (search escaping), F-015 (purge off the read path) |
| **2** follow-up | `3d8b5ed`..`fcdf1db` | BL-016: the article page calls the scraper directly, which fixes BL-021; the public scraper takes only stored articles; Retry-After on chat and translate |
| **3** data layer | `db28a46`..`9e5c5ad` | F-008 (DDL and policies as files), F-018 (index migration), F-016 (feed fills to 40), the owner runbook with its rollback, the `#`-link tests |
| **4** honest failure, UX | `e582d2d`..`ecc4a31` | Admin search escaping, F-013, F-014, F-017, F-021, F-024, F-022, F-009, F-027, F-028 |
| **5** close-out | `96f192d`..this file | BL-027 (the first search result), BL-029 (no public-prefixed key), the ledger, PRD, CODEMAP, this file |

Every commit passed `npm run verify` and reported client JS and CSS. No route changed.

**Panel 0, the access foundation** (design approved with conditions; [`PANEL_DOCS.md`](PANEL_DOCS.md)).
Tests first for authorization code; characterization first for untested UI and the proxy.

| Part | Commits | What it did |
|---|---|---|
| Step 1, workflow | `862cf41`..`5f8b835` | PANEL_PLAN.md (from the owner's PDF), PANEL_DOCS.md, CLAUDE.md's panel section, README, this file |
| Step 2, design | `e9bce19`, `6bcfb4e` | BL-033; the design and ADR 0003 |
| First half, on `main` | `38ac276`..`f357d71` | The approval; BL-034; supabase-js 2.116.0; the access SQL; `decide` and `scope`; the shared password's end date; `requirePermission` with `@supabase/ssr` 0.12.7; every admin route wired, one per commit; the route walk; the cron as `system:cron`; `logAdminAction` deleted |
| Warning on `main` | `c35637f` | `main` is not deployable until the migrations are applied |
| Second half, branch `panel-0-access` | `d1bff91`..`e7bb6a8` | The bulk limit test; the proxy (characterized, then both sessions); `/me` and `/mfa`; staff sign-in and sign-out; the activity log read-only; the dashboard by `/me`; the sign-in page with MFA; CODEMAP; the runbooks; architecture; PANEL_DOCS; this file |
| Decisions and the local database, `panel-0-access` | `1462892`..`4de377c`, `d587e56` | The branch rule, no deployment until the end, the definition of done 7–13; the dev dependencies; the local database setup |
| The local database dropped, `panel-0-access` | `67359e6`, `ca21217` | `d587e56` reverted; `supabase` and `pg` removed |
| Paused for `release/v1`, `panel-0-access` | `1a215a0`, then this file | Read-only browser tests, Sentry captures, states and labels, the JS budget, the sign-in runbook (WIP); HANDOFF and PANEL_DOCS |

Every commit passed `npm run verify` before it was made, except `ebb7049`, whose tree failed
`check:boundaries` (§3.23). It was reverted, not patched. Six second-half commit messages state the
suite count one too high (`d8bf37a` 45, `523cc51` 46, `ced5f2a` and `e5c6914` 47, `4b809f5` and
`06da24b` 48; the logs say 44, 45, 46, 46, 47, 47). Their test counts are right. They were pushed,
so they are not rewritten. Client JS and CSS were reported per commit. The two admin pages grew,
with the causes recorded in their commits (§2).

**Retired:** `docs/TimesPrime-PRD-and-Architecture.pdf` was committed in `ddbcc9f`, then untracked
and git-ignored at the owner's direction. Do not consult the PDF if a copy exists on disk. The PRD
(`docs/PRD.md`) and the owner's `PANEL_PLAN.md` were retired on 4 Nov 2026 for `NEWSROOM_PLAN.md`
and the access rules (`PANEL_DOCS.md`); both are in git history.

### 5. Architecture

The flows (ingest, serve, authorise), the layout, the rules and each folder's responsibilities are
in [`ARCHITECTURE.md`](ARCHITECTURE.md#architecture). The tree, in short:

```
apps/web/        the reader site: src/app (pages, public APIs) · src/components · src/context · src/lib
apps/admin/      the back office: src/proxy.ts · src/app/admin · src/app/api/admin · src/components
apps/worker/     scheduled jobs: src/jobs.ts (refresh-news, publish-scheduled)
packages/server/ auth/ · repositories/ · services/{news,scrape,translate,classify,health} · lib/
packages/shared/ config/ · types/ · lib/      what both apps import
packages/ui/     ThemeContext · StoryArticle and story.css (a Desk story's view, both apps)
database/        schema.sql · policies.sql · migrations/ · bootstrap/ · seed/
```

**Authorisation, since Panel 0:** `apps/admin/src/proxy.ts` (matcher `/admin/*`, `/api/admin/*`) only checks that a
session exists. Every admin route body calls `requirePermission`, the **only** gate on the data,
because the app reads Supabase as `service_role` and bypasses RLS. A route outside the matcher is
still public, and an admin route without a rule fails the route walk (`access.test.ts`).
[`ARCHITECTURE.md`](ARCHITECTURE.md#architecture) §1 has the flow.

#### Files over 500 lines

| File | LOC | Statements covered |
|---|--:|--:|
| `apps/web/src/components/article/ArticleDetailView.tsx` | 970 | tested (F-005, F-013, F-017) |
| `apps/admin/src/components/ArticlesTable.tsx` | 751 | 0% |
| `packages/server/src/repositories/db.ts` | 678 | 71.8% |
| `packages/server/src/services/scrape/scrapeArticle.ts` | 580 | 87.1% |
| `apps/web/src/components/news/Header.tsx` | 568 | stubbed in tests |
| `apps/web/src/components/home/HomeClient.tsx` | 561 | tested (F-021, BL-027) |
| `apps/admin/src/app/admin/page.tsx` | 521 | tested (F-014) |

Per-file coverage: `npm run test:ci`, then `coverage/lcov-report/index.html`.

### 6. Structural work — where it stands

| Work | Status |
|---|---|
| Restructure 1: Phases 0, 1, A, C, D, E | ✅ Done (ADR 0001, superseded) |
| Restructure 2: S0 design, S1 cleanup, S2 tooling, S3 moves, S4 enforcement, S5 docs | ✅ Done (ADR 0002, superseded) |
| Restructure 4: the standard `src/` layout, cleanup of the restructure-2 tooling, ngrok and CORS | On `chore/restructure`, awaiting the owner (ADR 0005, proposed). Moved the feed's read path into `packages/server/src/services/news/topHeadlines.ts` |
| **Phase F** — decompose the oversized files; move route-body logic into services | Optional, not started; needs an owner decision |

#### Phase F candidates

Decomposing any of the files above edits a module body, so each needs a characterization test of
what it splits. The audit phases added most of them: `ArticleDetailView` (links, the AI panel, the
story area), `HomeClient` (the feed's fetches and search), `AdminView` (sync and purge),
`scrapeArticle` and `db.ts` (through their route and repository tests). Still untested:
`ArticlesTable.tsx`, whose two modals already sit at module scope and can move to their own files as
a pure move, and `Header.tsx`.

### 7. Known defects — current behaviour that is NOT intended

Numbered to match the retired PRD's §11 (in git history). Of DEF-01..25, all but six
are resolved:

| ID | What remains | Status |
|---|---|---|
| DEF-01 | Supabase reachable again and no longer silent; `/api/health` 200 and a Sentry fallback event in production | Pending verification (F-002) |
| DEF-07 | `breaking_news` and `admin_logs` DDL in `database/schema.sql`; the owner applies it | Pending verification (F-008) |
| DEF-12 | Search escaping fixed; the injection probe against the live database | Pending verification (F-006) |
| DEF-18 | The index migration; the owner applies it | Pending verification (F-018) |
| DEF-23 | The production runtime's Node version (AWS, at deployment) | Pending verification (F-026) |
| DEF-25 | `dark:` classes right before paint; 75 `isDark` ternaries still switch after hydration | Partial (F-028, BL-028) |

**`npm audit`:** 0 critical, 0 high. 34 moderate in dev and build tooling, published after Phase 1 (BL-031), and the 3 accepted jest lows.

### 8. Backlog summary

**Open:**
- BL-001 (`any` in `db.ts`'s row mapping), BL-002 (two `set-state-in-effect` warnings). Both need
  logic changes behind tests (Phase F).
- BL-004 (editorial publishing hardcodes `country: ["us"]`) and BL-006 (stored paraphrased titles,
  self-heals). BL-005, real contact and newsletter backends, is future feature work.
- BL-007 (`next typegen` in `typecheck`, a one-line change) and BL-009 (two cosmetic leftovers).
- BL-008 (privacy policy: the untrue lines are gone; the legal review remains).
- BL-016's remainder (the suggestions fetch is still HTTP; no per-IP limit on its route).
- BL-023 (signed links, only if needed), BL-024 (nullable columns, deployment phase), BL-025 (the
  anon-key fallback).
- BL-028 (theme ternaries), BL-031 (the new moderate advisories), BL-032 (A2 for new pages).
- BL-033 (the 7-day purge against Rule 19's 60 days; Panel 4 or 7), BL-034 (export the audit chain's
  head hash outside the database).
- From the release (16 Nov 2026): BL-041 (Supabase's log drain, before the full launch), BL-042 (a
  real 404 for unknown article links, with R2's article URLs), BL-043 (remove `axios` and
  `cheerio`, needs the owner), BL-046 (rename the `supabase->newsdata` report). BL-039, BL-044
  and BL-045 were fixed on `fix/r2-reader-bugs` (17 Nov 2026); BL-044 leaves a look at the stored
  rows.

**Resolved:** BL-003, BL-010, BL-011, BL-012, BL-013, BL-014, BL-015, BL-017, BL-018, BL-020, BL-021,
BL-027, BL-029, BL-038 (R1-05), BL-040 (E-07). Phase B (16 Nov 2026) resolved BL-019 (no remote image
is fetched any more), BL-022 (the scraper is gone), BL-030 (the chat loads only when it is on) and
closed BL-026 (no machine translation; Hindi stories come from the Hindi feed).

### 12. Quick reference

#### Useful probes

```bash
# which tier answered
curl -s -D - -o /dev/null "http://localhost:3000/api/news/top-headlines?refresh=true" | grep -i x-data-source

# real runtime errors
tail -40 .next/dev/logs/next-development.log

# route table drift: compare the "Route (app)" block of `next build` output before and after
# (f/o + path), not a file list
git ls-files 'apps/*/src/app/**/page.tsx' 'apps/*/src/app/**/route.ts' | sort

# the boundary rules
npm run lint

# confirm framework behaviour instead of guessing
node -e "const pm=require('next/dist/compiled/picomatch'); console.log(pm.makeRe('{,*.}newsdata.io').test('i.newsdata.io'))"
```

#### Data model

`database/schema.sql` defines all three tables, `IF NOT EXISTS`, with RLS enabled:
- `articles`: 15 columns, `article_id` unique, `category`/`country`/`category_mismatches` are `TEXT[]`.
  Only `id`, `article_id`, `title` and `created_at` are NOT NULL (the root of BL-001).
- `breaking_news` and `admin_logs`, committed in `db28a46` (F-008); their nullable columns are BL-024.

Panel 0's six access tables (`staff_profiles`, `roles`, `permissions`, `role_permissions`,
`role_assignments`, `audit_log`) are in `database/migrations/2026-11-02-access-1-foundation.sql`, the
catalogue in `-2-catalog.sql`, generated from the plan's matrix by `scripts/generate-access-catalog.mjs`.

Policies and grants are in `database/policies.sql`. Indexes: `created_at` and `article_id` in the
schema; GIN on `category`/`country`, trigram on `title`/`description`, and `link` in
`database/migrations/2026-11-02-indexes.sql`. None of it is applied by the app: the owner applies it
(§11).

#### Test suite

47 files, 736 tests, all passing. Panel 0: `access.test.ts` is the route walk and the access matrix
(every admin route and method, through the real gate, for every kind of caller), with `decide`,
`requirePermission`, the session, the proxy, sign-in, `/me`, `/mfa`, the catalogue against the matrix,
and the access SQL's guarantees. Every security module has tests: `urlValidation` (73),
`fetchPage` (real axios against a local server), `adminSession`, the login and scrape routes, the
rate limiter (memory and Redis), the size-capped body reader, and the search escaping. Repo-reading
tests keep the SQL in step with the code (`packages/server/src/repositories/schema.test.ts`, including the
runbook's rollback), and `.env.local.example` in step with `process.env`
(`packages/shared/src/config/envExample.test.ts`). Untested: `ArticlesTable.tsx` and `Header.tsx`.

## Backlog

Debt deliberately deferred rather than fixed in place, with the reason it was
deferred and the phase that should pick it up. Added to when a rule in the
restructure plan ("no while-I-am-here fixes") stops a fix from happening in the
commit that found it.

---

### BL-001 — `db.ts` row mapping relies on `any` to hide unhandled nulls

**Found:** Phase 0b (lint baseline)
**Files:** `packages/server/src/repositories/db.ts` — the two `.map()` calls in `saveArticlesToDB` and `getDBArticles`
**Status:** Open · two `eslint-disable-next-line @typescript-eslint/no-explicit-any` in place

`database/schema.sql` declares `link`, `pub_date`, `description`, `content`,
`image_url`, `source_id`, `source_name`, `category`, `country` and `language` as
nullable. `Article` (in `packages/shared/src/types/index.ts`) declares `link: string` and
`pubDate: string` as required.

The accurate row type (`ArticleRow`, now defined in `db.ts` and checked against
the schema) is therefore *not* assignable to `Article` at those two mapping
sites. The pre-existing `(row: any)` annotation was the only thing letting it
compile. Typing the rows honestly surfaces the gap rather than creating it.

Three of the five `any` annotations in this file **were** replaced with
`ArticleRow` — the two `.filter()` predicates and the `classifyCategoryRelevance`
projection, none of which produce an `Article`.

**Why not fixed now:** the fix is a logic change (null coalescing at the mapping
sites, or widening `Article.link` / `Article.pubDate` to accept null), and the
commit that found it was scoped to type annotations only. `db.ts` has no test
coverage, so the change cannot currently be proven equivalent.

**Pick up in:** Phase 6, when `db.ts` is split. Write a characterization test
over the mapping first, then decide whether a null `link` should become `"#"`
(as `saveArticlesToDB` already does on write) or whether `Article` should admit
null.

---

### BL-002 — `react-hooks/set-state-in-effect` downgraded to a warning

**Found:** Phase 0b (lint baseline)
**Files:** `apps/web/src/app/saved/page.tsx:21`, `apps/web/src/components/news/ArticleCard.tsx:83` (the two warnings `npm run lint` reports)
**Status:** Open · rule set to `"warn"` in `eslint.config.mjs`

Both call `setState` synchronously inside an effect body. Satisfying the rule
means converting them to derived state computed during render.

**Why not fixed now:** that conversion changes *when* the state settles relative
to paint. Both files have zero test coverage, so a render-timing change cannot
be verified as equivalent, and the restructure plan forbids behavior changes
outside the phase that owns them.

**Pick up in:** Phase 6. Write a characterization test (initial render output,
then output after the effect flushes) before converting either component. Restore
the rule to `"error"` in the same commit that fixes the last violation.

---

### BL-003 — Jest coverage previously measured 6.8% of the codebase

**Found:** Phase 0 (baseline)
**Files:** `jest.config.ts`
**Status:** Resolved in Phase 0c — `collectCoverageFrom` added

Before Phase 0c, `collectCoverageFrom` was unset, so coverage instrumented only
the five modules the four test suites import. The reported 91.42% described
5 of 73 source files. The number is now measured against the whole source tree (since restructure 2,
less the one-line `src/app/` shims) and is correspondingly, accurately, much lower.

Kept here as the reason the coverage number dropped sharply in one commit
without any test being deleted.

Note: coverage then fell again, 4.41% → 3.50%, in `3805007`. That was not a
test regression either: the deleted paraphraser was one of the few well-covered
modules (98.3%), so removing it took covered statements out of the numerator.

It has since crept back up, 3.50% → 3.63%, with **no test added**. Measured per commit (`jest
--coverage`, statements):

| Commit | Change | Coverage | Covered / total |
|---|---|--:|--:|
| `3805007` | paraphraser deleted | 3.50% | 428 / 12,201 |
| `bcd5393` | RSS ingestion deleted | 3.58% | 428 / 11,937 |
| `59b875d` | contact and newsletter forms deleted | 3.63% | 428 / 11,772 |
| `b01d528` | SC-1 split | 3.63% | 428 / 11,760 |
| `d3ba8fa` | footer RSS link deleted | 3.64% | 428 / 11,756 |
| `9f3b76f` | after slices 1–2 (the chat barrel adds 3 uncovered statements) | 3.63% | 428 / 11,759 |
| `73e207f` | after Phase D (the admin and news barrels add 36 more) | 3.62% | 428 / 11,795 |

The covered count is 428 at every step; only the denominator moved. A rising coverage number is
not, by itself, evidence of progress — check the covered count.

---

### BL-004 — Editorial publishing hardcodes `country: ["us"]` and bypasses the filters

**Found:** Phase A review · **Owner decision (Q3):** keep the feature, fix later
**Files:** `apps/admin/src/app/api/admin/publish-article/route.ts`
**Status:** Open · **do not fix during the restructure**

Editorial publishing stays, and moves with the admin feature like any other
file. Two behaviours are logged rather than changed:

- Every published article is stored with `country: ["us"]`, regardless of what
  it is about. An India story published by an editor is therefore tagged
  United States.
- The route upserts straight into `articles`, skipping `saveArticlesToDB` and so
  every filter in the pipeline (paywall, horoscope, wire-spam, script). This is
  deliberate in the code — an editor's insert must not fail silently — but it
  means editorial content is the one path with no filtering at all.

**Pick up in:** after Phase D, as feature work. Needs a product call on whether
the editor chooses the country, and whether editorial content should pass the
script filter.

---

### BL-005 — Real contact and newsletter backends

**Found:** Phase A review · **Owner decision (Q4):** remove both UIs now
**Status:** Future feature work · UIs removed in `59b875d`

The contact form and both newsletter forms (footer strip and article sidebar)
were removed because each reported success while sending nothing — there was no
endpoint behind any of them (DEF-09).

If either returns, it returns with a real backend first: somewhere a message or
address is actually stored or delivered, and a UI that reports failure honestly.
Not before. The `/contact` page remains, listing the email addresses.

---

### BL-006 — Stored rows still carry paraphrased titles

**Found:** `3805007` (paraphraser removal) · **Status:** Open · self-heals

Headlines are now shown as the source published them. Rows written to Supabase
before `3805007` hold paraphrased titles. `upsert` on `article_id` overwrites a
title when the same article is fetched again; a row that is never re-fetched
keeps its paraphrased title until the 7-day purge removes it.

Until then, `dedupeArticlesByTitle` compares titles, so a stored paraphrased
title and its raw upstream twin will not be recognised as the same story — a
possible transient duplicate in the feed.

**Currently moot:** Supabase is unreachable (DEF-01), so no stored rows are read.
**Pick up:** only if duplicates are observed after the connection is restored.
Waiting seven days resolves it with no code change.

---

### BL-007 — The verify gate fails on stale route types after a route moves

**Found:** `bcd5393` (RSS removal) · **Status:** Open · **affects any change that
moves or deletes a route file**

`tsconfig.json` includes `.next/types/**/*.ts`, which `next build` generates.
`npm run verify` runs `typecheck` **before** `build`. So after a route file is
moved or deleted, `tsc` reads the previous build's validator, which still
imports the old path, and fails:

```
.next/types/validator.ts(242,39): error TS2307: Cannot find module
'../../src/app/api/cron/refresh-rss/route.js'
```

The source is fine. Clearing `.next/types` and re-running turns the gate green
with no source change. CI is unaffected (a fresh checkout has no `.next/`), but
every local change that moves or deletes a route under `src/app/` will hit it. Every restructure-2 slice
that touched `src/app/` did, and cleared `.next/types` first.

**Workaround until fixed:** `rm -rf .next/types` before `npm run verify` on any
slice that moves or deletes a route file.

**Fix:** Next 16 ships `next typegen`, which "generates TypeScript definitions
for your application's routes without performing a full build" — its own docs
name CI type-checking as the use case
(`node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md`).
Changing `typecheck` to `next typegen && tsc --noEmit` regenerates the types
from the current routes before checking them. A one-line config change; not
made here because it was outside the item that found it.

---

### BL-008 — Privacy policy describes data collection that no longer happens

**Found:** `59b875d` (form removal) · **Status:** Partly fixed (R3, 17 Nov 2026) · **the legal
review is the owner's or legal counsel's**
**Files:** `apps/web/src/app/privacy/page.tsx`

**R3 (owner, 17 Nov 2026):** the lines below, and the "synced account" and "personalize your news
feed" ones, were removed, and the Grievance Officer section added
(`apps/web/src/app/contactDetails.test.tsx` keeps them out). A legal review of the whole policy and
the terms is still open.

The policy still says email addresses are collected "when you subscribe to our
newsletter or submit the contact form", that updates are sent "if you've opted
in to our newsletter", and that readers can "unsubscribe from newsletter
emails". None of those forms exist any more.

A privacy policy that describes collection the product does not perform is
inaccurate in a document with legal weight. The correct wording is the owner's
or legal counsel's to choose, so it was deliberately not edited alongside the
UI removal.

---

### BL-009 — Residual references to removed features

**Found:** `bcd5393`, `59b875d` · **Status:** Open · cosmetic, low risk

Each was left alone because it was not required by the item that removed the
feature:

- ~~**Footer "RSS Feeds" link**~~ — **resolved**: the link and its separator were
  removed from `apps/web/src/components/Footer.tsx` at the owner's direction (Phase C
  review). It had pointed at `href="#"` and advertised a deleted feature.
- ~~**Dead translation keys**~~ — **resolved** in `a81d3c4` (restructure 2, S1, owner item
  B8): the six listed here (`rssFeeds`, `newsletterTitle`, `newsletterDesc`,
  `newsletterStripTagline`, `subscribedSuccess`, `newsletterEmailPlaceholder`)
  plus `subscribe`, which this list missed, removed from the interface and both
  languages. Sixteen more unread keys are BL-017.
- **`"use client"` on the contact page (`apps/web/src/app/contact/page.tsx`)** — no longer needed now the
  form's state is gone. Removing it changes the page's rendering mode, which is
  a behaviour change, not a cleanup.

**Pick up:** any time, as one small commit. Nothing left in this entry is
visible to a user. `rssFeeds` is now dead too — the link was its only reader.

---

### BL-010 — ESLint lints the generated `coverage/` directory

**Found:** Phase A review, reading the unabridged `npm run verify` log ·
**Status:** **Resolved** (Phase C review) — `"coverage/**"` added to `globalIgnores`.
With `coverage/` present on disk, lint now reports 14 warnings, all in source.

`eslint.config.mjs` ignores `.next/`, `out/`, `build/` and `next-env.d.ts`, but
not `coverage/`. After `npm run test:ci`, ESLint lints Istanbul's generated
report and emits:

```
C:\Users\DELL\TimesPrime\coverage\lcov-report\block-navigation.js
  1:1  warning  Unused eslint-disable directive (no problems were reported)
```

So the "15 warnings" reported throughout the restructure are **14 in source
plus 1 in a generated file**, and the total depends on whether `coverage/`
exists. CI runs Lint before Test, so CI sees 14 while a local run after
`test:ci` sees 15. Every filtered view of the lint output hid this; only the
full log shows the path.

**Fix:** add `"coverage/**"` to `globalIgnores` in `eslint.config.mjs`. One
line; not made here because it was outside the item that found it.

### BL-011 — `withSentryConfig` is imported from a deprecated path

**Found:** audit fix F-007, bumping @sentry/nextjs to 10.78.0 (`31f4a54`) · **Status:** **Resolved**
in `7e578e0` — imported from `@sentry/nextjs/config`; the warning no longer appears

Every build and test run now prints: *"Importing `withSentryConfig` from `@sentry/nextjs` is
deprecated and will stop working in v11. Import it from `@sentry/nextjs/config` instead."* The fix
is one line in `next.config.ts`. Not made in `31f4a54` because it was outside that finding; it
becomes mandatory only at v11, which is a major bump and needs owner approval anyway.

### BL-012 — `@types/node` is `^20` while the runtime is Node 24

**Found:** audit fix F-026 (`974b255`) · **Status:** **Resolved** in `0066f27` (owner approved) —
`@types/node` `^24`, resolving 24.19.2; typecheck clean with no source change

`.node-version`, `engines` and CI are on Node 24, but the type definitions still describe Node 20:
APIs added since 20 are untyped, and the compiler will not flag anything removed. Nothing fails
today. Moving to `@types/node@^24` is a major bump of the types package, which the audit-fix rules
reserve for the owner.

### BL-013 — The in-memory cache never evicts keys that are not read again

**Found:** Phase 1 of the audit fixes, checking how `cache.ts` behaves without Upstash (D1) ·
**Status:** **Resolved** in `e5754b5` (audit Phase 2, with F-020: a sweep every minute and at most
1,000 entries). Was: Open (audit-ledger observation N-03) — **deferred into audit Phase 2 with F-020** by the
owner

When Upstash is not configured — as on this machine — `cache.ts` falls back to a `Map` and deletes
an expired entry only when `get()` reads it again. Keys that are never re-read stay forever: every
distinct scraped URL, every search query. Memory grows with traffic, the same class of bug as
F-020 (the rate limiter). **Pick up in:** Phase 2, alongside F-020 (owner decision);
with Upstash configured in production the in-memory path is only a fallback.

### BL-014 — `db.ts` reports every failed Supabase operation to Sentry, unthrottled

**Found:** Phase 1, the D5 outage simulation (`679c72e`) · **Status:** **Resolved** in `cc1d479` —
throttled through the D5 limiter, one key per operation, not demoted to breadcrumbs (owner ruling);
a failing-DB test went from 15 events for three requests to one per operation per window

Each feed request during an outage produced five Sentry events from `db.ts` — freshness check,
purge, upsert, purge, select — on top of D5's single rate-limited fallback report. At real traffic
that is thousands of events an hour and a Sentry quota problem. Options: route them through the
same rate limiting as `reportFallback`, or demote them to breadcrumbs and let D5's report be the
event. Owner decision; it changes how errors are reported, not behaviour. The double purge in the
same trace is F-015, Phase 3.

### BL-015 — `urlValidation` goes to `packages/server/src/lib/` now, to `packages/shared/src/lib/` with F-005

**Found:** restructure 2, S0 judgement call 3 (owner, at the S0 approval) · **Status:** **Resolved** in
`2cd04c9` (moved to `packages/shared/src/lib/`, browser-safe; its DNS step is injected by
`packages/server/src/services/scrape/fetchPage.ts`), with F-005 as planned

Move map v2 put `urlValidation.ts` in `packages/server/src/lib/` because its only importer is the scraper,
`apps/web/src/app/api/news/scrape-article/route.ts`. The F-005 fix needs URL validation
on the frontend link sinks (`ArticleDetailView.tsx`'s `href={targetUrl}`); the module moves to
`packages/shared/src/lib/` then (owner decision).

One constraint for that move: `validateExternalUrl()` imports Node's `dns/promises` and `net` — it
resolves the hostname so it can reject private addresses (the SSRF guard) — and neither runs in the
browser. The checks that need no DNS (URL parsing, the http(s) allowlist, `localhost`) can move to
`shared/`; the resolution step stays server-side. So F-005 splits the module rather than moving it
whole.

### BL-016 — The article page fetches its own API over HTTP

**Found:** restructure 2, S0 (the F1 list) · **Status:** **Resolved** (the cleanup on
`chore/restructure`, 2026-11-02): the suggestions now call `getTopHeadlines`
(`packages/server/src/services/news/topHeadlines.ts`, the read path moved out of the route unchanged), so the
page makes no HTTP request to itself and `NEXT_PUBLIC_BASE_URL` is gone. The suggestions' cache is
now the feed's own 15-minute cache, not a 15-minute fetch cache over HTTP. Earlier: **resolved for
the scrape** in `65d3337` (owner, Phase 2 follow-up, to fix BL-021): the page calls `scrapeArticle`
(`packages/server/src/services/scrape/scrapeArticle.ts`) directly. **Still over HTTP:** the suggestions fetch
of `/api/news/top-headlines`, which has no per-IP limit and was not part of the fix. Re-checked
after Phase 3 (owner): neither the handler nor `apps/admin/src/proxy.ts` (matcher: admin paths only) limits that
route, so it has no shared bucket like BL-021's. **If a per-IP limit is ever added to
`top-headlines`, move this fetch to a direct call first**, or every reader shares the server's
bucket. The fetch also reads `NEXT_PUBLIC_BASE_URL`, not the `NEXT_PUBLIC_APP_URL` the rest of the
page uses

`apps/web/src/app/article/[slug]/page.tsx` is a server component, yet it reaches the scraper and the feed
over HTTP to its own deployment: `getArticleContent()` fetches `/api/news/scrape-article`
(`:38–42`, `revalidate: 3600`) and `getSuggestedArticles()` fetches `/api/news/top-headlines`
(`:58–62`, `revalidate: 900`), both at `NEXT_PUBLIC_BASE_URL`, falling back to
`http://localhost:3000`. Every uncached render costs two extra round trips. If the variable is
wrong or unset in an environment, both fetches fail and the page silently shows its placeholder
text and no suggestions.

Calling the backend code directly would remove the hop, but it also changes which caching and error
handling apply — and, once F-011 gives the scraper a limiter, which rate limit applies. That makes
it a behaviour change, not a move, so restructure 2 keeps the page as composition in `src/app/` and
leaves both fetches alone.

### BL-017 — Data nothing reads, left after the S1 cleanup

**Found:** restructure 2, S1 (`dc07a40`, `a81d3c4`) · **Status:** **Resolved** in `dbc4821` (the 16
keys), `6327110` (the two fields) and `c2ab97a` (the last key, `refresh`), owner-approved after a
dynamic-access check

- **Sixteen translation keys** in `packages/shared/src/config/translations.ts` have no reader, in the interface
  and in both languages: `liveFeed`, `edition`, `globalNewsHub`, `aiAssistant`,
  `storiesAvailable`, `trendingHighlights`; `footer.verifiedSources`, `footer.realtimeCaching`,
  `footer.newsCategories`, `footer.emailPlaceholder`; `articleView.backToHeadlines`,
  `originalSource`, `specialReport`, `verifiedDigest`, `visitPublisher`, `suggestedNews`. Same
  test as `a81d3c4`: no `.key` or `["key"]` access anywhere in `src/`, and the only dynamic
  indexing is `t.categories[...]`. Removing them shrinks the client JS of every page that loads
  the dictionary, as `a81d3c4` did (−962 bytes for seven keys).
- **The `bg` and `text` fields of `CATEGORY_COLORS`** (`packages/shared/src/config/categoryColors.ts`): unread
  since `dc07a40` deleted their two getters. 18 of their 22 class strings (`bg-orange-600`,
  `text-cyan-600`, …) appear in no other file, so Tailwind still emits CSS for classes no element
  carries. Removing the fields drops those rules; measure the CSS before and after.

The check that cleared them works by type, not text: it follows every value typed as the
dictionary, a section, `TRANSLATIONS`, `CategoryColorDef` or `CATEGORY_COLORS` through computed
lookups, destructuring, spreads, casts and calls. The only dynamic lookups are by language
(`TRANSLATIONS[language]`), by category id (`t.categories[...]`, whose keys all stay) and by
category name (`CATEGORY_COLORS[...]`, read only as `.hex` and `.badgeBg`). `6327110` removed 16
CSS rules; the other two of the 18 lived on in this entry's own text until `6a1382d` (BL-018).

**`refresh`, resolved in `c2ab97a`.** The same check proved the top-level `refresh` key
unreachable too; the text scan had counted `router.refresh()` as a reader. It was not on the first
approved list, so it waited for the owner, who approved its removal at the S2 review.

### BL-018 — Tailwind scans `docs/` and `scripts/`, so editing a document can change the CSS

**Found:** restructure 2, S1 (`26adbbd`) · **Status:** **Resolved** in `6a1382d` (owner-approved,
S2): `@source not` for `docs/`, `scripts/`, `database/`, `db/` and the four root `.md` files, each
proved by a probe build. The paths resolve from the stylesheet, so slices 1 and 10 rewrite them
when it moves (`SLICE_CHECKLIST` in `scripts/move-map.mjs`)

Tailwind v4 detects class names automatically in every file that is not git-ignored, Markdown
included. Deleting `docs/MOVE-MAP.md` removed one utility rule from the production CSS (−219
bytes): an ordinary English word in one of its sentences was the only place that utility's name
appeared. `26adbbd`'s message names it; this entry does not, because writing the word here
would put the rule back. Any documentation edit can add or drop a utility the same way, so a
docs-only commit can move the CSS, and a per-commit CSS comparison has to tell that apart from a
code change.

Fix: exclude the non-code folders in `globals.css` with `@source not "<path>"` (supported by the
installed Tailwind 4.3.3; the path resolves from the stylesheet), or use `source(none)` and list
the code folders. Either is a CSS configuration change, so it waits for the owner.

**Outside the approved list, so still scanned:** the code (`src/app/`, `frontend/`, `backend/`, `shared/`), comments and tests included,
and root tooling. Two cases so far: while `4ff0167` was being written, a test comment saying a
scan could not "shrink" emitted `.shrink` until it was reworded; and `.transform` is in the CSS
only because three `jest.config.ts` comments say "transform". Excluding test files or root
configs would be a further owner decision.

### BL-019 — An article-page trending image timed out at the image optimizer

**Found:** restructure 2, S3 (the smoke test after slice 11) · **Status:** **Resolved** in Phase B (B-03, 16 Nov 2026): the reader site fetches no remote image; stories show our own category drawings

In the slice-11 smoke test's screenshot of `/article/[slug]`, one thumbnail in the lists the page
builds from `/api/news/top-headlines` was empty. The `next start` log of that run has exactly one
image error:

    ⨯ upstream image response timed out for https://kubrick.htvapps.com/htv-prod/images/53baa842-b42a-46f7-96af-373e09efe30a.jpg

- **Host:** `kubrick.htvapps.com`. **It is in `imageDomains`**: `ALLOWED_IMAGE_HOSTNAMES` in
  `packages/shared/src/config/imageDomains.ts:34`. So `isAllowedImageUrl` handed the URL to `<Image>`, and
  `remotePatterns` (`{,*.}kubrick.htvapps.com`) let `/_next/image` fetch it. The allowlist is not
  the cause, and no slot is needed: `remotePatterns` holds 49 entries against the cap of 50.
- **What failed:** the optimizer's fetch from the publisher. `next/dist/server/image-optimizer.js:474`
  logs that line and answers 504 when the upstream does not respond within
  `images.imgOptTimeoutInSeconds`, default 7 (`next/dist/server/config-shared.js:229`). Fetched
  directly in S4, the same URL returned 200 in 0.31 s (35,448 bytes). The CDN was slow once; the
  image is not broken.
- **Not caused by the restructure:** `remotePatterns` is unchanged.

Nothing to fix for a one-off. If it recurs, the options are an `onError` fallback to the topic
image, which covers any publisher outage, or a longer `imgOptTimeoutInSeconds`, which only makes
readers wait longer. Either is a change for the owner to decide.

### BL-020 — A curated Sports topic image is gone from Unsplash (404)

**Found:** restructure 2, S3 (the smoke test after slice 1) · **Status:** **Resolved** in
`c3c4387` (owner-approved, S5): the slot now holds `photo-1593341646782-e0b495cff86d`, a batsman
hitting the ball, on the same host. It returned 200 before the commit

The slice-1 smoke test's `next start` log:

    ⨯ upstream image response failed for https://images.unsplash.com/photo-1540747913346-19212a729b62?w=1200&auto=format&fit=crop&q=80 404

That URL is the "Cricket" image, second of the four in the Sports bucket of `TOPIC_IMAGE_MAP`
(`packages/shared/src/config/topicImages.ts:75`). It still returned 404 when re-checked in S4. The other 44 of
the file's 45 Unsplash URLs (43 distinct, `GENERIC_NEWS_FALLBACK` included) returned 200.

Unlike BL-019, this one fails every time. Take an article whose own image is missing or not
allowlisted, whose headline matches the Sports keywords, and which `assignDedupedTopicImages`
gives that slot: its thumbnail renders empty.

Fixed by replacing the URL with a working photo that shows cricket being played. It is on the
same host, so `imageDomains` and `remotePatterns` are unchanged.

### BL-021 — The scraper's rate limit puts every reader in one bucket

**Found:** audit Phase 2, F-011 (`3b63a37`) · **Status:** **Resolved** in `65d3337` (BL-016,
owner-chosen): the article page no longer comes through the public route, so the route's per-IP
limit now sees only external callers

F-011 limits `/api/news/scrape-article` to 30 uncached scrapes a minute per client IP (owner
decision D1). The route's only caller today is the article page's server-side fetch of it
(`apps/web/src/app/article/[slug]/page.tsx:38–42`, BL-016). That request carries no reader IP, so every
reader's uncached article counts against one key: the server's own address in production, or
`unknown` locally. Next's data cache (`revalidate: 3600` per URL) and the 1-hour scrape cache keep
that traffic low, but a burst of distinct new articles could pass 30 a minute, and the page would
then show its placeholder text.

Options:
- **Call the backend directly from the page** (BL-016). The self-fetch goes away, and the public
  HTTP route keeps the limit for outside callers only. Recommended; it changes which caching applies,
  so it is a behaviour change to test first.
- Raise the limit, which weakens F-011 for direct callers.
- Have the page forward the reader's IP in a header the route trusts only alongside a server-side
  secret. More moving parts than the first option.

### BL-022 — A public scrape writes to the database

**Found:** audit Phase 2, F-003 tests · **Status:** **Resolved** in Phase B (B-01, 16 Nov 2026): the scraper is deleted, and the reader site writes nothing (R12-03)

Every uncached scrape that extracts an article also runs
`supabase.from("articles").update({ content }).eq("link", targetUrl)` in the background
(`apps/web/src/app/api/news/scrape-article/route.ts:537`). So a public GET writes to the database, and the row it
updates is chosen by the caller's `url` parameter. The value written is what the server scraped
from that very URL, so a caller can only make a stored article's content match its own link. Still
worth deciding: a local run writes to whatever project `.env.local` names, which may be production
(gotcha 3.18), and a public endpoint that writes is one more thing to rate-limit and audit. The
feed does return `content` with each row (`packages/server/src/repositories/db.ts:429`), so check its readers
before dropping the write.

Options: keep it, drop it, or move it behind the cron. Not changed in Phase 2: it is not part of any
audit finding.

### BL-023 — Signed article links, if the article page must survive a Supabase outage

**Found:** audit Phase 2, F-005 (`8d0b775`) · **Status:** Open — upgrade path, only if needed (owner)

F-005 trusts the article page's `?url=` only when it names a stored article (or a built-in mock
one). That is a database read per article page, so while Supabase is down, and for articles past
the 7-day purge, the page shows no publisher link and no scraped text: safe, but degraded.

If outage resilience is ever needed: the server attaches an HMAC of each article link to the feed
data it already sends (a new secret, for example `ARTICLE_LINK_SECRET`). Every place that builds an
`/article/...?url=` link adds `&sig=`, and the page verifies the signature instead of querying the
database. Costs: a new environment variable; an additive change to the feed responses; edits to
the six link builders (`ArticleCard` ×2, `CategoryMegaMenu`, `MarqueeTicker`, and the
related/trending lists in `ArticleDetailView`); and links shared before the change lose their
publisher link. The stored-article lookup was chosen instead (owner, Phase 2).

### BL-024 — Nullable columns the code treats as non-null (`breaking_news`, `admin_logs`)

**Found:** audit Phase 3, F-008 (`db28a46`) · **Status:** Open — deployment phase (owner)

`database/schema.sql` carries the DDL that lived in code comments unchanged, and it leaves these
columns nullable while the TypeScript types say they are always set:

- `breaking_news.is_active` and `breaking_news.created_at`
- `admin_logs.details`, `admin_logs.metadata` and `admin_logs.created_at`

The inserts always set them (or their defaults do), so the gap is about rows written some other
way. A `NOT NULL` migration must first check the live data for nulls
(`SELECT count(*) … WHERE <column> IS NULL` for each), which is deployment-phase work.

`admin_logs.action` is free text, while the code uses the `AdminAction` union. **Recommendation: keep
it free text.** A CHECK constraint would need a migration for every new action, and the column is
written only by `logAdminAction`, whose parameter type already restricts it.

### BL-025 — Without the service-role key, the app runs on the anon key and writes fail

**Found:** audit Phase 3, owner check of RLS against the live app · **Status:** Open

`packages/server/src/lib/supabase.ts` uses `SUPABASE_SERVICE_ROLE_KEY` when set and falls back to
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `isSupabaseConfigured()` is true with the anon key alone. With
RLS on, the anon key can only read `articles` and `breaking_news`. The cron's ingest and purge,
every admin write and the audit log all fail. Where anon still holds Supabase's default table
grants, some of these fail silently (0 rows, no error) instead of as `permission denied`.
The table of every access is in [the database runbook](#which-key-the-app-uses-and-what-rls-does-to-it).

No policy change fixes this, because the anon key is public by design. Options: fail loudly (a
startup or health warning when only the anon key is set, or report the writes as unavailable), or
keep it and rely on the runbook's pre-check that the key is set. Not changed: no audit finding
covers it.

### BL-026 — Headline translation

**Found:** audit F-024 · **Status:** **Closed** in Phase B (B-02, 16 Nov 2026): no machine translation of other publishers' text; Hindi readers get stories written in Hindi from NewsData's Hindi feed (R1-12)

`translateHeadline(text, lang)` in `packages/shared/src/config/translations.ts` returned `text` unchanged. It
ran on every card title and description (`ArticleCard`) and on the mega-menu titles
(`CategoryMegaMenu`), so it looked like translation without doing any. F-024 removed it. Cards
and the mega menu show each article in the language its publisher wrote it in; the Hindi feed is
already chosen by script (`matchesLanguageScript` in `packages/server/src/repositories/db.ts`).

The only real translation is on the article page: `ArticleDetailView` translates the article's
title, description and paragraphs through `/api/translate` when the UI is in Hindi, cached per
title. Translating headlines in the feed would need the same: a batched `/api/translate` call per
feed load (the route allows 50 texts and 10,000 characters per request, F-010) and a cache, or
translated titles stored at ingest. Either costs translate-API quota on every new story.

### BL-027 — The first search result is never shown

**Found:** audit Phase 4, writing the F-021 characterization (`675ce1d`) · **Status:** **Resolved** in `96f192d`
(owner: fix now; while searching the grids start at index 0)

In `apps/web/src/components/home/HomeClient.tsx` the featured slot shows `articles[0]` only when no search is
active (`featuredArticle && !searchQuery`, `:424`), while Top Stories and Latest start at
`articles.slice(1, …)` (`:319`). So during a search the best match is filtered in and then never
rendered. `HomeClient.test.tsx` pins the current behaviour ("Budget passes" is dropped). Fix: start
the grids at index 0 while searching, and update that test.

### BL-028 — Theme ternaries still switch after hydration

**Found:** audit Phase 4, F-028 (`5ad891a`) · **Status:** Open

F-028's pre-paint script sets the `dark` class on `<html>`, so everything styled with `dark:`
variants is right from the first paint. Components that choose classes in JavaScript instead
(`isDark ? "…" : "…"` from `useTheme()`: 75 ternaries in 16 files under `frontend/`) still render
light until ThemeContext's effect runs after hydration. They cannot read the theme during render
without their server and client HTML differing. Fix: convert those ternaries to `dark:` variants,
file by file. Check the CSS budget, since most of the colours are already in the stylesheet.

### BL-029 — The seed route falls back to a public-prefixed NewsData key

**Found:** audit F-009 (ledger note) · **Status:** **Resolved** in `45223f0` (owner: remove; the Sentry
scrub list keeps the name, for an environment that still sets it)

`apps/admin/src/app/api/admin/seed-supabase/route.ts:15` reads `NEWSDATA_API_KEY || NEXT_PUBLIC_NEWSDATA_API_KEY`.
It runs on the server, so nothing leaks today. But the fallback invites putting a secret under a
`NEXT_PUBLIC_` name, and Next inlines such a name into any client bundle that reads it. F-009 lists
it in `.env.local.example` as "do not set it". Removing the fallback is a one-line change; it breaks
the seed route only for an environment that sets the public name alone.

### BL-030 — The chatbot ships on every route

**Found:** audit Phase 4, F-027 (`7ead49b`) · **Status:** **Resolved** in Phase B (B-06, 16 Nov 2026): the chat button is a lazy chunk (`ChatLauncher`), loaded only when the AI chat is on

`apps/web/src/app/layout.tsx` renders `FloatingAiAssistant` (`apps/web/src/components/chat`), which imports
`Chatbot` statically. So the chatbot's code is in a chunk every route loads, even though it is closed
until the reader clicks its button: `/admin/login` and `/_not-found` too. F-027 showed it. 418 bytes
of dark-mode class strings grew all 10 page bundles by the same amount: +1.40% on `/_not-found` and
+1.25% on `/admin/login`.

Proposal: keep the floating button in the layout, and load `Chatbot` only on the first open, with
`next/dynamic` (`ssr: false`) or a `React.lazy` import inside `FloatingAiAssistant`. The closed
state renders `null` already (`if (!isOpen) return null`), so nothing visible changes. The cost is a
short fetch on the first click, and the bundle check should show the chunk leaving every route. Check
the Next 16 `lazy-loading` guide in `node_modules/next/dist/docs/` first. Leaving `/admin` out of the
button (its own decision) is not part of this.

### BL-031 — New moderate advisories in dev and build tooling (`glob`, `minimatch`)

**Found:** audit Phase 5, final `npm audit` (2026-11-02) · **Status:** Open — owner decision

`npm audit` went from 5 low to 37: 0 critical, 0 high, 34 moderate, 3 low. The moderates come from two
advisories published after Phase 1:
- `glob` 9.0.0–14.0.1 ([GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)),
  through `@sentry/nextjs`'s build-time bundler plugin.
- `minimatch` <11.0.1 ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)),
  through `eslint` and `eslint-config-next`'s plugins.

Neither ships in the app. npm's only fixes are major-version changes (`eslint` 4.0.0, `@sentry/nextjs`
10.76.1), which the rules forbid without the owner. `npm audit fix --dry-run` without `--force` would
change 14 dev packages and leave the count at 37, so it was not run. Options: accept, as for the jest
lows; or wait for `@sentry/nextjs` and `eslint-config-next` releases that move to fixed versions, and
recheck then. CI does not run `npm audit`, so it is unaffected either way.

### BL-032 — A2 for new pages

**Found:** audit master prompt, Phase 5 · **Status:** **Moot** — restructure 4 (ADR 0005,
`chore/restructure`) removed the shims, A2, `SHIMS` and `check:boundaries`: every page holds its own
code, as the framework intends. The text below is kept as it was written.

A2 (`eslint.boundaries.mjs`, `boundaries/shim-only`) holds two kinds of file to re-exports and
literal segment config: every `src/app/**/route.ts`, and the pages whose bodies moved to
`src/app/` in restructure 2. Those pages are `SHIMS` in `scripts/move-map.mjs`, derived from
the move map. A `page.tsx` added later is in no move map, so A2 never sees it. Its logic can then grow
in `src/app/`, which is the routing shell. Proposal: apply A2 to every `src/app/**/page.tsx`, with the two
composition pages allowlisted by name (`apps/web/src/app/page.tsx` and `apps/web/src/app/article/[slug]/page.tsx`, which
combine backend data with a view, ADR 0002). `check:boundaries` and the jest coverage exclusion read
the same list, so change all three together, and prove the rule with a probe page.

### BL-033 — The 7-day purge deletes what Rule 19 says to keep for 60 days

**Found:** panel work, Step 1 report (2026-11-02), point 7 · **Status:** Open — decided in Panel 4/7

The reader feed keeps a 7-day rolling window. `purgeOldArticles` (`packages/server/src/repositories/db.ts`)
deletes every article whose `created_at` is older than 7 days, once per cron run
(`packages/server/src/services/news/refreshNews.ts`) and when the admin presses purge (`apps/admin/src/app/api/admin/db-stats/route.ts`).
the access rules (`docs/PANEL_DOCS.md`) (from the retired PANEL_PLAN.md) reads IT Rules Rule 19 as requiring content records for at least 60 days, and asks
for a 60-day purge floor. Today nothing of a purged article survives, so the two conflict.

Proposed direction (owner, 2026-11-02): the feed keeps its 7-day window. A separate `content_records`
table keeps a light record of every published item (title, link, source, published and unpublished
times, actor) for at least 60 days, and the purge floor applies to the records, not to the feed.
Not built now: the table, its writer and the floor belong to Panel 4 (Ingestion) or Panel 7
(Compliance), whichever comes first.

### BL-034 — Export the audit chain's head hash outside the database

**Found:** owner, Panel 0 design approval (2026-11-02) · **Status:** Open — after Panel 0

`audit_log` chains each row to the one before it (`prev_hash`, `row_hash`; design
[`panel-0-access-foundation.md`](PANEL_DOCS.md#panel-0-design-the-access-foundation) §1), and
`audit_verify_chain()` finds an edited or deleted row. It cannot find a **full rewrite**: someone
with owner access to the database could recompute every hash from the first row on, and the chain
would verify. The defence is a copy of the head that lives somewhere else. On a schedule (for
example daily, from the cron), record the latest `seq` and `row_hash` outside the database: a
log line to an external sink, a Sentry event, or a file in separate storage. A rewrite then shows as
a head that no longer matches the exported one. Needs a choice of destination that a database owner
cannot also edit.

### BL-035 — Statements in the docs that were already stale before restructure 3

**Found:** restructure 3, S3 (2026-11-03), while merging the docs · **Status:** Open — docs only

Restructure 3 carried the docs as they were, changing only what its own moves made wrong. These
statements were stale before it, for reasons outside its scope, and are left for the work that owns
them:

- "No route handler performs its own auth check" (System design §1, and the large-files note in the
  current status). Since Panel 0's first half (`dfcaf80`..`0bb4fbb`), 13 admin route bodies check a
  permission server-side through `backend/auth/requirePermission.ts`; the proxy is the first gate,
  not the only one.
- "What `backend/lib/` means" lists `urlValidation`, which F-005 moved to `backend/shared/validation/`,
  and omits `likePattern` and `readJsonBody`.
- Module responsibilities: `backend/repositories/` omits `staff.ts`, and `backend/auth/` describes
  only the admin session cookie.
- The panel index shows Panel 0 as *Planned*, while its first half is on `main` and the rest on
  `panel-0-access`.

Fix with the Panel 0 docs, when panel work resumes (the definition of done, item 6).

**Resolved by the merge into the apps/packages layout (2026-11-04):** the four statements above
were rewritten with the docs in restructure 5 (the module table in ARCHITECTURE, §6, names
`staff.ts`, the auth modules and `readJsonBody`, and `urlValidation` in `packages/shared`; the
panel index shows Panel 0 *In progress*). One more stale statement, recorded on `panel-0-access`
as its own BL-035: the root README's "Setup" said `database/schema.sql` "currently defines the
`articles` table only", which stopped being true at F-008 (`db28a46`); the setup now names the
database files in order and points at the runbooks instead.

### BL-036 — Runtime messages still tell the reader to set `.env.local`

**Found:** restructure 3, S3 (2026-11-03) · **Status:** Resolved (owner approval, 2026-11-03): every
string below names the env file (`frontend/.env` on main; the root `.env` since the merge into the
apps/packages layout); the login test asserts the 503 message, and `envExample.test.ts` fails if
any source file names `.env.local` again

Since restructure 3 the local env file is `frontend/.env`, but these strings, which the app prints or
returns, still name `.env.local`. They are output, not comments, so restructure 3 (behaviour-
preserving) left them:

- `backend/api/admin/login.ts`: the 503 JSON, "Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET in
  .env.local."
- `backend/api/news/top-headlines.ts` and `backend/services/news/fetchNews.ts`: the warning
  "NEWSDATA_API_KEY is not set — falling back to mock articles. Add it to .env.local."
- `backend/repositories/db.ts`: the warning "Supabase credentials not configured in .env.local yet."
  and the health note "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local".
- `database/seed/seed_supabase.mjs`: its usage line, `node --env-file=.env.local ...`, which now
  needs `--env-file=frontend/.env`.

Proposed: one change commit naming `frontend/.env` (or "the env file", which stays true in
production, where the values come from the Vercel project), with any test that asserts a message
updated in the same commit.

### BL-037 — Contrast in the public site's chrome

**Found:** Panel 0's accessibility tests (2026-11-02) · **Status:** Open — public site

axe (WCAG 2.1 AA) reports `color-contrast` (serious) on parts every page renders, outside Panel 0:
- `apps/web/src/components/news/BreakingNewsBanner.tsx`: the "🔴 BREAKING" label is white on red with
  `animate-pulse`, which lowers its opacity, so it falls below 4.5:1 for part of every cycle.
- `apps/web/src/components/news/Header.tsx`: the 10px red "EN"/"HI" language marker, and the 11px
  "Follow Us:" label in `text-slate-400` (dark theme).
- `apps/web/src/components/news/Footer.tsx`: the column headings and labels in `text-slate-400` at 10–11px.

`e2e/accessibility.spec.ts` excluded exactly these three from its check of the sign-in page, which
is Panel 0's; since the split (ADR 0006) the sign-in page is in `apps/admin`, which does not render
them, so the check excludes nothing. The defects remain on every reader page. The fix is darker text (slate-500 and up on white) and no opacity pulse on text, or a
pulse only under `prefers-reduced-motion: no-preference`.

### BL-038 — The login limit trusts the first `X-Forwarded-For` address

**Found:** Panel 0's browser tests (2026-11-02) · **Status:** **Resolved** in R1-05 (`0f92d3e`):
`getClientIp` takes the entry `TRUSTED_PROXY_HOPS` from the right (2 on AWS), tested with a forged
header, and the runbook makes the ALB accept traffic only from CloudFront.

`getClientIp` (`packages/server/src/lib/rateLimit.ts`) takes the first address in `X-Forwarded-For`, then
`X-Real-IP`. The sign-in limit (10 per 15 minutes) is counted per that address. On Vercel the
platform sets the header, so the first address is the client's. Behind an AWS load balancer the
balancer **appends** the client's address, and the first one is whatever the client sent: a
guesser can send a new address with each attempt and never reach the limit. The per-user MFA limit
(five codes per 15 minutes) is not affected. At the AWS move, read the address the balancer adds
(the last entry, or a header it sets that clients cannot), and test it with a forged header.

### BL-039 — The root not-found and error pages cost every reader page 6.7 KB

**Found:** R1-07 (2026-11-04) · **Status:** Fixed (`fix/r2-reader-bugs`, 17 Nov 2026), in part:
2,496 of the 6,707 bytes

**The fix:** `ErrorMessage` reads no context and has no hook: it renders both languages, each in a
span with its own `lang`, and `globals.css` shows the one `<html lang>` names. `not-found.tsx` is
a server component with no client chunk; `error.tsx` passes its own message, so its chunk does not
carry the not-found text. Every reader route went down 2,496 bytes (`/about` 683,940 → 681,444).
The rest is the error boundary's own chunk (about 2.5 KB: the markup, the shared strings, the retry
button and the Sentry hand-off), which must stay on the client. The design pass in R2 can revisit
it. The original note:

Every page route loads the root `not-found.tsx` and `error.tsx` components, and Turbopack gives each
one's chunk its own copy of what it imports (gotcha 3.27). R1-07 kept the cost at +6,707 bytes a
reader route (+0.98% on `/about`, from a first draft's +34,684): the message component, with its
English and Hindi strings, once in each chunk. In R2, with the pages' design:
- render the not-found page on the server, with no client component: the language can follow
  `<html lang>` in CSS instead of the language context;
- give the error boundary only what it must have on the client, the retry button.

Measure with `node scripts/check-js-budget.mjs --print` before and after.

### BL-040 — With Redis unreachable, a cache miss waits two seconds

**Found:** STOP R1's `/about` evidence (2026-11-05) · **Status:** **Resolved** in E-07 (16 Nov 2026): one attempt per Redis call, cut off after 1 second, then Redis is skipped for 10 seconds (`packages/server/src/lib/redisBreaker.ts`, and the cache handler's own copy)

The reader site's cache handler (`apps/web/cache-handler.mjs`) gives Redis 1 second for a read and
1 second for a write. Measured on the Docker image with Upstash pointed at an unreachable address:
`/about` still answers 200, but in about 2.1 seconds. Every page or fetch that misses the cache pays
the same while Redis is down, and the ALB and container health checks (5-second timeout) pass
slowly. Options:
- a shorter timeout;
- writes that do not hold the response (sent without awaiting, errors still logged);
- a few seconds of in-process memory of a failed Redis, so later requests skip it.

Healthy, each `/about` request costs two Redis reads (GET and the tag check's HMGET). With ALB
checks every 30 seconds from two availability zones and the container's own check, two reader tasks
spend about 35,000 commands a day on health checks alone.

### BL-041 — Supabase's own logs are not kept in Mumbai

**Found:** the release plan (owner's senior, 16 Nov 2026) · **Status:** Open — before the full
launch

The release keeps the app's logs, Nginx's and CloudFront's in Mumbai for 365 days. Supabase's own
logs (the database, auth) stay with Supabase, which keeps them for days, not a year. A log drain
sends them to our store; it is a paid Supabase add-on. Skipped for the release; add it before the
full launch, with the lawyer's answer on which logs must stay in India (NEWSROOM_PLAN §8, question 7).

### BL-042 — An unknown article link answers 200 with noindex, not 404

**Found:** Phase B's browser check (B-05, 16 Nov 2026) · **Status:** Fixed (`site/brand-design`,
17 Nov 2026)

**The fix, without a Proxy:** the root `loading.tsx` moved into the `(feed)` route group (home
and `/saved`), so neither the article route nor the section route has a loading file above it, and
`notFound()` runs before anything streams. An unknown story or section answers 404
(`routeLoading.test.ts` keeps loading files off both routes; the browser tests check both). The
original note:

The article page calls `notFound()` for a link we never stored, but the root `loading.tsx` has
already started streaming, so the response keeps status 200; Next adds `noindex` (gotcha 3.34). It
is a soft 404: search engines drop it, and readers see the not-found page. A real 404 needs the
lookup in a Proxy, before the page renders. Do it with R2's id-based article URLs, where the lookup
is a cheap check by id.

### BL-043 — `axios` and `cheerio` are no longer used

**Found:** B-01 (16 Nov 2026) · **Status:** Open — needs the owner's approval (a dependency change)

The scraper was their only user. Removing them from `package.json` and the lockfile shrinks the
install and the worker image, and takes two packages out of the advisory reviews (BL-031).

### BL-044 — An astrology story passed the filler filter

**Found:** Phase B's browser check (16 Nov 2026) · **Status:** Fixed (`fix/r2-reader-bugs`, 17 Nov
2026), but the stored rows are not checked

**The fix:** the filter adds "astrological", "ज्योतिषीय" and "zodiac sign", not "astrology" or
"astrologer" alone (an app's funding and an arrest are news), with tests both ways. The feed's read
path runs the same filter, so stored rows it matches stop showing. A read-only search of the
stored titles for other wording (astrolog, zodiac, ज्योतिष, numerolog, vastu) is still to do: the
session's read script was refused by the permission check, so the owner runs it or allows it.

"What Cosmic Changes Await Us? Astrological Insights for 2023 and Beyond" reached the feed:
`isHoroscopeOrRitualFiller` (`packages/shared/src/config/newsConfig.ts`) misses this wording. Widen
it with a test for this title, and check the stored rows for others like it.

### BL-045 — The smallest thumbnails crop the category drawing's label

**Found:** Phase B's browser check (16 Nov 2026) · **Status:** Fixed (`fix/r2-reader-bugs`, 17 Nov
2026): each category has `<key>-thumb.svg`, a 4:3 drawing with the colours and a TP mark and no
label, from `thumbnailFor()`; the article page's two side lists use it

The placeholders (`apps/web/public/placeholders`) are drawn for 16:9 and 21:9 cards. In the 56–64
pixel thumbnails of the article page's side lists, the label is cut ("USINESS"). In R2's design, a
square variant or no label at that size.

### BL-046 — The Supabase fallback report is still called `supabase->newsdata`

**Found:** R1-12 (16 Nov 2026) · **Status:** Open — small, any time

Since R1-12 the feed never falls back to NewsData: when the database does not answer, the feed is
empty. The report (`reportSupabaseFallback`, `packages/server/src/services/health/health.ts`) still
names the old fallback, which misleads whoever reads it in Sentry. Rename it (and its alert, if one
is set on the name).

## Audit ledger

The audit (28 findings, F-001..F-028) was run at commit `0e7f1f7`, **before** both restructures, so
its own paths and line numbers are stale. Every location below is at today's paths. They were first
verified against the repo at `4cf5be6` (2026-10-30) and updated through Phase 1 at `679c72e`. Then,
after restructure 2, they were moved to the new layout and re-verified at `51bafd5` (2026-10-30).
Each cited line was re-located by its content at `679c72e`, with its surrounding lines as context,
not by adding offsets, and every claim without a line number was re-checked. Restructure 4
(2026-11-02, ADR 0005) rewrote the paths to the `src/` layout by a mechanical file-by-file map; a
route body's line numbers carry over to its `route.ts`, except `top-headlines`, whose body moved to
`packages/server/src/services/news/topHeadlines.ts` (+14 lines). Locate code through
[`ARCHITECTURE.md`](ARCHITECTURE.md#architecture) §4 and the editor, not through the audit.

**Status.** *Resolved* — fixed, with the commit. *Pending verification* — fixed in code; a check
that cannot run on this machine remains, and is named. *Partial* — part fixed, the rest named.
*Open* — not started. This file is updated as each finding is fixed; one finding per commit, prefixed with
its ID. Closed out in audit Phase 5 (2026-11-02): no finding is Open. What "Pending verification" needs is
listed in [Deployment](#deployment).

### Summary

| Status | Count | Findings |
|---|--:|---|
| Resolved | 22 | F-001, F-003, F-004, F-005, F-007, F-009, F-010, F-011, F-012, F-013, F-014, F-015, F-016, F-017, F-019, F-020, F-021, F-022, F-023, F-024, F-025, F-027 |
| Pending verification | 5 | F-002 (production check), F-006 (live probe), F-008 and F-018 (SQL not yet applied), F-026 (the production runtime's Node version) |
| Partial | 1 | F-028 (`isDark` ternaries, BL-028) |
| Deferred | 0 | — |
| Open | 0 | — |

### Ledger

| ID | Sev | Finding | Status | Evidence / current location | DEF |
|---|---|---|---|---|---|
| F-001 | Crit | Next.js 16.3.0 advisories, incl. 4 critical unauthenticated RCE | **Resolved** | `47e62ae`: `next` and `eslint-config-next` 16.4.3, the current latest. Four of the 13 advisories reached 16.4.0, so the 16.3.8 patch line was not enough. `npm audit` no longer lists `next`; route table identical; `next start` smoke test passed. 17 Nov 2026 (`fix/next-16.4.6`): 16.4.6 for GHSA-mfr8-8qww-v76h (moderate; the code uses neither `unstable_cache` nor `"use cache"`), as the build refused 16.4.3 (gotcha 3.36) | DEF-11 |
| F-002 | Crit | Every Supabase call fails; app silently serves NewsData.io | **Pending verification** | **Connection:** working on 2026-10-30 with no code change — one real request returned HTTP 200, the app's own client path (service-role key) read 78 rows with the newest 13 min old, and the feed answered `X-Data-Source: supabase`, then `cache`. The earlier failure no longer reproduces, so its `err.cause` could not be captured. **Visibility:** `57fe578` adds `/api/health` (status only, 200/503) and `/api/admin/health` (detail, behind the session); `679c72e` reports each Supabase→NewsData fallback to Sentry, rate-limited (D5). **Needs:** in production, `/api/health` answering 200, and Sentry — with `NEXT_PUBLIC_SENTRY_DSN` set, which it is not locally — receiving a fallback event | DEF-01 |
| F-003 | **Crit** (audit: High) | Scraper follows up to 21 redirects, none revalidated | **Resolved** | `2e383cb`: the guard (`packages/shared/src/lib/urlValidation.ts`) now judges IPv6 literals directly, the IPv4 embedded in mapped/compatible/NAT64/6to4 forms, Teredo, documentation, multicast and 240/4, and rejects credentials; it returns the addresses it validated. `1145bca`: `packages/server/src/services/scrape/fetchPage.ts` follows at most 5 redirects by hand (`maxRedirects: 0`), revalidating every hop, and pins each connection to its hop's validated addresses through axios's `lookup`, so DNS rebinding is closed, not documented; a refused hop is 400. Proven against the real axios with a local server, including a negative control. The article page no longer sends an unverified `url` to the scraper at all (`8d0b775`, F-005), which narrows this surface further | DEF-02 |
| F-004 | High | Admin login unthrottled; password compare leaks length | **Resolved** | `487eb47` (tests first), `7eb9253`: `verifyAdminPassword` (`packages/server/src/auth/adminSession.ts`) compares SHA-256 digests with `timingSafeEqual`, so no length check leaks; `POST /api/admin/login` allows 10 attempts per 15 minutes per IP (owner decision D1: Redis fixed window via `checkRateLimit`, in-memory fallback, logged), 429 with Retry-After. README's "compared in constant time" is now true (N-02). Production behaviour on Redis is a deployment check | DEF-06 |
| F-005 | High | Branded phishing sink: unvalidated `targetUrl`, attacker `og:url` | **Resolved** | `8d0b775` (owner decision: trust anchor = the stored articles). `apps/web/src/app/article/[slug]/page.tsx` uses `?url=` only when `findKnownArticle` (`packages/server/src/services/news/knownArticle.ts`) finds it: an exact match on `articles.link` (read-only), or a built-in mock article. Otherwise the url is treated as absent: no publisher link, no scrape (no outbound request), no attacker title; `og:url` is always the page's own address. All four sinks in `apps/web/src/components/article/ArticleDetailView.tsx` also require `safePublisherHref` (`packages/shared/src/lib/urlValidation.ts`, moved there in `2cd04c9`). Probe: `https://evil.example.com/phish` renders no link and appears in no metadata or request. The app's own links match exactly (six shapes tested), so nothing is normalised. **Depends on** an index on `articles.link`, in the Phase 3 migration (F-018), not yet applied. **Trade-offs:** during a Supabase outage, or for an article past the 7-day window, the page shows no publisher link and no scraped text; signed links are the upgrade path if outage resilience is needed (BL-023) | DEF-03 |
| F-006 | High | PostgREST filter injection via search query | **Pending verification** | `4b33611`: the feed search (`searchFilter` in `packages/server/src/repositories/db.ts`) LIKE-escapes `\ % _`, drops `*`, and double-quotes the value, so `,` `.` `(` `)` cannot add PostgREST clauses; tested against crafted terms. `614e514` (owner: fix now): the admin article list uses the same escape (`containsPattern`, `packages/server/src/lib/likePattern.ts`). **Needs:** the injection probe re-run against the live database (never run locally: it may be production) | DEF-12 |
| F-007 | High | axios advisories (redirect SSRF, ReDoS) | **Resolved** | `56e7509`: axios 1.21.0 — 12 advisories, all fixed in 1.20.0, including "maxRedirects: 0 is not enforced by the fetch adapter", which F-003 relies on. The remaining advisories: `31f4a54` (@sentry/nextjs 10.78.0, tunnel-route bypass; `tunnelRoute` stays unset) and `5970692` (transitive, `npm audit fix` without `--force`) | DEF-13 |
| F-008 | High | `admin_logs` and `breaking_news` DDL only in code comments | **Pending verification** | `db28a46`: `database/schema.sql` creates all three tables `IF NOT EXISTS` and enables RLS; `database/policies.sql` drops and recreates every policy, idempotent, in one transaction; `packages/server/src/repositories/schema.test.ts` checks every column the code uses. Owner runbook the database runbook (`docs/OPERATIONS.md`) (`069bb5b`, `48ac2a2`): order, verify queries, the key each access uses, a snapshot and a rollback per step. **Needs:** the owner applying the files. Nullability gaps: BL-024; the anon-key fallback: BL-025 | DEF-07 |
| F-009 | High | Documented env ≠ actual env | **Resolved** | `10c8b47`: `.env.local.example` lists exactly the 20 variables the code reads (found by grep), one line each; `ADMIN_SECRET_TOKEN` removed, `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` added; `packages/shared/src/config/envExample.test.ts` keeps the two in step. `45223f0` (BL-029): the seed route no longer falls back to `NEXT_PUBLIC_NEWSDATA_API_KEY`. README (`ada0757`) was already right | DEF-14 |
| F-010 | High | No input size caps | **Resolved** | `58c7f7d`: request bodies are read through a byte-capped streaming reader (`packages/server/src/lib/readJsonBody.ts`): `/api/translate` 64 KB, 50 texts, 5,000 characters each and 10,000 in all; `/api/chat` 16 KB and a 2,000-character message, with the article context trimmed; scraped pages capped at 5 MB (`MAX_PAGE_BYTES`, `packages/server/src/services/scrape/fetchPage.ts`). Over a cap: 413 or 400 | DEF-15 |
| F-011 | High | Public scraper has no rate limit | **Resolved** | `3b63a37`: `/api/news/scrape-article` allows 30 uncached scrapes a minute per IP (owner decision D1: Redis fixed window, in-memory fallback), 429 with Retry-After; cached answers are never counted. `65d3337` (BL-016): the article page calls the scraper directly, so **the limit now applies only to external callers**, not to every reader through the server's own address (BL-021). `988c7fa`: the route scrapes only stored articles (the F-005 lookup), so it can no longer be used to fetch arbitrary sites; a refused URL costs no DNS lookup or fetch. Production behaviour on Redis is a deployment check | DEF-16 |
| F-012 | Med | Contact/newsletter forms send nothing | **Resolved** | `59b875d` removed all three forms. No `<form>` remains outside admin, search, chat and the AI panel. The leftover unused newsletter strings were removed in `a81d3c4` (restructure 2, S1) | DEF-09 |
| F-013 | **High** (audit: Med) | AI panel shows a canned "Key Takeaway" on failure | **Resolved** | `526fc07` (characterization), `86bdf78`: the article page's askTimesPrime panel shows "Sorry, that request failed: <reason>" (and Hindi) in an alert, as `Chatbot.tsx` does, instead of a made-up "Key Takeaway"; an empty answer says so instead of a canned insight | DEF-04 |
| F-014 | Med | Admin purge/sync show success from `catch`; `!res.ok` shows nothing | **Resolved** | `a093080` (characterization), `5997567`: sync and purge in `apps/admin/src/app/admin/page.tsx` report success only on `res.ok`; an error status shows the server's message, a thrown request its reason, in a red alert | DEF-17 |
| F-015 | Med | `purgeOldArticles()` awaited on read and write paths | **Resolved** | `2f31bad`: the purge is off the feed's read path (`getDBArticles`) and the upsert path (`saveArticlesToDB`); it runs once per cron run (`packages/server/src/services/news/refreshNews.ts`), whose response and audit entry carry the count. The admin's explicit purge action (`POST /api/admin/db-stats`) **stays, by owner decision**: the intent was "off the read path", and a deliberate admin action is fine | DEF-05 |
| F-016 | Med | Feed fetches 80, filters in JS, slices 40 | **Resolved** | `2e3fa0b`: `getDBArticles` reads pages of 80 newest-first until 40 rows pass the JS filters, the rows run out, or 5 pages are read; a later page's error serves what was found | DEF-08 |
| F-017 | Med | Scraper returns 200 with placeholder prose; UI string-matches | **Resolved** | `41c3ab0` (characterization), `b7f6fbc`: a failed scrape is 502 (504 on timeout) with `{ error }` (`ScrapeErrorResponse`, `packages/shared/src/types`); nothing to extract is 200 with empty content; the view no longer matches placeholder wording, and the page passes it no content on any failure. Accepted by the owner: external callers of the public route now see 502/504, and the cache key is `scrape:v2:` | DEF-10 |
| F-018 | Med | 2 indexes for 7 filtered columns | **Pending verification** | `4898da4`: `database/migrations/2026-11-02-indexes.sql` adds GIN on `category` and `country`, `pg_trgm` trigram GIN on `title` and `description`, and a btree on `link` (the F-005 lookup and the public scrape route depend on it; not unique, for the `#` placeholder links). Idempotent; verify with the runbook's `EXPLAIN`. **Needs:** the owner applying it | DEF-18 |
| F-019 | Med | Lint fails; no CI | **Resolved** | `bc556da` (lint 19 errors → 0), `506a4ab` (CI). Lint today: 0 errors, 13 warnings. GitHub Actions run 41010981658 on `4cf5be6`: success; CI has stayed green since | — |
| F-020 | Med | Rate limiter keys never evicted | **Resolved** | `b44203d`: the in-memory limiter (`packages/server/src/lib/rateLimit.ts`) sweeps expired keys every minute and holds at most 10,000. `e29cf0d`: chat and translate 429s send Retry-After. The in-memory cache got the same eviction (`e5754b5`, BL-013, N-03) | DEF-19 |
| F-021 | Med | Feed fetch races; no AbortController | **Resolved** | `675ce1d` (characterization), `9ce42bc`: `fetchNews` in `apps/web/src/components/home/HomeClient.tsx` aborts the previous request and applies a response only if no newer call started (sequence guard); the duplicate fetches on category change, Reset Category and URL sync are gone (owner accepted the effect change). Related: BL-027, the hidden first search result, fixed in `96f192d` | DEF-20 |
| F-022 | Low | Page title doubled | **Resolved** | `ef510f9`: the article page sets the bare title and the root layout's template adds the suffix once; `openGraph.title` keeps it. Rendered: "Monsoon arrives early \| TimesPrime News" | DEF-21 |
| F-023 | Low | Supabase SDK in client bundle | **Resolved** | `b01d528`; `GoTrueClient` in browser chunks 1 → 0. CODEMAP: 0 server-only modules in the client bundle; `server-only` guards since `e3753b3`, and on every backend module since `19d255c` | — |
| F-024 | Low | `translateHeadline()` ignores `lang` | **Resolved** | `3de9a1e` (owner decision D3): the `translateHeadline` no-op and its three call sites are gone; nothing renders differently. Headline translation is a feature: BL-026 | DEF-22 |
| F-025 | Low | Dead RSS subsystem | **Resolved** | `bcd5393` (code + 503 route, routes 27 → 26), `d3ba8fa` (footer link). Leftover: a historical comment in `packages/shared/src/config/imageDomains.ts:14`; the unused `rssFeeds` string was removed in `a81d3c4` | — |
| F-026 | Low | `.node-version` 20 vs runtime 24 | **Pending verification** | `974b255` (D2): `.node-version` 24, `package.json` `engines` `24.x`, and CI follows `.node-version`; the local runtime is 24.19.0. CI on Node 24 has been green since (latest: run 41046741477 on `5f6b0cc`). **Needs:** Node 24 on the production runtime, at the AWS deployment (nothing is deployed until the project is complete). `@types/node` is `^24` since `0066f27` (BL-012, resolved) | DEF-23 |
| F-027 | Low | Chatbot has no dark mode | **Resolved** | `7ead49b`: `Chatbot.tsx` has dark variants from the app's palette; a test checks every light surface has one. The growth (418 B of class strings on every route) was accepted; the chatbot shipping on every route is BL-030 | DEF-24 |
| F-028 | Low | Theme flash on load | **Partial** | `5ad891a`: an inline script in `<head>` (`THEME_INIT_SCRIPT`, `packages/shared/src/config/theme.ts`) sets the `dark` class and background before the first paint, so every `dark:` variant is right from the start; no CSP blocks it. **Remaining:** components that style with `isDark ?` ternaries (75 in 16 files) still switch after hydration, a visible flash for those elements: BL-028 (owner ruling) | DEF-25 |

### Contradictions between the audit and the PRD

*The PRD (`docs/PRD.md`) was retired on 4 Nov 2026; it is in git history.*

Recorded rather than silently resolved, then ruled on by the owner (Phase 0 approval):

- **Severity of F-003.** The audit rates it High; PRD DEF-02 rates it **Critical**.
- **Severity of F-013.** The audit rates it Medium; PRD DEF-04 rates it **High**.

**Ruling: the higher rating governs priority.** F-003 is treated as Critical and F-013 as High. Both
ratings stay visible in the ledger's Sev column.

### New observations (not in the audit)

Found during triage. Not fixed; listed for the owner.

| ID | Observation | Where | Status |
|---|---|---|---|
| N-01 | Sentry's secret scrubber redacted only `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `NEWSDATA_API_KEY` | `packages/shared/src/lib/sentryScrub.ts` | **Resolved** `f6c2016`: nine keys, found by grep, plus a test that fails if a new secret-named env var is read without being scrubbed |
| N-02 | README claims the admin password is "compared in constant time"; F-004 shows it is not yet | `README.md:102` | **Resolved** `7eb9253` (F-004): the comparison is now constant-time, so the claim is true |
| N-03 | The in-memory cache (used when Upstash is not configured, as locally) removes an expired entry only when it is read again, so keys that are never re-read — every distinct scraped URL, every search — accumulate. Same class as F-020 | `packages/server/src/lib/cache.ts` | **Resolved** `e5754b5` (BL-013): a sweep every minute and at most 1,000 entries |
| N-04 | During a Supabase outage, `db.ts` sends every failed operation to Sentry unthrottled: five events per feed request (freshness, purge, upsert, purge, select), observed in the D5 run. D5's single rate-limited report covers visibility; these are the noise | `packages/server/src/repositories/db.ts` | **Resolved** `cc1d479` (BL-014): at most one Sentry event per operation per 5-minute window, through the D5 limiter |
| N-05 | `npm audit fix` (`5970692`) moved jest 30.4.2 → 30.5.2, which adds `@parcel/watcher` 2.6.0, the tree's first new package with an install script since the baseline. npm 11 does not run the script | `package-lock.json` | **Investigated, no action.** See below |

#### N-05 — `@parcel/watcher` and its blocked install script

- **What it is for.** File watching in `jest --watch` / `--watchAll`, and nothing else. It is a
  dev-only dependency: `jest → @jest/core → jest-haste-map 30.5.1 → @parcel/watcher 2.6.0`.
  `jest-haste-map` loads it lazily inside `_subscribe()`, with the comment *"Watch mode is the only
  consumer of the native binding"*, so `npm test`, `npm run test:ci` and CI never load it. The app
  never ships it.
- **What the blocked script does.** `scripts/build-from-source.js` runs `node-gyp rebuild` **only**
  when `npm_config_build_from_source=true`; otherwise it exits doing nothing. (An earlier version
  of this row said it builds when no prebuilt binary exists; the script shows it does not.) The
  native binary arrives as a per-platform optional package — `@parcel/watcher-win32-x64` here,
  `-linux-x64-glibc` on the CI runner — so nothing depends on the script running.
- **Does anything break with it blocked?** No, checked on 2026-10-30: `npm test` exit 0 (9 suites,
  70 tests); `npm run build` exit 0 (28 routes); and the native binding itself loads from
  `@parcel/watcher-win32-x64` and delivered a file event (`update probe.txt`) in a probe, so
  `jest --watch` has what it needs. CI on Node 24 / npm 11 is green (run 41018035376).
- **npm settings:** unchanged, by owner instruction.

### npm audit

| When | Total | Critical | High | Low |
|---|--:|--:|--:|--:|
| 2026-10-30, before Phase 1 | 16 | 2 | 9 | 5 |
| after F-001 `47e62ae` (next, sharp) | 14 | 1 | 8 | 5 |
| after F-007 `56e7509` (axios) | 13 | 1 | 7 | 5 |
| after `31f4a54` (@sentry/nextjs, fast-uri) | 11 | 0 | 6 | 5 |
| after `5970692` (transitive) | **5** | **0** | **0** | 5 |
| 2026-11-02, Phase 5 close-out | 37 | 0 | 0 | 3 (+34 moderate) |

#### Accepted risk — the jest lows

`jest`, `jest-cli`, `jest-config`, `@jest/core` and `deepmerge`, all **low**, accepted by owner
ruling (Phase 0 approval). The reason: npm's only "fix" is jest **25.1.0**, a major *downgrade*
from the installed 30.x, and the code runs only at test time, never in the app. Never run
`npm audit fix --force` for them; recheck when a jest release clears them.

#### New since 2026-10-30 — 34 moderate, dev and build tooling only

Two advisories published after the Phase 1 audit:
- `glob` 9.0.0–14.0.1, [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4).
  It reaches us through `@sentry/nextjs`'s build-time bundler plugin.
- `minimatch` <11.0.1, [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
  It reaches us through `eslint` and `eslint-config-next`'s plugins.

Neither ships in the app. npm's only fixes are major-version changes (`eslint` 4.0.0, `@sentry/nextjs`
10.76.1). `npm audit fix --dry-run` without `--force` changes 14 dev packages and leaves the count at 37.
So nothing was changed: no upgrade without the owner (BL-031). The jest lows are now counted as 3
(`deepmerge`, `jest`, `jest-cli`).
