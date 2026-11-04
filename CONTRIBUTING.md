# Contributing

## Where does new code go?

The plan says **what** to build next ([`docs/NEWSROOM_PLAN.md`](docs/NEWSROOM_PLAN.md)); this table
says **where** it goes. The import rules are in
[`docs/architecture.md` §5](docs/architecture.md#5-import-rules); `npm run lint` fails an import
that breaks one, naming why.

| Adding | Where | Example to copy |
|---|---|---|
| A reader page, e.g. `/faq` | `apps/web/src/app/faq/page.tsx`: the page's code, a default export, plus `metadata` | `apps/web/src/app/about/page.tsx` |
| A reader page that needs server data | `apps/web/src/app/<path>/page.tsx` calls `@timesprime/server/...` directly (never its own API over HTTP) and passes props to a component in `apps/web/src/components/` | `apps/web/src/app/page.tsx` (`fetchInitialNews` → `HomeClient`) |
| A public API route, e.g. `GET /api/news/trending` | `apps/web/src/app/api/news/trending/route.ts`: parse the request, call `@timesprime/server/...`, return the response. Logic goes in a service | `apps/web/src/app/api/news/breaking-news/route.ts` |
| A back-office panel, e.g. Panel 2 Desk | Pages in `apps/admin/src/app/admin/desk/`, routes in `apps/admin/src/app/api/admin/desk/...`, components in `apps/admin/src/features/desk/` (NEWSROOM_PLAN section 3) | `apps/admin/src/app/admin/page.tsx` |
| An admin API route | `apps/admin/src/app/api/admin/<name>/route.ts`, gated by `requirePermission` with its rule in `packages/server/src/auth/adminRoutePolicy.ts`, and a case in `apps/admin/src/app/api/admin/access.test.ts` | `apps/admin/src/app/api/admin/stats/route.ts` |
| A scheduled job | A function in `packages/server/src/services/...`, registered by name in `apps/worker/src/jobs.ts` | `refreshNews` and the `refresh-news` job |
| A reader component | `apps/web/src/components/<area>/<Name>.tsx`, imported from its own file (no `index.ts` barrels) | `apps/web/src/components/news/ArticleCard.tsx` |
| React both apps use | `packages/ui/src/<Name>.tsx`, exported as `@timesprime/ui/<Name>` | `packages/ui/src/ThemeContext.tsx` |
| Server logic, e.g. a digest | `packages/server/src/services/digest/`, each file opening with `import "server-only";` | `packages/server/src/services/news/topHeadlines.ts` |
| A database query | `packages/server/src/repositories/` (`db.ts` holds the article queries), using `supabase` from `packages/server/src/lib/supabase.ts` | `getDBStats` in `db.ts` |
| A schema change | A migration in `database/migrations/` with its rollback, which the owner applies by hand | `database/migrations/2026-11-02-indexes.sql` |
| A permission | Proposed in the panel's design doc; after the owner approves, a row in `docs/PERMISSIONS.md`, then `node scripts/generate-access-catalog.mjs` and a new migration | `database/migrations/2026-11-02-access-2-catalog.sql` |
| A helper, type or config value both apps use | `packages/shared/src/lib/`, `src/types/index.ts` or `src/config/`; it must not import `packages/server`. An image host goes in `ALLOWED_IMAGE_HOSTNAMES` (`packages/shared/src/config/imageDomains.ts`; 49 of the 50 slots are used) | `packages/shared/src/lib/urlValidation.ts` |

A new export path in a package needs its pattern in that package's `package.json` `exports` (and,
for a new package, a line in the `moduleNameMapper` of `jest.config.ts`). Tests sit beside what
they test: `route.test.ts` next to `route.ts`, `page.test.tsx` next to `page.tsx`.

Two things no check catches:

- **Admin routes go under `/api/admin/`, admin pages under `/admin/`, in `apps/admin`.**
  `apps/admin/src/proxy.ts` gates exactly those paths. Each admin route calls `requirePermission`
  first (the only gate on the data: the apps read Supabase as service_role). A new route or method
  that is not in `adminRoutePolicy.ts` fails the route walk in `access.test.ts`, and needs its row in
  that test's access matrix.
- **Code that one side uses stays on that side.** `packages/shared` and `packages/ui` are for what
  both apps import. A server-only constant lives in its service; a reader-only component stays in
  `apps/web`.

## The verify gate

Every commit must leave the tree green:

```bash
npm run verify     # typecheck -> lint -> test -> build
```

All four, not a subset. They catch different classes of problem:

| Command | What it alone catches |
|---|---|
| `tsc --noEmit` | Unresolved imports after a file move; type regressions |
| `eslint` | Imports left **behind** after a move — unused, still referenced, now dead — and every import that breaks a boundary rule (`eslint.config.mjs`, `docs/architecture.md` §5) |
| `jest` | Behaviour changes in the slice that has coverage |
| `next build` | Route resolution, config evaluation, and a client module reaching `packages/server/src/` **transitively** (the `server-only` guard), which lint, checking one import at a time, cannot see |

If a change cannot go green, revert it and report why. Do not stack fixes on a
red tree — the second fix hides what the first one broke.

## Commit convention

**A commit is a move, a deletion or a change. Never two of them.**

- A **move** uses `git mv`, so history follows the file. It may also fix the import paths and path
  references the move invalidated — that is part of the move, not a separate change. It may not fix
  anything else.
- A **deletion** uses `git rm`. It may also remove the imports and index links that pointed at the
  deleted thing, and nothing else.
- A **change** is everything else.

This matters because `git log --follow` and `git blame` both become useless when
a file is moved and edited in the same commit: the rename detection fails and the
diff shows the whole file as new.

Anything you are tempted to fix "while you are in there" goes in
[`docs/BACKLOG.md`](docs/BACKLOG.md) with the reason it was deferred, not into
the commit.

Message shape:

```
<type>: <imperative summary under ~70 chars>

Why the change was needed, and what was rejected along the way. Prefer
explaining the reasoning over restating the diff — the diff is already in
the commit.

Verification:
  tsc --noEmit   exit 0
  eslint .       exit 0
  jest --ci      N suites, M tests passed
  next build     exit 0
```

Types in use: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `build`.

## Behaviour-preserving work

A move commit changes file locations and import paths only. No logic edits, no renames of exported
symbols, no formatting sweeps. If a move cannot be completed without editing a module body, stop:
either write a characterization test first, or defer that file and say so.

## Code conventions

- Match the surrounding code's comment density. This codebase documents *why*
  — including evidence and rejected alternatives — and that convention is worth
  keeping.
- No `any`. Where the correct type is genuinely unknowable, use `unknown` with a
  narrowing guard, or a single `eslint-disable-next-line` carrying a stated
  reason and a `docs/BACKLOG.md` entry.
- Never commit `.env.local` or any real secret.

## Framework caveat

Next.js 16 differs from earlier versions in ways that trip up assumptions:
Middleware is now **Proxy** (`apps/admin/src/proxy.ts`, beside `src/app/`), `next/image` uses `preload` rather
than the deprecated `priority`, and `images.remotePatterns` hostnames are
matched as globs. Check `node_modules/next/dist/docs/` before asserting that any
framework usage is wrong. See `AGENTS.md`.
