# Contributing

## Where does new code go?

Rule IDs are defined in [`docs/architecture.md` §5](docs/architecture.md#5-import-rules). Each one
fails `npm run lint` and `npm run check:boundaries`, naming the rule.

| Adding | Code goes in | Others import it from | File in `app/` | Fails if wrong |
|---|---|---|---|---|
| A page, e.g. `/faq` | `frontend/views/faq/FaqView.tsx`: a default export, plus `metadata` | — | `app/faq/page.tsx`, one line, like `app/about/page.tsx`: `export { default, metadata } from "@/frontend/views/faq/FaqView";` | F1 if the view imports `backend/`; V1 if a feature imports the view |
| A page that needs server data | The view, as above. The fetch stays in the page | — | `app/<path>/page.tsx` fetches and passes props, like `app/page.tsx` (`fetchInitialNews` → `HomeClient`) | F1 if the view fetches through `backend/` itself |
| An API route, e.g. `GET /api/news/trending` | `backend/api/news/trending.ts`, opening with `import "server-only";` | — | `app/api/news/trending/route.ts`, one line: `export { GET } from "@/backend/api/news/trending";`, plus literal segment config if needed | A2 if the route file holds code; F1 if the guard is missing; B1 if it imports `frontend/` |
| A frontend feature, e.g. polls | `frontend/features/polls/`, with an `index.ts` and a `package.json` of `{ "sideEffects": false }` | `@/frontend/features/polls`, its `index.ts`, and nothing deeper | — (views and `app/` import the entry point) | X1 if anything imports past `index.ts`, or one feature imports another; V1 if it imports a view |
| A backend service, e.g. digest | `backend/services/digest/`, each module opening with `import "server-only";` | an `index.ts` once others use more than one module, like `@/backend/services/news` | — (route bodies in `backend/api/` import it) | X1 if one service imports another, or anything imports past an `index.ts` |
| A database query | `backend/repositories/` (`db.ts` holds the article queries), using `supabase` from `@/backend/lib/supabase` | the owning service's `index.ts`, as `services/news/index.ts` re-exports `getDBStats` | — | F1 if a component queries Supabase; LIB if the query goes in `backend/lib/` |
| A schema change | An SQL file in `database/`, which the owner applies by hand | — (nothing imports it) | — | D1 if code imports it |
| A type both sides use | `shared/types/index.ts` | `@/shared/types` | — | R7 if it imports anything but types |
| A config value both sides use | `shared/config/<name>.ts`. An image host goes in `ALLOWED_IMAGE_HOSTNAMES` (`shared/config/imageDomains.ts`; 49 of the 50 slots are used) | `@/shared/config/<name>` | — | R7 if it imports React, `server-only` or code; CR-06 if `imageDomains.ts` imports anything; R5 if a UI primitive imports it |

Three things no check catches:

- **Admin routes go under `/api/admin/`, admin pages under `/admin/`.** `proxy.ts` gates exactly
  those paths, and anything outside them is public ([`docs/architecture.md`](docs/architecture.md)
  §1).
- **Code that one side uses stays on that side.** `shared/` is for what both sides import. A
  backend-only constant lives in its service.
- **A2 does not check a new page's file.** A2 covers every `route.ts` and the pages that moved in
  restructure 2. Keep a new page file to its one-line re-export unless it composes server data.

## The verify gate

Every commit must leave the tree green:

```bash
npm run verify     # typecheck -> lint -> check:boundaries -> test -> build
```

All five, not a subset. They catch different classes of problem:

| Command | What it alone catches |
|---|---|
| `tsc --noEmit` | Unresolved imports after a file move; type regressions |
| `eslint` | Imports left **behind** after a move — unused, still referenced, now dead — and every import that breaks a boundary rule (`eslint.boundaries.mjs`, `docs/architecture.md` §5) |
| `check:boundaries` | A client module reaching `backend/` **transitively**, through modules that look harmless — which lint, checking one import at a time, cannot see |
| `jest` | Behaviour changes in the thin slice that has coverage |
| `next build` | Route resolution, config evaluation, server/client boundary violations |

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
Middleware is now **Proxy** (`proxy.ts`, at the repository root), `next/image` uses `preload` rather
than the deprecated `priority`, and `images.remotePatterns` hostnames are
matched as globs. Check `node_modules/next/dist/docs/` before asserting that any
framework usage is wrong. See `AGENTS.md`.
