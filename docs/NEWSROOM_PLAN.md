# TimesPrime newsroom build plan

**Status:** Proposed, 4 November 2026. Awaiting the owner's approval. Nothing in it starts until the
owner signs off (section 10).
**For:** the developers who will build it, and the owner who approves it.
**Based on:** [`PANEL_PLAN.md`](PANEL_PLAN.md) (roles, permission matrix, four-eyes and MFA rules),
[`PANEL_DOCS.md`](PANEL_DOCS.md) (what is built), `CLAUDE.md` (the rules every panel follows) and the
research report [`RESEARCH.md`](RESEARCH.md).
Where this plan differs from `PANEL_PLAN.md`, the difference is listed in section 9 for the owner to
decide. `PANEL_PLAN.md` itself is not edited.

---

## Owner ke liye short summary (Hinglish)

**Kya banega:** ek poora newsroom, end to end. Reporter admin mein story likhega (Tiptap editor),
editor review aur approve karega, story schedule ya publish hogi, aur reader site pe Hindi aur
English dono mein, Google ke liye theek tarah se dikhegi. Saath mein corrections, grievance aur
privacy, kyunki kanoonan ye launch se pehle chahiye.

**Structure:** ek repo, teen apps:

| App | Kaam |
|---|---|
| `apps/web` | Reader site |
| `apps/admin` | Saare panels |
| `apps/worker` | Background jobs |

Shared code `packages/` mein rahega. Saare panels ek admin app ke andar honge, har panel ka apna folder aur apni permissions.

**Order (har step pichhla poora hone ke baad):**

| Step | Kya | Andaazan kab |
|---|---|---|
| A | Panel 0 poora + restructure merge | Nov–Dec 2026 |
| B | Aggregator band (scraping, auto-translate, stock images) | Dec 2026 |
| C | Monorepo split (web / admin / worker) | Dec 2026 |
| D | Panel 1: users aur roles | Dec 2026 – Jan 2027 |
| E | **Panel 2: Desk (newsroom ka dil)**: Tiptap editor, workflow, approval, media, bylines | Jan – Apr 2027 |
| F | Reader site naye URLs, SEO aur Hindi `/hi/` ke saath (E ke saath parallel) | Jan – Apr 2027 |
| G | Panel 3: front page, breaking, live blog, push | Apr – May 2027 |
| H | Panel 7 aur 8 ka launch minimum: grievance, corrections, consent, rights | May 2027 |
| I | AWS infra aur staging (parallel) | Mar – May 2027 |
| J | Launch checklist | May – Jun 2027 |
| K | Launch ke baad: Panels 7–8 poore, phir 4 (wire), 5 (AI), 6 (insights), 9 (kamai) | Jun 2027 se |

**Aapko kya approve karna hai** (section 10):
- Tiptap editor
- Teen apps wala structure
- Panel order mein badlav (7 aur 8 ka minimum launch se pehle)
- Naya `stories` table
- Branch naming
- AWS staging

**Aapke kaam** (developers ke nahi):
- Naam ka trademark check
- Company aur lawyer
- Wire agency
- Editor aur reporters ki hiring
- Grievance Officer aur CERT-In contact
- Rule 18 filing

Saare dates andaaza hain, 2 developers maan ke. Zyada developers se parallel kaam (reader site, infra) tez hoga. Panels phir bhi ek-ek karke hi banenge, kyunki CLAUDE.md ka rule hai.

---

## 1. Decisions this plan builds on

Taken by the owner in conversation, or recommended by the research and proposed here for approval.

