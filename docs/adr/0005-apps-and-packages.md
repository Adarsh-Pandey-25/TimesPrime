# ADR 0005 — Three apps over shared packages

**Status:** **Accepted** — 4 Nov 2026, with the owner's approval of
[`NEWSROOM_PLAN.md`](../NEWSROOM_PLAN.md) (sign-off item 2) and the instruction to restructure the
code to it. **Supersedes:** [ADR 0004](0004-standard-src-layout.md)'s single app.
**Related:** [`architecture.md`](../architecture.md) (the layout and the rules, in prose).

## Context

ADR 0004 put the reader site, the back office and the scheduled refresh in one Next.js app. The
research behind the plan ([`RESEARCH.md`](../RESEARCH.md), section 2) found four costs of that for
a news site: an admin deploy resets the reader's cache; the newsroom editor (Tiptap, Panel 2) would
ship in shared bundles; the admin sits on the public origin and cannot get a stricter firewall or an
IP allowlist; and a reader surge on election night competes with the editors for the same servers.
The owner chose to separate them now, before the desk panel brings the editor.

## Decision

npm workspaces, with all dependencies in the root `package.json` and one lockfile:

- `apps/web` — the reader site; `apps/admin` — the back office, keeping the `/admin` and
  `/api/admin` paths (so the proxy matcher and every route rule stay as they were); `apps/worker`
  — scheduled jobs as plain Node, run with `tsx` under the `react-server` condition.
- `packages/server` (server-only), `packages/shared` (client-safe config, types, helpers) and
  `packages/ui` (React both apps use), each exposing modules through `package.json` `exports`.
- The admin no longer renders the reader's header, ticker and footer (they fetch the public feed);
  it has its own top bar and layout, and is `noindex`.
- The homepage banner reads the reader site's own `GET /api/news/breaking-news`; the admin's GET
  needs `breaking_banner.manage`, so the admin API has no public read left besides sign-in and
  sign-out.
- The 30-minute refresh is a worker job, not an HTTP route; `vercel.json` and `CRON_SECRET` go.
- Jest runs one project per app plus the packages; ESLint's zones keep apps from importing each
  other and packages from importing apps.

`packages/editor` (the Tiptap schema shared by admin and web, plan section 3) is created with
Panel 2, when there is code to put in it.

## Alternatives rejected

- **Keep one app until the triggers fire** (the research's first suggestion). Cheaper today, but the
  owner wants the separation in place before the desk panel, and doing it later would collide with
  more panel work.
- **Turborepo or Nx.** Build caching and task graphs pay off with many apps and a CI bill; with three
  apps and two developers, npm workspaces and plain scripts are enough. Adding Turborepo later does
  not change the folder layout.
- **A separate API service** (web and admin calling a backend over HTTP). No publisher evidence
  supports it, it adds a network hop and a second auth surface, and it gives up server components
  reading the data directly.
- **One app per panel.** The panels share the staff session, the permission check, the audit log
  and the layout; separate apps would mean separate sign-ins and duplicated code.

## Consequences

- Measured: `/admin` client JS 163,762 → 80,206 bytes and `/admin/login` 35,541 → 23,705; every
  reader route equal or smaller; the reader's CSS 93,939 → 83,122 bytes (admin-only classes left it).
  50 test suites, 753 tests.
- Local development runs two servers (`npm run dev` on 3000, `npm run dev:admin` on 3001).
- Deployment has three units (Phase I): two ECS services and a scheduled worker task.
- `globals.css` exists in both apps; moving the shared base styles into `packages/ui` is a later
  cleanup.
