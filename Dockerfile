# syntax=docker/dockerfile:1
#
# The three deployable units of the release (R1-01), as targets of one file so they share one
# dependency install:
#
#   docker build --target web    -t timesprime-web    .   reader site, port 3000
#   docker build --target admin  -t timesprime-admin  .   back office, port 3001
#   docker build --target worker -t timesprime-worker .   jobs: `docker run timesprime-worker refresh-news`
#
# AWS runs them on ECS Fargate (Arm): add `--platform linux/arm64`. The lockfile holds the
# linux-arm64 builds of the native packages (sharp), so `npm ci` picks them inside the build.
#
# Build arguments are the deployment ID and the NEXT_PUBLIC_ values. Next inlines the latter into
# the server and browser bundles at build time (bundled docs: guides/environment-variables.md), so
# they cannot be set at run time, and an image is built per environment. They are public by
# design: the browser receives them. Every secret is set at run time by the ECS task definition,
# from Secrets Manager, never here; .dockerignore keeps every env file out of the build context.

ARG NODE_IMAGE=node:24.19.0-bookworm-slim

# ---- dependencies: the root lockfile, every workspace's package.json ----
FROM ${NODE_IMAGE} AS deps
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
COPY apps/worker/package.json apps/worker/
COPY packages/server/package.json packages/server/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
RUN npm ci --no-audit --no-fund

# ---- build: the whole repository, built once per app ----
FROM deps AS source
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SENTRY_DSN
# One value per deployment (the git SHA): Next appends it to asset URLs and compares it on
# navigation, so a browser holding the last deployment's page reloads instead of mixing versions
# (bundled docs: next-config-js/deploymentId.md). The cache handler scopes page entries by it.
ARG NEXT_DEPLOYMENT_ID
# "1" for a build search engines must not index (staging): robots.txt disallows everything and
# every response says noindex (packages/shared/src/config/site.ts). Fixed at build, like the rest.
ARG NEXT_PUBLIC_SITE_NOINDEX
ENV NEXT_DEPLOYMENT_ID=$NEXT_DEPLOYMENT_ID \
    NEXT_PUBLIC_SITE_NOINDEX=$NEXT_PUBLIC_SITE_NOINDEX \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN

FROM source AS build-web
RUN npm run build -w @timesprime/web

FROM source AS build-admin
RUN npm run build -w @timesprime/admin

# ---- runtime images: the standalone server and its static files, run as the node user ----
# server.js serves .next/static and public/ only when they sit next to it (bundled docs:
# next-config-js/output.md); CloudFront caches them in front.
FROM ${NODE_IMAGE} AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build-web --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build-web --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build-web --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
# Liveness only: a prerendered page, so a slow database never restarts a healthy server.
# Dependency health is /api/health, for the uptime monitor (R1-08).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/about').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]

FROM ${NODE_IMAGE} AS admin
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3001
COPY --from=build-admin --chown=node:node /repo/apps/admin/.next/standalone ./
COPY --from=build-admin --chown=node:node /repo/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=build-admin --chown=node:node /repo/apps/admin/public ./apps/admin/public
USER node
EXPOSE 3001
# The sign-in page is prerendered and the proxy lets it through before any Supabase call, so it
# answers without the database or Redis (owner decision, option a).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/admin/login').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "apps/admin/server.js"]

# ---- worker: the job runner (apps/worker), started per run by EventBridge Scheduler (R1-03) ----
# It runs TypeScript through tsx, as `npm run job` does locally, so it keeps the full install.
FROM deps AS worker
# No "new npm version" notice in every run's log.
ENV NODE_ENV=production NPM_CONFIG_UPDATE_NOTIFIER=false
COPY --chown=node:node tsconfig.base.json ./
COPY --chown=node:node packages ./packages
COPY --chown=node:node apps/worker ./apps/worker
USER node
ENTRYPOINT ["npm", "run", "job", "--"]
CMD ["refresh-news"]