| # | Decision | Source |
|---|---|---|
| 1 | **Editor: Tiptap** (MIT core; no paid plan at first; revisions are ours, in the database) | Owner, 4 Nov 2026 |
| 2 | **Structure: one repo, three apps** (`web`, `admin`, `worker`) plus shared `packages/` | Owner, 4 Nov 2026 |
| 3 | **CMS: build our own** on the existing stack; Quintype is the fallback if the editor fails its checkpoint (Phase E) | Research D3 |
| 4 | **Aggregator off before any public traffic**: no scraped full text, no unofficial translation, no stock-photo fallbacks | Research D2 |
| 5 | **Hindi on its own URLs** (`/hi/...`), rendered on the server; written in Hindi or translated by a person | Research D4, D5 |
| 6 | **Hosting: AWS ap-south-1**, ECS Fargate behind CloudFront's flat-rate plan; worker on EventBridge + SQS | Research D6; `CLAUDE.md` |
| 7 | **Database: Supabase Mumbai**, with a custom domain, server-side reads on reader pages and log drains | Research D7 |
| 8 | **Logs:** staff actions in Supabase `audit_log`; every system log in AWS Mumbai for 365 days; the audit chain's head hash exported daily to a locked S3 bucket (BL-034) | Research; this conversation |
| 9 | **Video: YouTube first** (embeds and YouTube Live); no reader comments at launch | Research D9, D10 |
| 10 | **No deployment until the project is complete** (production); staging only with owner approval | `CLAUDE.md` |

## 2. Rules every phase follows

These come from `CLAUDE.md` and `CONTRIBUTING.md`. A phase that breaks one is not done.

- **One panel at a time.** No panel starts before the previous one is Done. Non-panel tracks (reader
  site, infra, cleanup) may run alongside, on their own branches.
- **Every panel starts with a design doc** in `docs/design/panel-N-<name>.md`, approved by the owner
  before code (as Panel 0 did).
- **Branches:** `panel-N-<name>` for a panel, `fix/<topic>` for fixes, `chore/<topic>` for tooling,
  docs and infra. Section 10 asks the owner to add `site/<topic>` for reader-site work. Push only the
  branch. Never push to `main`; the owner approves every merge.
- **A panel is Done only when all 13 items of the definition of done in `CLAUDE.md` hold.** In short:
  - Every feature works, and the `PANEL_DOCS.md` entry matches the code.
  - Every route and action checks a permission on the server, with tests for allowed and denied.
  - Privileged actions are audited and need MFA (`aal2`) where the plan says so.
  - `npm run verify` and CI are green; routes, JS and CSS are reported.
  - SQL is in migrations with a rollback, listed as an owner action.
  - `PANEL_DOCS.md`, `HANDOFF.md` and `architecture.md` are updated.
  - Real-database tests run against the local Supabase.
  - End-to-end browser tests cover the critical flows, including a refused-access flow.
  - Every screen has loading, error and empty states.
  - Accessibility is checked (keyboard, labels).
  - Failures reach Sentry.
  - A JS size budget per route is enforced in CI.
  - A runbook covers what to do when the main flow breaks.
- **Never run a migration, bootstrap or smoke test against the database `.env.local` points at.**
  Local work uses the local Supabase (Phase A).
- **Commits:** a move, a deletion or a change, never two in one commit (`CONTRIBUTING.md`).
- **The permission catalogue is generated from the matrix in `PANEL_PLAN.md`**
  (`scripts/generate-access-catalog.mjs`). A new permission therefore needs the owner to add its row
  to that matrix first. Developers do not edit `PANEL_PLAN.md`.

## 3. Target structure

```
apps/
  web/                  Reader site (Next.js 16) → the public domain
    src/app/            home, section, article, author, /hi/..., about/ownership/masthead/policies,
                        corrections, grievance and rights-request forms, robots, sitemaps, news sitemaps,
                        public APIs (/api/news/*, /api/health)
  admin/                Back office (Next.js 16) → admin subdomain; keeps the /admin and /api/admin paths
    src/proxy.ts        the optimistic session check (moved from today's src/proxy.ts)
    src/app/admin/login            staff sign-in and second factor (Panel 0)
    src/app/admin/(panels)/        layout: the nav shows only panels the user's permissions allow
      users/            Panel 1  Administration
      desk/             Panel 2  Desk
      front-page/       Panel 3  Front page
      ingestion/        Panel 4  Ingestion
      ai/               Panel 5  AI assistant
      insights/         Panel 6  Insights
      compliance/       Panel 7  Compliance
      privacy/          Panel 8  Privacy & security
      commercial/       Panel 9  Commercial
    src/app/api/admin/<panel>/...  each panel's route handlers
    src/features/<panel>/          each panel's components
  worker/               Plain Node + TypeScript, no Next.js
    src/jobs/           scheduled publish, sitemap and IndexNow pings, image renditions,
                        audit head-hash export, monthly grievance report, (later) wire ingestion
packages/
  server/               server-only (every file imports "server-only"): auth, repositories, services, lib
                        (today's src/server/)
  shared/               client-safe: config (permission catalogue, translations), types, lib
                        (today's src/config, src/types, src/lib)
  editor/               the Tiptap document schema and extensions, shared by admin (editing) and web
                        (rendering stored JSON to HTML on the server)
database/               migrations, bootstrap, seed (unchanged)
docs/  scripts/
```

