# Back-office panels

This file records what the back office can do, panel by panel, and who is allowed to do it. The
plan behind it is [`PANEL_PLAN.md`](PANEL_PLAN.md): the panels, the 15 roles, the permission
matrix, the four-eyes and MFA rules, and the data model. That file says what to build. This file
says what has been built, and it must match the code.

The panels are built **one at a time**. A panel is finished (backend, screens, permissions, tests
and docs) before the next one starts. Panel 0 comes first because every other panel depends on it.
When a panel is done, its section below is filled in from the template and the index is updated in
the same piece of work.

## Index

| # | Panel | Status | Date completed | Commits |
|--:|---|---|---|---|
| 0 | Access foundation: staff accounts, roles, permissions, MFA, audit log, the permission check | **In progress**, paused for `release/v1` on `panel-0-access`: built and tested with mocks; its database-level checks are unverified (the owner verifies them against the real database when panels resume) | — | `e9bce19`..`f357d71` on `main`, the rest on the branch; [list](#commits) |
| 1 | Administration: users, role assignments with scope and expiry, access review | Planned | — | — |
| 2 | Desk: articles (write, review, approve, publish, unpublish) | Planned | — | — |
| 3 | Front page: breaking banner, pinned slots, curation | Planned | — | — |
| 4 | Ingestion: sync, source registry, licence controls, kill switch, purge | Planned | — | — |
| 5 | AI assistant | Planned | — | — |
| 6 | Insights: read-only stats | Planned | — | — |
| 7 | Compliance: grievances, corrections, legal orders, content records | Planned | — | — |
| 8 | Privacy & security: data-rights requests, incidents, audit viewer | Planned | — | — |
| 9 | Commercial: only once ads or subscriptions exist | Planned | — | — |

**Status:** *Planned* means not started. *In progress* means design or code has started. *Done*
means every item in the definition of done holds (`CLAUDE.md`, "Back-office panels"). A panel is
never marked Done while an owner action it depends on is unrecorded.

## Words used in this file

| Word | Meaning |
|---|---|
| Permission | One action on one kind of thing, written as `object.verb`, for example `article.publish`. The full list is the matrix in `PANEL_PLAN.md` |
| Role | A named bundle of permissions, for example Desk Editor. Roles are generic: there is no "Hindi sports editor" role |
| Scope | Where a role applies: a language desk (`en`, `hi`, or all) and a section (one, or all) |
| Assignment | One person holding one role in one scope, with an expiry date and the name of whoever granted it |
| Four-eyes | An action that needs a second, different person to approve it |
| MFA / `aal2` | The person signed in with a second factor. Supabase calls this assurance level `aal2`; a password alone is `aal1` |
| Audit log | The append-only record of who did what, when, and why |
| Owner action | A step only the owner can take, such as applying SQL to the database or setting a production variable |

## Template

Copy this section for each panel, replace the guidance in italics, and keep the headings in this
order. Write for someone who has not seen the code: a new developer, or the senior reviewer.

### Panel N: Name

#### Panel

- **Name:** *the panel's name, as in the index*
- **URLs:** *every page and API route it adds or uses, for example `/admin/desk` and
  `/api/admin/articles`*
- **Code:** *where its code lives: the view in `frontend/views/`, the route bodies in `backend/api/`,
  services, repositories, and the SQL in `database/migrations/`*

#### Purpose

*What the panel is for, in two or three sentences. Say which problem it solves for the newsroom.*

#### Roles and responsibilities

*Which roles use it and what each one does there.*

| Role | What they do in this panel |
|---|---|
| *Desk Editor* | *Approves and publishes articles in their language and section* |

#### Features and functionality

*What a user can see and do, one line each. Mark anything partly built as partial and say what is
missing.*

#### Access permissions and authorization rules

*Every permission the panel checks, who holds it, and the extra rules around it. The server checks
each one; hiding a button in the UI is never the check.*

| Permission | Roles that hold it, and their scope | Four-eyes | MFA (`aal2`) | Audited |
|---|---|---|---|---|
| *`article.publish`* | *Managing Editor (all); Desk Editor and Sub-editor (own language and section)* | *Yes: approved by someone other than the author and last editor* | *Yes* | *Yes* |

*Also state: what a person without the permission sees (status code and message), what is written
to the audit log for each action (action name, target, before and after, reason), and any action
that needs a reason code.*

#### Database changes

| Migration file | What it does | Rollback | Applied by the owner |
|---|---|---|---|
| *`database/migrations/YYYY-MM-DD-name.sql`* | *Tables, columns, indexes, policies it adds* | *Where its rollback section is* | *No / Yes, on date* |

*Say if a table or column existing before this panel changed meaning.*

#### Tests and verification

| Test file | What it proves | Denied case covered |
|---|---|---|
| *`backend/api/admin/…test.ts`* | *A Desk Editor in `hi` can publish a `hi` article* | *A Desk Editor in `en` gets 403 for the same article; an expired assignment gets 403* |

*Every permission check needs an allowed test and a denied test. Add what was checked by hand, and
the `npm run verify` and CI result at the time the panel was marked Done.*

#### Known limits and not yet built

*What the plan asks for that this panel does not do yet, and why. Link each item to its
`BACKLOG.md` entry or to the later panel that will do it.*

## Panels

### Panel 0: Access foundation

#### Panel

- **Name:** Access foundation.
- **URLs:** `/admin/login` (staff sign-in and the second factor), `/admin` (shows only what the user
  holds), `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/me` and
  `POST /api/admin/mfa` (new). Every other `/api/admin/*` route now checks a permission.
- **Code:**
  - `backend/auth/`: `requirePermission.ts` (the gate), `decide.ts` (the rule), `scope.ts`,
    `adminRoutePolicy.ts` (every route's rule), `staffSession.ts`, `supabaseServer.ts`, `mfa.ts`, and
    `adminSession.ts` (the shared password, with its end date);
  - `backend/repositories/staff.ts` and `auditLog.ts`; `backend/api/admin/me.ts` and `mfa.ts`;
  - `shared/config/permissions.ts`, `proxy.ts`;
  - `frontend/views/admin/AdminLoginView.tsx` and `AdminView.tsx`;
  - the SQL in `database/migrations/2026-11-02-access-*.sql` and `database/bootstrap/super-admin.sql`.
- **Design:** [`design/panel-0-access-foundation.md`](design/panel-0-access-foundation.md), and
  [ADR 0003](adr/0003-primary-section-scope.md) for the section rule.

#### Purpose

It replaces the one shared admin password with named staff accounts. Each account holds roles in a
language and section, signs in with a second factor, and leaves a record of every change it makes.
Every later panel depends on knowing who is acting and what they may do.

#### Roles and responsibilities

Panel 0 defines all 15 roles of the plan's matrix ([PANEL_PLAN.md](PANEL_PLAN.md)). In this panel:

| Role | What they do here |
|---|---|
| Super Admin | Signs in with a second factor. Sees sync, stats, health, the activity log and the articles list. Holds no editorial verbs (by the plan's design). Granting roles in the app is Panel 1 |
| Managing Editor | Everything editorial in every scope: edit, unpublish, bulk delete, publish, the breaking banner |
| Desk Editor | The same within their language and section. Not the banner: it is site-wide and needs an unscoped grant (Panel 3 gives banners a language) |
| Sub-editor, Writer | Read the articles list and stats; a Sub-editor edits within scope. Writer's "Own" waits for Panel 2 (no `created_by` yet) |
| Ingestion Ops | Runs the full NewsData sync, reads health and stats |
| Legal/Compliance | Unpublishes an article in any scope (takedown, F); reads the articles list and the activity log |
| Analyst, Security Lead, Privacy Officer | Read what their cells allow (stats, sync status, health, the activity log) |
| The owner | Applies the SQL, creates the first Super Admins by SQL, and is the way back in ([runbook](runbooks/staff-access.md)) |
| The shared password | During the cut-over only: a fixed list of today's editorial and sync work, recorded as `legacy:shared-password` |

#### Features and functionality

- Sign-in with email and password for staff, then a second factor. The first time, the user scans a
  QR code (or types the key) and enters one code; every time after, they enter a code. The shared
  password stays one click away until it is retired.
- `/admin` says who is signed in, shows only the widgets and buttons the user's permissions allow,
  and sends a session that still owes its code back to finish signing in.
- Every admin route checks a permission on the server, in the target's scope.
- Every change is written to an append-only, hash-chained audit log, before and after it happens.
- The activity log reads that audit log; it cannot be cleared. The shared-password era's
  `admin_logs` stays readable at `?source=legacy`.
- The cron's runs are logged as `system:cron`.
- The shared password ends by itself at 00:00 IST on 1 January 2027; `ADMIN_LEGACY_LOGIN=off` ends
  it sooner.

#### Access permissions and authorization rules

**The backend check is the only gate.** The app reads Supabase as `service_role`, which bypasses
RLS, so `requirePermission` in each route body is all that stands between a request and the data.
The proxy only checks that a session exists. RLS protects only direct access with a user's own
token: the access tables grant `anon` and `authenticated` nothing.

How a check is decided (`decide.ts`). The answer is "no" unless all of these hold:
1. The staff profile is active.
2. The assignment is not revoked and not expired. This is checked on every decision.
3. The role grants the permission with a code that allows the action: F, S, R or M for a read; F or
   S for a change. Own and A are refused until their panels.
4. The assignment's scope covers the target. The language is `en`/`hi` (articles store
   `english`/`hindi`). The section is the article's `category[0]`. A NULL target field needs an
   unscoped grant.
5. The session is `aal2` where the role or the profile requires it.

The staff record is read from the database on every request, with no cache, so a revocation or
suspension applies to the next request.

| Route | Permission | Who holds it (scope) | Four-eyes | MFA (`aal2`) | Audited |
|---|---|---|---|---|---|
| `GET /api/admin/articles` | `article.view_admin` (read, any scope) | Super Admin, Managing Editor F; Desk Editor, Sub-editor, Writer S; Ingestion Ops, Analyst, Grievance Officer, Legal R | — | per role/profile | denials |
| `PATCH /api/admin/articles` | `article.edit` in the article's scope, and in the new scope if the edit moves it | Managing Editor F; Desk Editor, Sub-editor S | — | yes for these roles | attempted + outcome, before/after |
| `DELETE /api/admin/articles` | `article.unpublish` in the article's scope | Managing Editor, Legal F; Desk Editor S; Super Admin only as break-glass | — | yes | attempted + outcome |
| `DELETE /api/admin/articles/bulk` | `article.bulk_action` and `article.unpublish`, for every article (at most 100) | Managing Editor F; Desk Editor S | — | yes | one pair naming every article |
| `POST`, `DELETE /api/admin/breaking-news` | `breaking_banner.manage`, site-wide | Managing Editor (unscoped grants only) | — | yes | attempted + outcome |
| `POST /api/admin/publish-article` | `article.publish_direct` and `article.create`, in en + the category | Managing Editor F; Desk Editor S | post-hoc review is Panel 2 | yes | attempted + outcome |
| `POST /api/admin/seed-supabase` | `sync.run`, site-wide | Super Admin, Ingestion Ops F | — | yes | attempted + outcome |
| `POST /api/admin/db-stats` (purge) | `content.purge` | Super Admin, Ingestion Ops A: **refused for everyone** until Panel 4's approval flow | needs two people | — | denials |
| `GET /api/admin/db-stats`, `/stats` | `stats.view` (read, any scope) | many (matrix) | — | per role/profile | denials |
| `GET /api/admin/health` | `health.view` (read) | Super Admin, Security Lead F; Managing Editor, Ingestion Ops R | — | per role/profile | denials |
| `GET /api/admin/logs` | `audit.read` (read; a scoped holder sees only their scope) | Super Admin, Legal, Privacy Officer, Security Lead F; Managing Editor S (own desk) | — | yes | denials |
| `GET /api/admin/me`, `POST /api/admin/mfa` | none: session-only | any staff session, `aal1` included | — | — | sign-in and MFA events |
| `POST /api/admin/login`, `/logout`, `GET /api/admin/breaking-news` | none: public (D10) | — | — | — | sign-in, sign-out |

- **MFA:** `staff_profiles.mfa_required` defaults to true (Q1), so every staff member uses TOTP.
  The roles marked `requires_aal2` (Super Admin, Managing Editor, Desk Editor, Legal/Compliance,
  Privacy Officer, Security Lead, Ingestion Ops) cannot have it switched off.
- **Two admins:** a privileged role (Super Admin, Managing Editor, Legal/Compliance, Privacy
  Officer) is granted only by two different active Super Admins. The database trigger enforces
  this. The only exception is the owner's bootstrap script, as `postgres`.
- **The shared password:** it may use only `article.view_admin`, `article.create`, `article.edit`,
  `article.unpublish`, `article.bulk_action`, `article.publish_direct`, `breaking_banner.manage`,
  `sync.run`, `sync.view` and `stats.view`. It never holds `user.manage`, `role.assign`, an audit or
  settings permission, or the purge.
- **Refusals:** 401 with no session. 403 `{ error, code, required }`, where `code` is `not_staff`,
  `suspended`, `forbidden`, `mfa_required` or `needs_approval`. 503 when the staff record or the
  "attempted" audit row cannot be written; nothing is changed then.

#### Database changes

| File | What it does | Rollback | Applied by the owner |
|---|---|---|---|
| `database/migrations/2026-11-02-access-1-foundation.sql` | `staff_profiles`, `roles`, `permissions`, `role_permissions`, `role_assignments`, `audit_log`; triggers (two-admin rule, bootstrap only as postgres, assignments are history, audit append-only and hash-chained); RLS on, nothing for `anon`/`authenticated` | At the end of the file, before go-live only | **No** |
| `database/migrations/2026-11-02-access-2-catalog.sql` | The 15 roles, 39 permissions, 136 matrix rows, generated from `PANEL_PLAN.md` | Re-run the previous version, or the foundation rollback | **No** |
| `database/migrations/2026-11-02-access-3-freeze-admin-logs.sql` | `admin_logs` read-only (after the deploy) | `GRANT ALL ... TO service_role` | **No** |
| `database/bootstrap/super-admin.sql` | One invited user becomes a Super Admin, audited as `bootstrap` | Revoke, in the file | **No** |

The order (migrations, deploy, bootstrap, staff sign-in, freeze, then the shared password off) is
in [`runbooks/staff-access.md`](runbooks/staff-access.md). `admin_logs` changes meaning: it is
history, no longer written.

#### Tests and verification

| Test file | What it proves | Denied cases covered |
|---|---|---|
| `backend/api/admin/access.test.ts` | **The route walk** (every admin route file on disk is public, session-only or ruled, and every rule is tested) and **the access matrix**: every guarded route and method through its real handler and the real gate, with grants read from the catalogue SQL | No session (401), no grants, expired, wrong scope, no MFA, the shared password where not allowed, the purge for every holder; nothing written in any of them. Also: moves out of scope, one out-of-scope article in a bulk delete, Sub-editor publish and bulk, an unwritable audit row (503), the 100-article limit |
| `backend/auth/decide.test.ts` | The rule: each code, scope, expiry, MFA, break-glass, the legacy list | Every "no" path has an allowed twin |
| `backend/auth/requirePermission.test.ts` | The gate, the audit pair, the denial audit | Revoked or suspended between two requests is refused on the second |
| `backend/auth/staffSession.test.ts`, `proxy.test.ts` | Who is asking; the proxy accepts both sessions; cookie flags | Forged or signed-out JWTs, errors, the legacy end date |
| `backend/api/admin/login.test.ts`, `logout.test.ts`, `me.test.ts`, `mfa.test.ts` | Sign-in, sign-out, `/me`, the second factor | Wrong credentials, not staff, suspended, wrong code, rate limits, the legacy end date and kill switch |
| `shared/config/permissions.test.ts`, `backend/repositories/accessSchema.test.ts` | The catalogue equals the matrix cell for cell; the SQL's guarantees | — |
| `frontend/views/admin/AdminView.test.tsx`, `AdminLoginView.test.tsx`, `ActivityLog.test.tsx` | What the UI shows for each user; the sign-in steps; no clear button; each screen's loading, error and empty state | Hidden widgets for missing permissions |
| `frontend/features/admin/labels.test.tsx` | Every select on `/admin` has an accessible name | — |
| `e2e/admin-access.spec.ts` (Playwright) | Signed out: `/admin` redirects to sign-in | Five admin routes answer 401 |
| `e2e/accessibility.spec.ts` (Playwright, axe) | The sign-in page meets WCAG 2.1 AA (the site chrome excluded, BL-037) and works by keyboard | — |
| `e2e/reader.spec.ts` (Playwright) | The front page lists stories that link to their pages | — |
| `scripts/check-js-budget.test.ts` | The per-route JS budget's rules | Over budget, no budget, a stale budget |

The browser tests are **read-only** (owner rule, 2026-11-02): locally the app uses the real
database, so no test signs in or writes. Staff sign-in, MFA and the audited actions are covered by
the unit tests with Supabase stubbed, and by the owner's check by hand.

At the pause (`1a215a0`): `npm run verify` exits 0: 49 suites and 757 tests, lint 0 errors and 13
warnings, 0 boundary violations, the build with the route table at 30 URLs, identical to the
baseline, and every route within its JS budget. `npm run test:e2e`: 10 passed.

**Unverified: the database-level checks.** The two-admin trigger, the audit log's append-only
triggers and hash chain (`audit_verify_chain()`, and its failure after a tamper), and the
bootstrap's checks 1–4 have not run against a database. jest cannot run them. A local database was
set up to run them, then dropped by the owner (2026-11-02) before its results were kept. The owner
verifies them against the real database with the verification queries in each SQL file and
[`runbooks/staff-access.md`](runbooks/staff-access.md), Part B, when panels resume.

Definition of done (CLAUDE.md), at the pause:

| # | Item | Status |
|---|---|---|
| 1 | Features work; this entry matches the code | Built; the staff flows are proven with stubbed Supabase only |
| 2 | Server-side permission on every route and action; allowed and denied tests | Done (`access.test.ts`, the route walk) |
| 3 | Privileged actions audited; MFA where the plan says | In the code and unit-tested; the database side unverified |
| 4 | `npm run verify` and CI green; routes, JS and CSS reported | Verify green; CI on the pushed branch |
| 5 | SQL in migrations with a rollback, listed as an owner action | Done (Database changes, above) |
| 6 | PANEL_DOCS, HANDOFF, CODEMAP updated | PANEL_DOCS and HANDOFF at the pause; CODEMAP not regenerated since |
| 7 | Real-database tests | **Not done**: the local database was dropped; the owner's check by hand instead |
| 8 | End-to-end tests of the critical flows, with a refused-access flow | Partly: read-only (refused access, the sign-in page, the reader); sign-in and MFA in a browser cannot be read-only |
| 9 | Loading, error and empty states | Done, with tests |
| 10 | Accessibility (keyboard, labels) | Done for the sign-in page (axe, keyboard) and the labels on `/admin`; the signed-in dashboard is not checked by axe (it needs a sign-in) |
| 11 | Failures reach Sentry; privileged actions audited | Done in the code, with tests |
| 12 | A JS budget per route in CI | Done (`scripts/check-js-budget.mjs`, in verify and CI) |
| 13 | A runbook for when the main flow breaks | Done ([`runbooks/sign-in-broken.md`](runbooks/sign-in-broken.md)) |

#### Known limits and not yet built

- **Not applied:** none of the SQL is applied yet, and `main` is not deployable until it is (HANDOFF).
- **Not verified against a database:** the triggers, the hash chain and the bootstrap (above).
- **Panel 1:**
  - granting and revoking roles in the app (until then, only the owner's bootstrap and SQL);
  - break-glass grants with their alert;
  - resetting a lost factor in the app;
  - the access review;
  - removing the shared password, after which `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` go.
- **Panel 2:**
  - Own (no `created_by` yet);
  - the reviewed publish path and post-hoc review of direct publishes;
  - reason codes and notifications on takedown;
  - the desk filter on the articles list.
- **Panel 3:** the banner gets a language, so a scoped Desk Editor can manage it.
- **Panel 4:** the purge's approval flow (A), the 60-day purge floor and content records (BL-033).
- **Panel 6:** per-desk stats.
- **Panel 8:** the audit viewer shows an attempt with no outcome as its own state (Q2);
  `audit_verify_chain()` in the app.
- **Phase 2:** RLS policies for a user-context client and a SQL `has_permission()`.
- **Backlog:** exporting the chain's head hash elsewhere (BL-034).
- **By design, not a gap:** a staff-record cache. The record is read on every request so that a
  revocation applies at once.

#### Commits

On `main` (the design and the first half): `e9bce19`, `6bcfb4e`, `38ac276`, `b69a866`, `28f31e3`,
`78e58b6`, `690631e`, `b48998e`, `dfcaf80`, `260bebf`, `7b6d102`, `f0e102d`, `5ba4fd6`, `27b19c7`,
`6eb0b8e`, `16175b1`, `0bb4fbb`, `bb0bd2c`, `0b3d09f`, `f357d71`, `c35637f`. On `panel-0-access` (the
second half): `d1bff91` through this entry, listed in HANDOFF section 4.
