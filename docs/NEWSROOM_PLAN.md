# TimesPrime newsroom build plan

**Status:** Approved by the owner, 4 November 2026 (section 10). **On `main` since 4 Nov 2026**
(`chore/integrate`, the owner's "push everything to main"): this plan, the apps/packages split and
Panel 0's second half joined the release's `main` in one pull request. **The release goes first**
(Progress, row 0): `release/v1` continues on this layout, at the owner's senior's request, and the
panel phases wait for it. Hosting is **AWS** (owner, 4 Nov 2026), which replaces the release's R0
choice of Vercel.
**For:** the developers who will build it, and the owner who approves it.
**Based on:** [the access rules](PANEL_DOCS.md#access-rules) (roles, permission matrix, four-eyes and MFA rules),
[`PANEL_DOCS.md`](PANEL_DOCS.md) (what is built), `CLAUDE.md` (the rules every panel follows) and the
research report [`RESEARCH.md`](RESEARCH.md).
Section 9 records what this plan changed from the earlier plan (`PANEL_PLAN.md`, retired the same
day; its matrix and rules are the access rules in `PANEL_DOCS.md`).

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

**Abhi ka order (owner, 4 Nov 2026):** ye plan, teen apps wala structure aur Panel 0 ab `main` pe hain. Pehle Vivek ka `release/v1` poora hoga (hosting **AWS** pe), naye structure pe hi. Uske baad neeche ke steps shuru honge.

**Order (har step pichhla poora hone ke baad):**

| Step | Kya | Andaazan kab |
|---|---|---|
| A | Panel 0 poora + restructure merge | Nov–Dec 2026 |
| B | Aggregator band (scraping, auto-translate, stock images) | Dec 2026 |
| C | Monorepo split (web / admin / worker) | **Ho gaya**, 4 Nov 2026 |
| D | Panel 1: users aur roles | Dec 2026 – Jan 2027 |
| E | **Panel 2: Desk (newsroom ka dil)**: Tiptap editor, workflow, approval, media, bylines | Jan – Apr 2027 |
| F | Reader site naye URLs, SEO aur Hindi `/hi/` ke saath (E ke saath parallel) | Jan – Apr 2027 |
| G | Panel 3: front page, breaking, live blog, push | Apr – May 2027 |
| H | Panel 7 aur 8 ka launch minimum: grievance, corrections, consent, rights | May 2027 |
| I | AWS infra aur staging (parallel) | Mar – May 2027 |
| J | Launch checklist | May – Jun 2027 |
| K | Launch ke baad: Panels 7–8 poore, phir 4 (wire), 5 (AI), 6 (insights), 9 (kamai) | Jun 2027 se |

**Aapne approve kiya** (4 Nov 2026, section 10). Sirf aggregator wala option (a ya b) baaki hai:
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

## Progress

Update this table at the end of every phase, in the same piece of work. The current phase is the
first one that is not Done.

| Phase | Status | Where |
|---|---|---|
| 0. Release v1 (Vivek, on `main`) | **In progress, goes first.** R0 done; R1 waits on four owner values, now on AWS instead of Vercel and on the apps/packages layout. The panel phases wait for it | branches from `main` |
| A. Finish Panel 0, port this plan onto `main` | **Step 1 done** (4 Nov 2026): this plan, the access rules, the research, the split and Panel 0's second half reached `main` through `chore/integrate`. **After the release:** step 3's owner check, then step 4 | `chore/integrate` (merged), then `panel-0-access` work on a branch from `main` |
| B. Make the product safe to be public | Not started | `fix/aggregator-off`, `fix/audit-closeout` |
| C. Split into apps and packages | **Done** (4 Nov 2026), on `main` since `chore/integrate` | `chore/restructure`, `chore/integrate` |
| D. Panel 1, Administration | Not started | `panel-1-administration` |
| E. Panel 2, Desk | Not started | `panel-2-desk` |
| F. Reader site for original journalism | Not started | `site/<topic>` |
| G. Panel 3, Front page | Not started | `panel-3-front-page` |
| H. Panels 7 and 8, launch minimum | Not started | `panel-7-compliance`, `panel-8-privacy` |
| I. Infrastructure and staging | Not started | `chore/infra` |
| J. Launch gate | Not started | — |
| K. After launch | Not started | — |

## 1. Decisions this plan builds on

Taken by the owner in conversation, or recommended by the research and proposed here for approval.

| # | Decision | Source |
|---|---|---|
| 1 | **Editor: Tiptap** (MIT core; no paid plan at first; revisions are ours, in the database) | Owner, 4 Nov 2026 |
| 2 | **Structure: one repo, three apps** (`web`, `admin`, `worker`) plus shared `packages/` | Owner, 4 Nov 2026 |
| 3 | **CMS: build our own** on the existing stack; Quintype is the fallback if the editor fails its checkpoint (Phase E) | Research D3 |
| 4 | **Aggregator off before any public traffic**: no scraped full text, no unofficial translation, no stock-photo fallbacks | Research D2 |
| 5 | **Hindi on its own URLs** (`/hi/...`), rendered on the server; written in Hindi or translated by a person | Research D4, D5 |
| 6 | **Hosting: AWS ap-south-1**, ECS Fargate behind CloudFront's flat-rate plan; worker on EventBridge + SQS. Confirmed by the owner on 4 Nov 2026 over the release's R0 choice (Vercel Pro, `bom1`), so the release's hosting work (R1) moves to AWS too | Research D6; owner, 4 Nov 2026 |
| 7 | **Database: Supabase Mumbai**, with a custom domain, server-side reads on reader pages and log drains | Research D7 |
| 8 | **Logs:** staff actions in Supabase `audit_log`; every system log in AWS Mumbai for 365 days; the audit chain's head hash exported daily to a locked S3 bucket (BL-034) | Research; this conversation |
| 9 | **Video: YouTube first** (embeds and YouTube Live); no reader comments at launch | Research D9, D10 |
| 10 | **A deployment now:** the release (`release/v1`, R0–R4), at the owner's senior's request, on AWS; staging only with owner approval | Owner, 2 and 4 Nov 2026 (`CLAUDE.md`) |

## 2. Rules every phase follows

These come from `CLAUDE.md`, `docs/README.md` and the definition of done in `docs/PANEL_DOCS.md`. A
phase that breaks one is not done.

- **One panel at a time.** No panel starts before the previous one is Done. Non-panel tracks (reader
  site, infra, cleanup) may run alongside, on their own branches.
- **Every panel starts with a design**, a section of `docs/PANEL_DOCS.md` ("Panel N design"),
  approved by the owner before code (as Panel 0 did).
- **Branches:** `panel-N-<name>` for a panel, `site/<topic>` for reader-site work, `fix/<topic>` for
  fixes, `chore/<topic>` for tooling, docs and infra (all in `CLAUDE.md`). Push only the branch. Never push to `main`; the owner approves every merge.
- **A panel is Done only when all 13 items of the definition of done in `docs/PANEL_DOCS.md` hold.** In short:
  - Every feature works, and the `PANEL_DOCS.md` entry matches the code.
  - Every route and action checks a permission on the server, with tests for allowed and denied.
  - Privileged actions are audited and need MFA (`aal2`) where the plan says so.
  - `npm run verify` and CI are green; routes, JS and CSS are reported.
  - SQL is in migrations with a rollback, listed as an owner action.
  - `PANEL_DOCS.md`, the current status in `OPERATIONS.md` and `ARCHITECTURE.md` are updated.
  - Database tests against the real database are read-only; the owner verifies the database's own
    rules (triggers, the audit hash chain, the bootstrap) with the runbook.
  - End-to-end browser tests cover the critical flows, including a refused-access flow.
  - Every screen has loading, error and empty states.
  - Accessibility is checked (keyboard, labels).
  - Failures reach Sentry.
  - A JS size budget per route is enforced in CI.
  - A runbook covers what to do when the main flow breaks.
- **Never write to the database yourself** (owner, 2026-11-02): no SQL, migrations, bootstrap, test
  users, destructive tests or worker jobs. Schema changes are owner actions in a runbook. There is
  no local database: the one the env file names is the real one.
- **Commits:** a move, a deletion or a change, never two in one commit (`docs/README.md`).
- **The permission catalogue is generated from the matrix in the access rules (`PANEL_DOCS.md`)**
  (`scripts/generate-access-catalog.mjs`). A new or changed permission is proposed in the panel's
  design; after the owner approves it, the row goes into the access rules (`PANEL_DOCS.md`), the SQL is
  regenerated and it ships as a new migration.

## 3. Target structure

This is the structure in the code since 4 Nov 2026 (Phase C, [ADR 0006](ARCHITECTURE.md#adr-0006--three-apps-over-shared-packages-2026-11-04)).
Folders marked *later* are created by the phase that first needs them.

```
apps/
  web/                  Reader site (Next.js 16) → the public domain, port 3000 locally
    src/app/            home, article, about, contact, privacy, terms, saved; public APIs
                        (/api/news/*, /api/chat, /api/translate, /api/health). Later: section, author,
                        /hi/..., policy pages, corrections, grievance and rights forms, robots, sitemaps
  admin/                Back office (Next.js 16) → admin subdomain, port 3001; keeps /admin and /api/admin
    src/proxy.ts        the optimistic session check
    src/app/admin/login staff sign-in and second factor (Panel 0)
    src/app/admin/      today: the Panel 0 dashboard. Later, one route folder per panel, the nav
                        showing only panels the user's permissions allow:
      users/            Panel 1  Administration
      desk/             Panel 2  Desk
      front-page/       Panel 3  Front page
      ingestion/        Panel 4  Ingestion
      ai/               Panel 5  AI assistant
      insights/         Panel 6  Insights
      compliance/       Panel 7  Compliance
      privacy/          Panel 8  Privacy & security
      commercial/       Panel 9  Commercial
    src/app/api/admin/  every admin route handler; later grouped by panel
    src/components/     today's dashboard widgets and AdminTopBar
    src/features/<panel>/   later: each panel's components
  worker/               Plain Node + TypeScript (tsx), no Next.js
    src/jobs.ts         the jobs by name. Today: refresh-news. Later: scheduled publish, sitemap and
                        IndexNow pings, image renditions, audit head-hash export, monthly grievance
                        report, wire ingestion
packages/
  server/               @timesprime/server: server-only (every file imports "server-only"): auth,
                        repositories, services, lib
  shared/               @timesprime/shared: client-safe config (permission catalogue, translations),
                        types, lib
  ui/                   @timesprime/ui: React both apps use (ThemeContext; later shared primitives)
  editor/               later (Panel 2): the Tiptap document schema and extensions, shared by admin
                        (editing) and web (rendering stored JSON to HTML on the server)
database/               migrations, bootstrap, seed
docs/  scripts/
```

Why the panels share one admin app and are not separate apps: they share the staff session, the
permission check, the audit log and the layout. Separate apps would mean separate logins and
duplicated code. Inside the app, each panel has its own route folder, components, permissions and
tests, so it can be built and reviewed on its own.

What the split changed, and what it left for later:

| Before the split | Now | Status |
|---|---|---|
| The reader's breaking banner called `/api/admin/breaking-news` | It reads `apps/web`'s public `GET /api/news/breaking-news`; the admin GET needs `breaking_banner.manage` | Done |
| The proxy and staff sign-in lived with the reader site | Only in `apps/admin`; the reader site has no `/admin`. The staff cookie's scoping to the admin subdomain comes with the domains (Phase I) | Done |
| `/api/cron/refresh-news`, an HTTP route behind `CRON_SECRET`, scheduled by `vercel.json` | The worker's `refresh-news` job; `vercel.json` and `CRON_SECRET` are gone. EventBridge starts it in Phase I | Done |
| "Sync now" (`/api/admin/seed-supabase`) runs the whole sync inside one request | Admin enqueues a job (SQS) and the worker runs it | Phase I (needs the queue) |
| The reader site holds the service-role key | Only admin and worker hold it; the reader site reads with the anon key under RLS | After Phase B (the reader's feed path still writes, through the NewsData fallback) |
| Audit rows take their request id from `x-vercel-id` | The load balancer's trace id | Phase I |

## 4. Phases

Durations are estimates for two developers. "Dev 1" works the panel track, "Dev 2" the parallel
tracks. More developers shorten only the parallel tracks.

### Phase A: Finish Panel 0 and land the restructure

**Branches:** `panel-0-access`, `chore/restructure`, `chore/integrate` · **Estimate:** 2–3 weeks · **Who:** Dev 1 (Panel 0), Dev 2 (E2E tooling)

1. **Land `chore/restructure` first.** *Done, 4 Nov 2026:* the `src/` layout, the cleanup, the
   retirement of the old plans and the Phase C split were committed on `chore/restructure`, as
   separate move, deletion, change and docs commits. `chore/integrate` then merged Panel 0's second
   half (`panel-0-access`) into that layout, and `main` (the release and its four-folder
   restructure) with it, and reached `main` by pull request. Panel 0 finishes in the new layout
   (`docs/ARCHITECTURE.md` §4 maps every folder).
2. **Local database: dropped** (owner, 2026-11-02, on `panel-0-access`). There is no local
   database: the env file names the real one, which a session never writes to. The owner applies
   the three Panel 0 migrations and the bootstrap, and verifies the database's own rules, with
   Part B of the staff-access runbook.
3. **Panel 0 definition-of-done items 7–13:**
   - the database's own rules (the two-admin trigger, the append-only and hash-chained audit log,
     including the queries that must fail): verified by the owner with the staff-access runbook,
     Part B, instead of `npm run test:db` (item 7 as the owner set it on 2026-11-02);
   - Playwright end-to-end tests, read-only (a refused-access flow; staff sign-in is the owner's
     runbook check, since a test that signs in writes to the database): *done*;
   - loading, error and empty states on `/admin` and `/admin/login`: *done*;
   - an accessibility pass: *done*;
   - the JS size budget per route in CI: *done*;
   - a runbook for when sign-in breaks: *done*.
   What is done and what is not, item by item, is in `docs/PANEL_DOCS.md` (Panel 0, "Tests and
   verification").
4. **Owner approves** the Panel 0 merge into `main`.

**Done when:** Panel 0 is marked Done in `PANEL_DOCS.md`; `main` contains Panel 0 and the apps/packages layout.

### Phase B: Make the product safe to be public

**Branch:** `fix/aggregator-off`, then `fix/audit-closeout` · **Estimate:** 1–2 weeks · **Who:** Dev 2

- **Turn off** scraped full text, the unofficial translate endpoint and the stock-image fallbacks
  in reader output:
  - `packages/server/src/services/scrape/`
  - `packages/server/src/services/translate/googleTranslate.ts`
  - `packages/shared/src/config/topicImages.ts`
- **Aggregated items** become headline, source, time and link with `noindex`, or are hidden (owner
  choice in section 10).
- **The chatbot** answers only from our own and licensed content, or is switched off until our own
  content exists.
- **Remove the mock-article fallback** from reader output; show an empty or stale state instead.
- **The audit close-out items** listed in the current status (`docs/OPERATIONS.md`):
  - F-028 / BL-028;
  - the local SQL checks for F-006, F-008, F-018;
  - the F-002 check;
  - BL-030 (lazy-load the chatbot).

**Done when:** a crawl of the local site finds no scraped body, no machine-translated text and no
stock fallback; verify and CI are green.

### Phase C: Split into apps and packages

**Status: Done**, 4 Nov 2026, on `chore/restructure`, ahead of Phases A and B at the owner's
instruction. [ADR 0006](ARCHITECTURE.md#adr-0006--three-apps-over-shared-packages-2026-11-04) records it.

- npm workspaces (`apps/*`, `packages/*`); no Turborepo or Nx. All dependencies in the root
  `package.json`.
- Every file moved with `git mv`; packages are imported by name through their `exports`.
- The admin app has its own layout and top bar; the worker runs `refresh-news`.
- One Jest run with a project per app and one for the packages; one ESLint config whose zones keep
  apps and packages apart, each proven by a deliberate violation.
- Measured: `/admin` client JS 163,762 → 80,206 bytes; every reader route equal or smaller; the
  reader's CSS 93,939 → 83,122 bytes. 50 suites, 753 tests.

**Left for later** (the "Status" column of the table in section 3): "Sync now" through a queue,
the anon key on the reader site, the request id, `packages/editor` (with Panel 2), and moving the
two apps' shared base CSS into `packages/ui`.

### Phase D: Panel 1, Administration

**Branch:** `panel-1-administration` · **Estimate:** 2–3 weeks · **Who:** Dev 1

From the access rules (`PANEL_DOCS.md`) and the Panel 0 "not yet built" list:
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

This is the end-to-end newsroom. It starts with a Panel 2 design in `docs/PANEL_DOCS.md`, for owner approval.

**E1. Story model.** A new `stories` table, kept apart from the aggregator's `articles` table and
never touched by its 7-day retention. Section 10, item 4; the earlier plan sketched
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
with the database mocked and, read-only, in the browser; the owner checks the flow against the real
database with the panel's runbook.

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

  The permission for posting updates is decided in the Panel 3 design. If it needs a new verb, it
  goes into the the access rules (`PANEL_DOCS.md`) matrix once the owner approves it.

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
| 0–1 | A: Panel 0 items 7–13 | A: Playwright (done); B: aggregator off; C: monorepo (done) |
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
| Now (Phase A) | Approve this plan (section 10; done); approve the `chore/integrate` merge into `main`; move the real env file to the root as `.env`; trademark search for "TimesPrime" and "TimesPrime247" (research D1) |
| Before Phase E ends | Incorporate an Indian private limited company (Indian-citizen CEO, majority-Indian board, foreign equity at most 26%); retain media-law counsel; hire an editor and the first reporters and desk editors in both languages |
| Before launch | Write the editorial standards, corrections and AI-use policies; name the Grievance Officer, the CERT-In Point of Contact and a data-protection contact; file the Rule 18 details with MIB; join a self-regulatory body; register for GST if anything is sold; open wire-agency talks |
| Each panel | Approve its design; apply its SQL (owner action); approve its merge |

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

## 9. What this plan changed from the earlier plan

These changes from the retired `PANEL_PLAN.md` were approved with this plan on 4 Nov 2026:

| # | `PANEL_PLAN.md` said | This plan | Why |
|---|---|---|---|
| 1 | Panels in the order 0–9; Compliance in phase 3 | Panels 7 and 8 launch minimum before launch, right after Panel 3; Panel 4 (Ingestion) after launch | Grievance, corrections and CERT-In apply from the first public day; DPDP core duties start about 13 May 2027, close to launch |
| 2 | Extend `articles` with workflow columns (data model sketch) | A new `stories` table; `articles` stays the aggregator's | `articles` has a 7-day retention index and no author, state or revision columns; originals must be kept permanently |
| 3 | Ingestion: NewsData sync, source registry with scraped/full-text flags | A licensed wire basket; no scraped full text at all | Copyright and Google spam-policy risk (research D2) |
| 4 | The layer table names `app/`, `backend/`, `shared/` | `apps/admin`, `apps/web`, `packages/server`, `packages/shared` | The new structure; the responsibilities are unchanged |

## 10. Owner sign-off

The owner approved the plan in conversation on 4 Nov 2026 ("is plan ke according hi sab kuch karna
hai"). Item 6 still needs the owner's choice; until then aggregated items are hidden (option b, the
safer one).

| # | Item | Status |
|---|---|---|
| 1 | Tiptap as the editor | Approved |
| 2 | One repo, three apps (`web`, `admin`, `worker`) and `packages/` (section 3) | Approved |
| 3 | Panel order: 0 → 1 → 2 → 3 → 7 (minimum) → 8 (minimum) → launch → 7–8 full → 4 → 5 → 6 → 9 | Approved |
| 4 | A new `stories` table for original journalism | Approved |
| 5 | Branch prefix `site/<topic>` for reader-site work (to be added to `CLAUDE.md`) | Approved |
| 6 | Aggregator items after Phase B: (a) headline + source + link with `noindex`, or (b) hidden entirely | **Pending:** owner to choose (a) or (b) |
| 7 | A staging environment on AWS before the project is complete | Approved |
| 8 | Hindi at `/hi/` on the same domain | Approved |
| 9 | The phases and their order (section 4) | Approved |

Each panel still begins with its own design doc for the owner's approval.