Why the panels share one admin app and are not separate apps: they share the staff session, the
permission check, the audit log and the layout. Separate apps would mean separate logins and
duplicated code. Inside the app, each panel has its own route folder, components, permissions and
tests, so it can be built and reviewed on its own.

What must change when the code is split (found in today's code):

| Today | After the split |
|---|---|
| The reader's breaking banner calls `/api/admin/breaking-news` (`src/components/news/BreakingNewsBanner.tsx`) | A public read in `apps/web`; the public GET exception leaves the admin route policy |
| `src/proxy.ts` and staff sign-in live with the reader site | Only in `apps/admin`; the staff cookie is scoped to the admin subdomain; the reader site has no `/admin` |
| `/api/cron/refresh-news` is an HTTP route behind `CRON_SECRET` | A worker job started by EventBridge Scheduler |
| "Sync now" (`/api/admin/seed-supabase`) runs the whole sync inside one request | Admin enqueues a job (SQS); the worker runs it |
| The reader site holds the service-role key | Only admin and worker hold it; the reader site reads with the anon key under RLS |
| The reader's feed path writes to the database (NewsData fallback) | Removed with the aggregator (Phase B) |

## 4. Phases

Durations are estimates for two developers. "Dev 1" works the panel track, "Dev 2" the parallel
tracks. More developers shorten only the parallel tracks.

### Phase A: Finish Panel 0 and land the restructure

**Branches:** `panel-0-access`, `chore/restructure` · **Estimate:** 2–3 weeks · **Who:** Dev 1 (Panel 0), Dev 2 (local database, E2E tooling)

1. **Land `chore/restructure` first.**
   - It exists on the owner's machine and is not yet committed. It moves the code to the `src/`
     layout and removes the old restructure tooling.
   - Commit it as separate move, deletion and change commits, and push the branch.
   - The owner approves it. Merge it into `panel-0-access` (it is built on that branch's head
     `2bbec83`), so Panel 0 finishes in the new layout. Anyone with unpushed work on
     `panel-0-access` pushes it before this step.
2. **Local database.**
   - Supabase CLI stack in Docker, with a guard that refuses any run whose Supabase URL is not the
     local one (HANDOFF "Next").
   - Apply the three Panel 0 migrations and the bootstrap locally.
3. **Panel 0 definition-of-done items 7–13:**
   - `npm run test:db` (real-database tests: the two-admin trigger, the append-only and hash-chained
     audit log, including the queries that must fail);
   - Playwright end-to-end tests (staff sign-in with TOTP; a refused-access flow);
   - loading, error and empty states on `/admin` and `/admin/login`;
   - an accessibility pass;
   - the JS size budget per route in CI;
   - `runbooks/staff-access.md` run step by step against the local database.
4. **Owner approves** the Panel 0 merge into `main`.

**Done when:** Panel 0 is marked Done in `PANEL_DOCS.md`; `main` contains Panel 0 and the `src/` layout.

### Phase B: Make the product safe to be public

**Branch:** `fix/aggregator-off`, then `fix/audit-closeout` · **Estimate:** 1–2 weeks · **Who:** Dev 2

- **Turn off** scraped full text, the unofficial translate endpoint and the stock-image fallbacks
  in reader output:
  - `src/server/services/scrape/`
  - `src/server/services/translate/googleTranslate.ts`
  - `src/config/topicImages.ts`
- **Aggregated items** become headline, source, time and link with `noindex`, or are hidden (owner
  choice in section 10).
- **The chatbot** answers only from our own and licensed content, or is switched off until our own
  content exists.
- **Remove the mock-article fallback** from reader output; show an empty or stale state instead.
- **The audit close-out items** listed in HANDOFF:
  - F-028 / BL-028;
  - the local SQL checks for F-006, F-008, F-018;
  - the F-002 check;
  - BL-030 (lazy-load the chatbot).

**Done when:** a crawl of the local site finds no scraped body, no machine-translated text and no
stock fallback; verify and CI are green.

### Phase C: Split into apps and packages

**Branch:** `chore/monorepo` · **Estimate:** 1–2 weeks · **Who:** Dev 2, reviewed by Dev 1

- npm workspaces (`apps/*`, `packages/*`); no Turborepo or Nx yet.
- Move the code into the structure in section 3, with `git mv` so history follows.
- Make the changes in the "after the split" table (section 3).
- Configure each Next app to compile the workspace packages. Check the bundled Next 16 docs before
  choosing the option (`AGENTS.md`).
- Each app has its own Jest config. CI builds `web`, `admin` and `worker` separately, and reports
  routes, JS and CSS per app.
- The import rules in `eslint.config.mjs` carry over: `packages/shared` and the apps' UI never import
  `packages/server`, and every server file starts with `import "server-only"`.
- Write ADR 0005 (the apps/packages split, superseding ADR 0004's single app). Update
  `architecture.md`, `README.md`, `CONTRIBUTING.md` and `HANDOFF.md`.

**Done when:**
- `web`'s route table has no `/admin` routes, and `admin`'s has no reader pages.
- Every test passes.
- The route walk test passes in `admin`.
- The reader's JS per route is equal or smaller than before.

### Phase D: Panel 1, Administration

**Branch:** `panel-1-administration` · **Estimate:** 2–3 weeks · **Who:** Dev 1

From `PANEL_PLAN.md` and the Panel 0 "not yet built" list:
- Invite staff (public sign-up stays off).
- Grant and revoke role assignments with scope (language, section) and expiry.
- The two-admin rule for privileged roles, shown in the UI.
- Break-glass grants (time-boxed, with a reason and an alert).
- Reset a lost second factor.
- The quarterly access review.
- **Retire the shared password:** `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` go, and only the
  sealed break-glass admin remains.

**Permissions:** `user.manage` / `role.assign` (Super Admin A; Managing Editor S, assigning up to Desk Editor in own scope).

**Done when:** the definition of done holds; the shared password no longer works anywhere.

### Phase E: Panel 2, Desk (the newsroom core)

**Branch:** `panel-2-desk` · **Estimate:** 3–5 months (research estimate) · **Who:** Dev 1, with Dev 2 on the editor package after Phase C

This is the end-to-end newsroom. It starts with `docs/design/panel-2-desk.md` for owner approval.

**E1. Story model.** A new `stories` table, kept apart from the aggregator's `articles` table and
never touched by its 7-day retention. This is decision 4 in section 10: `PANEL_PLAN.md` sketched
extending `articles`.

| Table | Key columns |
|---|---|
| `stories` | id, language (en/hi), section_id, format (news, opinion, explainer, analysis, interview, live blog, gallery, video, fact-check, sponsored), workflow_state, translation_group_id, created_by, last_edited_by, approved_by, published_by, published_revision_id, scheduled_at, embargo_until, legal_hold, content_label, access, slug, published_at, updated_at |
| `story_revisions` | id, story_id, body (Tiptap JSON), headline, dek, seo fields, editor_id, is_substantive, created_at. Immutable; never updated or deleted |
| `workflow_transitions` | story_id, from_state, to_state, actor_id, reason, at (feeds the four-eyes check) |
| `story_locks` | story_id, holder_id, heartbeat_at (soft lock; "take over" is an audited action) |
| `authors`, `story_authors` | authors are separate from staff accounts (columnists, freelancers, agencies); role: byline, additional reporting, translated by |
| `sections`, `tags`, `story_tags` | the taxonomy, per language |
| `media_assets`, `asset_usages` | credit, source (staff, agency, stock, handout, social), licence, expiry, cleared_by, alt and caption in EN and HI, renditions |

Permission keys stay as the matrix names them (`article.*`), so the generated catalogue keeps working.

**E2. Editor (Tiptap), in `packages/editor` and the desk screens.**
- **Blocks:** paragraph, heading, list, link, image (from the media library), gallery, embed
  (YouTube, X, Instagram), quote, factbox, related link, ad-slot placeholder.
- **Stored as JSON.** The reader site renders it to HTML on the server with the same schema, so no
  editor code reaches readers.
- **Checkpoint, week 1:** real Hindi typists test the editor with InScript and phonetic keyboards.
  If Devanagari input fails and cannot be fixed, stop and report to the owner. The fallback is
  Quintype (research D3).
- **Checkpoint, about month 3:** if a usable Hindi and English editor with revisions is not working,
  the owner prices Quintype seriously.

**E3. Workflow.**
- **States:** `pitch → assigned → draft → in_review → desk_review → approved → scheduled → published`;
  after publication `unpublished` or `retracted`; abandoned work is `killed`. "Updated" is an event,
  not a state.
- **One permission per transition**, from the matrix:
  - `article.create`, `article.edit` (Own for Writer, now that `created_by` exists);
  - `article.submit`, `article.approve`, `article.publish`;
  - `article.publish_direct` (breaking news; opens a post-hoc review item automatically);
  - `article.unpublish` (single actor, with a reason code, MFA and a notice to the Managing Editor
    and Legal);
  - `article.restore` (A: a second approver);
  - `article.bulk_action`.
- **Four-eyes:** the approver is neither the author nor the last editor, checked on the server from
  `workflow_transitions`. Publish stays hidden until Approved (Publish Guard).
- **Schedule and embargo:** `scheduled_at` is published by the worker. `embargo_until` is enforced
  by the backend even if someone presses Publish.
- **Pre-publish checklist blocks approval** if anything is missing: headline length, alt text,
  image credit and rights, SEO title, both languages' fields where the story is bilingual, and the
  legal-review flag.
- **Revisions:** a diff between any two, and a restore to a revision.
- **Desk filters:** language, section, state, author.

**E4. Media library.** Upload, crop, credit and licence fields; publishing is blocked without credit,
alt text or rights status. Storage goes behind one interface: Supabase Storage on the local stack,
S3 Mumbai in production. The worker makes fixed renditions (16:9, 4:3, 1:1; AVIF and WebP).

**E5. Bylines.** Author records and their pages' data (photo, bio, beat, links). Agency bylines
(PTI, ANI and others) wait for a wire licence (Phase K).

**E6. Preview.** A signed preview link renders a draft on the reader site, using Next's draft mode.
Check the bundled docs first.

**Done when** two people can write, review, approve, schedule and correct one Hindi and one
English story end to end. Every action must be audited, and every allowed and denied path tested
against the local database and in the browser.

### Phase F: Reader site for original journalism (parallel with E)

**Branch:** `site/<topic>` (owner to approve the prefix) · **Estimate:** 6–8 weeks · **Who:** Dev 2

- **URLs:** English at `/`, Hindi at `/hi/`. Story URLs are `/{lang}/{section}/{slug}-{id}` and
  resolve by id, so a changed headline 301-redirects. Self-canonical on every page. Choose the
  routing pattern after reading the Next 16 internationalization docs.
- **Pages:** article (renders `stories` JSON), section, tag, author (with ProfilePage markup), home.
  Also About, Ownership, Masthead, Editorial standards, AI-use, Corrections, Grievance, Privacy and
  Terms, in EN and HI.
- **SEO:**
  - NewsArticle JSON-LD (`+05:30`, `inLanguage`);
  - NewsMediaOrganization on Home and About;
  - `robots.ts` and a sitemap index;
  - one news sitemap per language (last 2 days, at most 1,000 entries, `news:language` en or hi);
  - IndexNow pings on publish, update and unpublish (from the worker);
  - `max-image-preview:large`;
  - `<html lang>` per route, and a Devanagari font on Hindi routes.
- **Caching:** `use cache` with tags per story, section and language; `revalidateTag(tag, 'max')`
  on publish. Live data comes from small JSON endpoints polled by the browser. Read the Next 16
  caching docs first.
- **Legacy aggregator URLs** (`/article/<slug>?url=...`) return 410 or carry `noindex`.
- **Core Web Vitals:** server-rendered article HTML; reserved heights for every ad slot; the
  Lighthouse budget in CI.

**Done when** the "Launch gates" rows for SEO and Hindi (Phase J) pass locally.

### Phase G: Panel 3, Front page

**Branch:** `panel-3-front-page` · **Estimate:** 4–6 weeks · **Who:** Dev 1

- Home and section curation: pinned slots above the automatic order, with scheduled expiry
  (`homepage.curate`).
- The breaking banner gets a language, so a scoped Desk Editor can manage it
  (`breaking_banner.manage`).
- **Live blogs:**
  - a `live_updates` table, with key-event and pinned flags;
  - `LiveBlogPosting` markup;
  - the cached JSON endpoint;
  - posting to an approved live blog without four-eyes on every update.

  The permission for posting updates is decided in the Panel 3 design. If it needs a new verb, the
  owner adds it to the `PANEL_PLAN.md` matrix first.

- **Web push** for breaking news (`push.send`, tightly held, audited), through a vendor's free tier
  (OneSignal or iZooto); RSS per section and language; a "copy for WhatsApp" button.

### Phase H: Panels 7 and 8, launch minimum

**Branches:** `panel-7-compliance`, then `panel-8-privacy` · **Estimate:** 4–6 weeks for both minimums · **Who:** Dev 1

This is the change of order in section 10, decision 3. These duties apply from the first public day
(IT Rules, CERT-In), and DPDP's core duties start around 13 May 2027.

- **Panel 7 minimum:**
  - a public grievance form with ticket ids, a 24-hour acknowledgement and a 15-day clock
    (`grievance.handle`);
  - a corrections log, shown under each story and on `/corrections` (`correction.publish`), linked
    to the grievance that triggered it;
  - the monthly grievance report page (Rule 18(3));
  - a content-record export (Rule 19(3), at least 60 days);
  - a restricted legal-orders register (`legal_order.manage`).
- **Panel 8 minimum:**
  - a bilingual consent banner that blocks non-essential tags until the reader opts in;
  - a consent ledger, versioned against each version of the notice;
  - a rights-request form and queue (90-day ceiling, `dsr.handle`);
  - an incident clock (6 h CERT-In, 72 h DPDP Board, `incident.manage`);
  - the audit-log viewer (`audit.read`).
- The rest of both panels follows straight after launch (Phase K).

### Phase I: Infrastructure and staging (parallel, from about month 4)

**Branch:** `chore/infra` · **Estimate:** 4–6 weeks · **Who:** Dev 2

- **Infrastructure as code** for ap-south-1 (tool chosen in the infra design doc):
  - ECS Fargate services for `web` (2 tasks, 2 AZs) and `admin`;
  - the worker on EventBridge Scheduler and SQS with a dead-letter queue;
  - CloudFront flat-rate (Business to start) for `web`; a separate, uncached, stricter-WAF
    distribution or behaviour for `admin`;
  - S3 Mumbai for media.
- **Shared Next cache:** a Redis cache handler, with one `deploymentId` and one Server Actions key
  across tasks. On publish, both the Next cache and CloudFront are purged by cache tag.
- **Logs** (decision 8):
  - CloudFront, WAF, ALB, app stdout and CloudTrail go to CloudWatch/S3 Mumbai, kept 365 days;
  - a Supabase log drain sends Supabase's own logs to the same store;
  - the daily audit head-hash export goes to an S3 bucket with Object Lock (BL-034);
  - Sentry stays a scrubbed copy for triage only (`sendDefaultPii: false`).
- **Supabase:**
  - Pro plan in Mumbai;
  - a custom domain;
  - all reader-side data fetched on the server;
  - browser-to-Supabase calls only for admin sign-in.
- **Operations:**
  - Clock sync traceable to NIC/NPL, as CERT-In requires (confirm how on Fargate);
  - alarms on 5xx, latency and cache-hit ratio;
  - an uptime monitor from Indian locations;
  - a load test on a live-blog URL;
  - the breaking-news-mode and incident runbooks.
- **Staging on AWS** only if the owner approves (section 10, decision 7). Production waits for "the
  project is complete".

### Phase J: Launch gate

**Estimate:** 1–2 weeks · **Who:** both developers and the owner

| Gate | How it is checked |
|---|---|
| No scraped or unreviewed machine-translated content is reachable | A crawl; legacy URLs return 410 or `noindex` |
| Every story has a real byline, an author page, IST published/updated times and NewsArticle markup | Rich Results Test on sample EN and HI stories |
| Hindi has its own server-rendered URLs with `lang="hi"` and a Devanagari font | View-source of `/hi/...` |
| A news sitemap per language, robots.txt, IndexNow pings | Search Console accepts the sitemaps |
| Grievance Officer published; 15-day timer; corrections page; all policy pages in EN and HI; Rule 18 filed | Pages live; the owner's filing recorded |
| All logs in ap-south-1 for at least 365 days; NIC/NPL time; CERT-In contact named; the 6-hour runbook rehearsed | One tabletop drill |
| Consent banner blocks analytics and ads until opt-in; bilingual privacy notice; rights form | Manual test with tags blocked |
| Publish purges the Next cache and CloudFront by tag; live pages poll cached JSON; breaking-news runbook written | Load test |

### Phase K: After launch

In order, one panel at a time:

1. **Panels 7 and 8 in full:** legal-orders workflow, monthly report automation, data-rights
   workflow end to end, breach handling, `audit_verify_chain()` in the app.
2. **Panel 4, Ingestion, re-scoped as a licensed wire basket:**
   - a source registry with licence status and scope (text, photo, video; channels; languages);
   - `source.manage` and `source.kill_switch`;
   - "use as-is" with an agency byline and credit, or "rewrite" with "with inputs from";
   - the purge's two-person approval and the 60-day floor (`content.purge` A, BL-033).

   Needs a signed wire licence (owner).

3. **Panel 5, AI assistant:**
   - English↔Hindi translation drafts, always edited by a person, with a visible "translated by"
     credit;
   - headline and SEO-title suggestions, summaries, tags and alt-text drafts;
   - every output logged in `ai_generations`, and an `ai_disclosure` note on affected stories;
   - AI never changes a story's state;
   - `ai.configure` for prompts and settings.
4. **Panel 6, Insights:** a first-party page-view heartbeat; a "live now / top stories / referrer
   mix" screen (Discover, Google News, WhatsApp, push, newsletter as separate referrers); per-desk
   stats (`stats.view`).
5. **Panel 9, Commercial**, when ads or memberships exist:
   - AdSense, then Google Ad Manager;
   - Razorpay or Cashfree membership with UPI Autopay;
   - a sponsored-content workflow with a locked label (`sponsored.approve`,
     `sponsored.label_remove`), as the ASCI rules require;
   - 18% GST.
6. **Later:** daily newsletter (Amazon SES), Mux for on-site video, OpenSearch for search, Web
   Stories, comments (only with a moderation on-call rota), native apps.

## 5. Hooks to build early, because they are cheap now and costly later

Built inside the phases above (E, F, H), not as separate work:

| Hook | Phase | Why |
|---|---|---|
| `content_label` on stories (editorial, sponsored, partner) | E | ASCI labels, `rel="sponsored"`, exclusion from news sitemaps |
| `access` on stories (free, metered, members) | E | A paywall later without a schema change |
| `<AdSlot>` with reserved sizes; `ads.txt` served from a route | F | Protects CLS and LCP |
| `analytics.track()` abstraction, read behind the consent state | F, H | Swap or consent-gate tools without touching components |
| `subscriber` table with consent source and time | H | Newsletter and push under DPDP |
| GA4 BigQuery export switched on at launch | J | The export cannot be backfilled |

## 6. Timeline at a glance (estimate, two developers)

| Month (from Nov 2026) | Dev 1 (panel track) | Dev 2 (parallel tracks) |
|---|---|---|
| 0–1 | A: Panel 0 items 7–13 | A: local database, Playwright; B: aggregator off; C: monorepo |
| 1–2 | D: Panel 1 | C finish; E2 editor package; F start |
| 2–5 | E: Panel 2 Desk | F: reader site and SEO; I from month 4 |
| 5–6 | G: Panel 3 | I: infra and staging |
| 6–7 | H: Panels 7 and 8 minimum | J: launch gate preparation |
| 7+ | K: Panels 7–8 full, then 4, 5, 6, 9 | Distribution, newsletter, video |

Launch lands around **May–June 2027** if nothing slips. DPDP's core duties start around **13 May
2027**, so the privacy minimum (H) is the item that must not slip.

## 7. Owner's tasks (not developer work)

| When | Task |
|---|---|
| Now (Phase A) | Approve this plan (section 10); approve the `chore/restructure` merge; trademark search for "TimesPrime" and "TimesPrime247" (research D1) |
| Before Phase E ends | Incorporate an Indian private limited company (Indian-citizen CEO, majority-Indian board, foreign equity at most 26%); retain media-law counsel; hire an editor and the first reporters and desk editors in both languages |
| Before launch | Write the editorial standards, corrections and AI-use policies; name the Grievance Officer, the CERT-In Point of Contact and a data-protection contact; file the Rule 18 details with MIB; join a self-regulatory body; register for GST if anything is sold; open wire-agency talks |
| Each panel | Approve its design doc; apply its SQL (owner action); approve its merge |

## 8. Questions a lawyer must answer before launch

From the research (each is marked "Lawyer to confirm" there):

1. Rule 18: the deadline and the form.
2. Whether the Code of Ethics stays survived the transfer to the Delhi High Court.
3. The status of the March 2026 draft IT Rules.
4. DPDP: the penalty tiers, the notice languages, and how cookie consent is treated.
5. Whether s.52(1)(a)(iii) fair dealing covers any of the current model.
6. NewsData.io's redistribution terms, and the AI/RAG clauses in any wire contract.
7. Whether CloudFront edge logs and SaaS-held logs must be copied into India, and the s.70B(7)
   penalty.
8. Reporting restrictions for the newsroom: BNS s.72, POCSO, JJ Act, contempt.
9. GST after September 2025, and the FDI conditions since 2020.
10. The trademark search.

## 9. Where this plan differs from PANEL_PLAN.md

`PANEL_PLAN.md` is the owner's reference and is not edited by developers. These differences need the
owner's decision:

| # | `PANEL_PLAN.md` says | This plan proposes | Why |
|---|---|---|---|
| 1 | Panels in the order 0–9; Compliance in phase 3 | Panels 7 and 8 launch minimum before launch, right after Panel 3; Panel 4 (Ingestion) after launch | Grievance, corrections and CERT-In apply from the first public day; DPDP core duties start about 13 May 2027, close to launch |
| 2 | Extend `articles` with workflow columns (data model sketch) | A new `stories` table; `articles` stays the aggregator's | `articles` has a 7-day retention index and no author, state or revision columns; originals must be kept permanently |
| 3 | Ingestion: NewsData sync, source registry with scraped/full-text flags | A licensed wire basket; no scraped full text at all | Copyright and Google spam-policy risk (research D2) |
| 4 | The layer table names `app/`, `backend/`, `shared/` | `apps/admin`, `apps/web`, `packages/server`, `packages/shared` | The new structure; the responsibilities are unchanged |

## 10. Owner sign-off

Approving this plan approves the items below. Mark each one.

| # | Item | Approve? |
|---|---|---|
| 1 | Tiptap as the editor | ☐ |
| 2 | One repo, three apps (`web`, `admin`, `worker`) and `packages/` (section 3) | ☐ |
| 3 | Panel order: 0 → 1 → 2 → 3 → 7 (minimum) → 8 (minimum) → launch → 7–8 full → 4 → 5 → 6 → 9 | ☐ |
| 4 | A new `stories` table for original journalism | ☐ |
| 5 | Branch prefix `site/<topic>` for reader-site work (to be added to `CLAUDE.md`) | ☐ |
| 6 | Aggregator items after Phase B: (a) headline + source + link with `noindex`, or (b) hidden entirely | ☐ a  ☐ b |
| 7 | A staging environment on AWS before the project is complete | ☐ |
| 8 | Hindi at `/hi/` on the same domain | ☐ |
| 9 | The phases and their order (section 4) | ☐ |

Once approved, the developers start with Phase A, and each panel still begins with its own design
doc for the owner's approval.
