# Architecture

> **Status: partial.** The target structure and the move map are designed in
> Phase 3 and recorded here, gated on approval. The import rules below are the
> intended end state, written down now so Phase 3 has something concrete to
> refine rather than invent.

## Today

```
src/
  app/          routing — pages, layouts, route handlers
  components/   all React components, flat, including admin/
  context/      Theme and Language providers
  lib/          everything else: db, supabase, auth, cache, filters, config data
  types/        shared types
db/             schema.sql · policies.sql
scripts/        one-off operational scripts
```

The weakness is `lib/`: it currently mixes data access (`db.ts`, `supabase.ts`),
security primitives (`adminSession.ts`, `urlValidation.ts`), cross-cutting
infrastructure (`cache.ts`, `rateLimit.ts`), domain logic
(`categoryClassifier.ts`, `newsConfig.ts`) and static config data
(`imageDomains.ts`, `categoryColors.ts`, `topicImages.ts`). Nothing marks which
of those a given file is, so nothing stops a component from importing any of
them.

## Framework constraints

These are fixed by Next.js 16 and are not design choices:

- Files under `src/app/**` named `page`, `layout`, `route`, `loading` or `error`
  **are** the routing table. They do not move. Route groups `(name)` and private
  folders `_name` reorganize without changing a URL.
- `src/proxy.ts` is the Proxy entrypoint — Next 16's rename of Middleware. It is
  location-pinned.
- `src/instrumentation.ts`, `src/instrumentation-client.ts` and
  `src/sentry.*.config.ts` are location-pinned conventions.
- `next.config.ts` imports `ALLOWED_IMAGE_HOSTNAMES` from
  `src/lib/imageDomains.ts` and evaluates it at **config-load time**. That module
  must never import React or `server-only`. If it moves, the config import moves
  in the same commit.
- `vercel.json` pins the cron to `/api/cron/refresh-news`. That path must survive.

## Target import rules (Phase 3 onward)

Each feature exposes exactly one public surface, `features/<name>/index.ts`.

- Nothing imports **across** feature boundaries.
- Features import only **downward**: into `components/ui`, `lib`, `server`,
  `config`.
- Nothing reaches **past** a feature's `index.ts` into its internals.

If two features need the same thing, it moves **down** into a shared layer. It
does not get imported sideways. Sideways imports are how a feature-first
structure quietly collapses back into a ball of mud within a month, which is why
Phase 5 makes this rule machine-enforced rather than documented-and-hoped-for.

## Decision records

Significant structural decisions, and the alternatives rejected, live in
[`adr/`](adr/).
