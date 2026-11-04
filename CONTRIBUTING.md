# Contributing

## Where does new code go?

The import rules are in [`docs/architecture.md` §5](docs/architecture.md#5-import-rules); `npm run
lint` fails an import that breaks one, naming why.

| Adding | Where | Example to copy |
|---|---|---|
| A page, e.g. `/faq` | `src/app/faq/page.tsx`: the page's code, a default export, plus `metadata` | `src/app/about/page.tsx` |
| A page that needs server data | `src/app/<path>/page.tsx` fetches by calling `src/server/` directly (never its own API over HTTP) and passes props to a component in `src/components/` | `src/app/page.tsx` (`fetchInitialNews` → `HomeClient`) |
| An API route, e.g. `GET /api/news/trending` | `src/app/api/news/trending/route.ts`: parse the request, call `src/server/`, return the response. Logic goes in a service | `src/app/api/news/top-headlines/route.ts` |
| A component | `src/components/<area>/<Name>.tsx`, imported from its own file (no `index.ts` barrels) | `src/components/news/ArticleCard.tsx` |
| Server logic, e.g. a digest | `src/server/services/digest/`, each file opening with `import "server-only";` | `src/server/services/news/topHeadlines.ts` |
| A database query | `src/server/repositories/` (`db.ts` holds the article queries), using `supabase` from `@/server/lib/supabase` | `getDBStats` in `db.ts` |
| A schema change | A migration in `database/migrations/` with its rollback, which the owner applies by hand | `database/migrations/2026-11-02-indexes.sql` |
| A helper both sides use | `src/lib/<name>.ts`; it must not import `src/server/` | `src/lib/urlValidation.ts` |
| A type both sides use | `src/types/index.ts` | — |
| A config value both sides use | `src/config/<name>.ts`. An image host goes in `ALLOWED_IMAGE_HOSTNAMES` (`src/config/imageDomains.ts`; 49 of the 50 slots are used) | `src/config/newsConfig.ts` |

Tests sit beside what they test: `route.test.ts` next to `route.ts`, `page.test.tsx` next to
`page.tsx`.

Two things no check catches:

- **Admin routes go under `/api/admin/`, admin pages under `/admin/`.** `src/proxy.ts` gates exactly
  those paths, and anything outside them is public ([`docs/architecture.md`](docs/architecture.md)
  §1). Each admin route calls `requirePermission` first, with its rule from
  `src/server/auth/adminRoutePolicy.ts` (the only gate on the data: the app reads Supabase as
  service_role). A new route or method that is not in that file fails the route walk in
  `src/app/api/admin/access.test.ts`, and needs its row in that test's access matrix.
- **Code that one side uses stays on that side.** `src/lib`, `src/config` and `src/types` are for
  what both sides import. A server-only constant lives in its service.

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
| `next build` | Route resolution, config evaluation, and a client module reaching `src/server/` **transitively** (the `server-only` guard), which lint, checking one import at a time, cannot see |

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
Middleware is now **Proxy** (`src/proxy.ts`, beside `src/app/`), `next/image` uses `preload` rather
than the deprecated `priority`, and `images.remotePatterns` hostnames are
matched as globs. Check `node_modules/next/dist/docs/` before asserting that any
framework usage is wrong. See `AGENTS.md`.
