# Contributing

## The verify gate

Every commit must leave the tree green:

```bash
npm run verify     # typecheck -> lint -> test -> build
```

All four, not a subset. They catch different classes of problem, and during the
ongoing restructure each one is load-bearing:

| Command | What it alone catches |
|---|---|
| `tsc --noEmit` | Unresolved imports after a file move; type regressions |
| `eslint` | Imports left **behind** after a move — unused, still referenced, now dead |
| `jest` | Behaviour changes in the thin slice that has coverage |
| `next build` | Route resolution, config evaluation, server/client boundary violations |

If a change cannot go green, revert it and report why. Do not stack fixes on a
red tree — the second fix hides what the first one broke.

## Commit convention

**A commit is either a move or a change. Never both.**

Use `git mv` so history follows the file. A move commit may also fix the import
paths and path references that the move invalidated — that is part of the move,
not a separate change. It may not fix anything else.

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

During the restructure, a refactor commit changes file locations and import
paths only. No logic edits, no renames of exported symbols, no formatting
sweeps. If a move cannot be completed without editing a module body, stop:
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
Middleware is now **Proxy** (`src/proxy.ts`), `next/image` uses `preload` rather
than the deprecated `priority`, and `images.remotePatterns` hostnames are
matched as globs. Check `node_modules/next/dist/docs/` before asserting that any
framework usage is wrong. See `AGENTS.md`.
