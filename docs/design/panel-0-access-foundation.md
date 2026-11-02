# Panel 0 design: the access foundation

**Status:** **Approved with conditions** by the owner on 2026-11-02 (STEP 2), and **built** (STEP 3):
complete on the branch `panel-0-access`, awaiting the owner's merge. What was built, and how it
checks, is in [`PANEL_DOCS.md`](../PANEL_DOCS.md); where the build went past this file (the
session-only routes and the sign-in flow), PANEL_DOCS is the record.
The section "Approval: decisions and amendments" below overrides anything later in this file that
disagrees with it.
**Plan:** [`PANEL_PLAN.md`](../PANEL_PLAN.md), "The proxy guesses and the backend decides", the
matrix, and "Four-eyes, takedown and MFA rules". **Owner decisions folded in:** the twelve answers to
the Step 1 report (2026-11-02), cited below as D1 to D12.
**Related:** [ADR 0003](../adr/0003-primary-section-scope.md) (the primary-section rule),
[BL-033](../BACKLOG.md) (retention), [BL-034](../BACKLOG.md) (the chain's head hash).

Panel 0 replaces the shared admin password with named staff accounts. Every admin route checks a
permission on the server, privileged staff sign in with a second factor, and every privileged action
lands in an append-only audit log. It adds no new admin screens beyond sign-in and MFA. Managing
people and roles in the app is Panel 1.

## Approval: decisions and amendments (2026-11-02)

**Answers to §10.**
- **Q1:** MFA is required for all staff (`mfa_required` defaults to true).
- **Q2:** "attempted, then outcome", fail closed. An attempt with no outcome row is a state of its
  own. The audit viewer (Panel 8) must show it distinctly, not as a success and not as a failure.
- **Q3:** the shared password runs until Panel 1. The end date is 2026-12-31, and
  `ADMIN_LEGACY_LOGIN=off` is the kill switch. Two conditions:
  - The date is enforced in code. After it, legacy login is refused even with the switch on, and a
    test proves it.
  - A legacy session holds a **fixed list** of today's admin capabilities and nothing else: never
    `user.manage`, `role.assign`, `audit.read`, `settings.manage` or `health.view`. Otherwise the old
    password could mint admins in the new system. Tests prove each refusal. The list is in §7.
- **Q4:** option A. `@supabase/supabase-js` 2.109.0 → 2.116.0 in its own commit, with the full verify
  and a smoke test, then `@supabase/ssr` 0.12.7.
- **Q5:** the admin purge is refused for everyone, including a legacy session, until Panel 4. The
  cron purge continues.
- **Q6:** `DELETE /api/admin/logs` is removed.
- **Q7:** `admin_logs` is frozen and not copied, and stays **readable** as history. The freeze SQL
  revokes writes only. `GET /api/admin/logs?source=legacy` returns its rows, under `audit.read`.
- **Q8:** `database/bootstrap/` is approved. D1 (nothing imports `database/`) and Tailwind's
  `@source not` both cover it: they match the folder `database/` and everything below it.

**The backend check is the only gate.** The app talks to Supabase as `service_role`, which bypasses
RLS. On the app's request path, RLS protects nothing. `requirePermission` is therefore the only
thing between a request and the data. Every admin route and method is tested for these cases:
- allowed;
- denied (no assignment);
- expired assignment;
- wrong scope;
- missing MFA;
- legacy session.

RLS (Phase 2) protects only direct access with a user's own token.

**Revocation is immediate.** Changing an assignment, a role or a staff member's status takes effect
on the next request. `expires_at` is checked on every decision.
- **Amendment: no staff-record cache in Panel 0.** §3 proposed a 60-second Redis cache, cleared on
  every change the app makes. A change the owner makes in the SQL editor cannot clear Redis, so a
  revoked user would keep access for up to 60 seconds. Instead, `requirePermission` reads the staff
  record from the database on every request, one query, and keeps it only for that request. Nothing
  is cached, so nothing can be stale.
- The cost is one indexed query per admin request, which is small at admin traffic. If it ever
  matters, a cache keyed by a database-maintained version number can come back. A test proves that
  an assignment revoked between two requests is refused on the second.

## 0. What the docs say, and what it changes

Read before designing (D9):

- **Next 16, `authentication.md`.** Proxy should do "only optimistic checks", reading the session
  from the cookie with no database call, because it runs on every route including prefetches. It
  "should not be your only line of defense"; secure checks belong in a `server-only` Data Access
  Layer. Route Handlers must be treated "with the same security considerations as public-facing API
  endpoints". Two details matter here:
  - React's `cache` "deduplicates within a React render pass. Server Actions and Route Handlers are
    not part of a render pass, so the wrapper does nothing." The plan's "memoised per request" does
    not apply to our API routes. Each route body calls the staff check once and passes the result
    down.
  - "Use Proxy to protect static routes." `/admin` and `/admin/login` are prerendered (`o` in the
    route table). They stay static: making them dynamic would change the route table. The static
    shell holds no data; every byte of admin data comes from an API route that checks a permission.
- **Next 16, `data-security.md`.** A page-level check does not extend to the actions it renders. Every
  action re-checks. Return only what the UI needs.
- **Next 16, `proxy.md`.** Proxy runs on the Node.js runtime by default. It can read request cookies
  and set response cookies.
- **Supabase, server-side auth for Next.js.** "Server-Side Rendering (SSR) with Supabase requires
  cookie-based session storage. The `@supabase/ssr` package handles this." Plain `supabase-js` keeps
  the session in local storage, which the server cannot read. **So `@supabase/ssr` is needed** (D8).
  The proxy refreshes the token with `supabase.auth.getClaims()` and passes refreshed cookies on.
  "*Never* trust `supabase.auth.getSession()` inside server code." `getClaims()` verifies the JWT's
  signature and expiry but "an unexpired token stays valid even when the session behind it was
  revoked. Call `getUser()` where that gap matters." Cookies are not `HttpOnly` by default.
- **Supabase MFA.** TOTP "is free to use and is enabled on all Supabase projects by default". The
  `aal` claim carries the assurance level; a JWT without one is `aal1`. Unenrolling a factor
  downgrades `aal2` to `aal1` "only after the refresh interval has lapsed".
- **Supabase RBAC guide.** It puts one role into the JWT through an access-token hook. That cannot
  express "Desk Editor for hi plus Writer for en", and a JWT claim lives until the token expires.
  As the plan says, scope comes from the tables, read live.

## 1. Data model

Everything below is SQL in files that the owner applies. The app never runs DDL.

### Files

| File | What it does | When the owner applies it |
|---|---|---|
| `database/migrations/<date>-access-foundation.sql` | The six new tables, their triggers, RLS, grants | Step A, before the code deploy |
| `database/migrations/<date>-access-catalog.sql` | Seeds `roles`, `permissions`, `role_permissions` from the matrix | Step A, right after |
| `database/bootstrap/super-admin.sql` | Makes one invited user a Super Admin (§7). Run once per account | Step B, after the deploy |
| `database/migrations/<date>-freeze-admin-logs.sql` | Revokes writes on `admin_logs` | Step C, after the deploy is verified |

All are idempotent (`IF NOT EXISTS`, `ON CONFLICT`, `DROP POLICY IF EXISTS`). Each ends with a
rollback section and verification queries, in the style of
[`runbooks/apply-database.md`](../runbooks/apply-database.md). That runbook gains the new steps.
**Deviation, stated:** the bootstrap script goes in `database/bootstrap/`, not `migrations/`. It is
not a schema change: it takes an email as input and is run by hand once per account.

### Tables

**`staff_profiles`**: a row here is what makes an auth user staff (never `user_metadata`, which
users can edit).

| Column | Type | Notes |
|---|---|---|
| `user_id` | `uuid` PK, FK `auth.users(id)` `ON DELETE RESTRICT` | Deleting a staff member's auth user fails until they are removed properly (Panel 1), so the audit trail never points at nothing |
| `display_name` | `text NOT NULL` | |
| `status` | `text NOT NULL DEFAULT 'active'`, check `active` / `suspended` | Suspended means every check says no |
| `mfa_required` | `boolean NOT NULL DEFAULT true` | §5 |
| `created_at`, `created_by` | `timestamptz`, `uuid NULL` | `created_by` is NULL only for bootstrap rows |
| `last_sign_in_at` | `timestamptz NULL` | Written at sign-in only, not per request |

**`roles`**: 15 rows, the matrix's columns (D2). Finance is added with Panel 9.

| Column | Notes |
|---|---|
| `key` `text` PK | `super_admin`, `managing_editor`, `desk_editor`, `sub_editor`, `writer`, `ingestion_ops`, `analyst`, `grievance_officer`, `legal_compliance`, `privacy_officer`, `security_lead`, `crm_mgr`, `support`, `brand_studio`, `ad_ops` |
| `label` | The matrix heading, e.g. "CRM Mgr (P4)" |
| `is_privileged` | Granting it needs two admins. True for Super Admin, Managing Editor, Legal/Compliance, Privacy Officer (D3) |
| `requires_aal2` | Those four plus Desk Editor, Security Lead, Ingestion Ops (D3) |
| `scope_required` | True for Desk Editor, Sub-editor, Writer: an assignment must name a language. Only Managing Editor and above hold null-scope editorial grants (plan) |
| `phase` | 1–4, from the plan |

**`permissions`**: 39 keys. Each matrix row becomes one key per verb it names, so
"sync.run / sync.view" is two keys with the same cells. This is mechanical, so the catalogue can be
checked against the matrix by a test (§9).

| Column | Notes |
|---|---|
| `key` `text` PK | Check `^[a-z_]+\.[a-z_]+$` |
| `matrix_row` | The row as printed, e.g. `sync.run / sync.view`, so every key traces to the plan |
| `risk` | `low` / `high` / `critical`. Informational in Panel 0 (§5 has one proposal that uses it) |
| `description` | The row's qualifier, e.g. "after approval", "respects 60-day floor" |

The 39 keys: `article.view_admin`, `article.create`, `article.edit`, `article.submit`,
`article.approve`, `article.publish`, `article.publish_direct`, `article.unpublish`,
`article.takedown`, `article.restore`, `article.bulk_action`, `breaking_banner.manage`, `push.send`,
`homepage.curate`, `correction.publish`, `sponsored.label_remove`, `sponsored.approve`,
`source.manage`, `source.kill_switch`, `sync.run`, `sync.view`, `content.purge`, `ai.configure`,
`stats.view`, `grievance.handle`, `grievance.report`, `legal_order.manage`,
`content_records.export`, `reader_pii.view`, `reader_pii.reveal`, `reader_data.export`,
`dsr.handle`, `subscription.refund`, `incident.manage`, `audit.read`, `user.manage`, `role.assign`,
`settings.manage`, `health.view`.

**`role_permissions`**: the matrix, as rows: one per non-empty cell and key.

| Column | Notes |
|---|---|
| `role_key`, `permission_key` | PK, both FKs |
| `access` | The cell's code: `F`, `S`, `Own`, `A`, `R`, `M` (no row for `—`) |
| `break_glass_only` | True for Super Admin's "F (break-glass)" on unpublish/takedown |
| `note` | The cell's qualifier: "own desk", "assign ≤ Desk Editor in own scope", "sponsored" |

**`role_assignments`**: one person, one role, one scope, with an expiry.

| Column | Notes |
|---|---|
| `id` `uuid` PK | |
| `user_id` | FK `staff_profiles` |
| `role_key` | FK `roles` |
| `language` | `NULL` (all), `en` or `hi`. Scope uses `en`/`hi`; articles keep `english`/`hindi` (D5, §3) |
| `section` | `NULL` (all) or a category key, check `^[a-z_]+$`. Matched against the article's primary section, `category[0]` (D6, ADR 0003) |
| `is_break_glass` | Check: if true, `expires_at <= granted_at + interval '2 hours'` and a reason is given |
| `granted_by`, `approved_by` | `uuid NULL` |
| `reason` | `text NOT NULL` |
| `granted_at` | `timestamptz NOT NULL DEFAULT now()` |
| `expires_at` | `timestamptz NOT NULL`: every assignment expires (plan) |
| `revoked_at`, `revoked_by`, `revoke_reason` | Revoking sets these. Rows are never deleted |

Index: one active row per (user, role, language, section): a partial unique index
`WHERE revoked_at IS NULL`, with `COALESCE` for the nullable scope columns. Plus `(user_id)`.

A `BEFORE INSERT OR UPDATE` trigger, `SECURITY INVOKER` so `current_user` is the caller, enforces
in the database what no app code can bypass:
1. **Two admins for a privileged role** (D3, D4). For a role with `is_privileged`, `granted_by` and
   `approved_by` must both be set, must differ, and must both hold an active, unexpired
   `super_admin` assignment.
2. **Bootstrap only by the owner** (D4). The single exception to rule 1 is a row with `granted_by`
   and `approved_by` NULL, `role_key = 'super_admin'`, `reason LIKE 'bootstrap:%'`, inserted while
   `current_user = 'postgres'`, which is the SQL editor. The app connects as `service_role`, so it
   cannot take this path, and no "single-admin mode" exists anywhere.
3. **Scope shape.** If `roles.scope_required`, `language` must not be NULL.
4. **Rows are history.** An `UPDATE` may only set `revoked_at`, `revoked_by`, `revoke_reason`, and
   only once. `DELETE` and `TRUNCATE` are revoked from every app role.

If only one Super Admin exists, granting a privileged role waits until the owner creates a second
one by SQL (D4).

**`audit_log`**: append-only, and it supersedes `admin_logs` (§6).

| Column | Notes |
|---|---|
| `id` `uuid` PK | |
| `seq` `bigint` unique | Assigned by the trigger under a lock (below); the chain's order |
| `at` | `timestamptz NOT NULL DEFAULT now()`: the database clock, one clock for every row |
| `actor_type` | `staff`, `system`, `legacy`, `bootstrap` |
| `actor_id` | `uuid NULL`: the staff user. NULL for `system`, `legacy`, `bootstrap` |
| `actor_label` | `system:cron` (D11), `legacy:shared-password`, `owner:sql-editor:postgres`, or the staff display name at the time |
| `actor_roles` | `jsonb`: a snapshot of the actor's active assignments when they acted |
| `aal` | `aal1` / `aal2` / NULL |
| `action` | e.g. `article.unpublish`, `auth.sign_in`, `breaking_banner.set` |
| `outcome` | `attempted`, `succeeded`, `failed`, `denied` |
| `entity_type`, `entity_id` | What was acted on |
| `language`, `section` | The target's scope, for scoped reads (`audit.read` is "S (own desk)" for Managing Editor) |
| `before`, `after` | `jsonb NULL`: the changed fields only, never whole rows |
| `reason` | Free text, or a reason code |
| `ip`, `user_agent`, `request_id` | From the request; `request_id` from `x-vercel-id`, else a UUID |
| `prev_hash`, `row_hash` | `bytea`: the tamper-evidence chain |

- **Chain.** A `BEFORE INSERT` trigger takes `pg_advisory_xact_lock`, reads the last row's `seq` and
  `row_hash`, and sets `seq = last + 1`, `prev_hash = last row_hash`, and
  `row_hash = sha256(canonical text of the row || prev_hash)`. `sha256()` is built into Postgres 11
  and later, so no extension is needed. The lock serialises inserts. `id` cannot be the chain
  order, because its default is assigned before the lock is taken.
- **Append-only.** `REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM service_role, authenticated,
  anon`. `service_role` bypasses RLS but not table privileges. In addition, `BEFORE UPDATE OR
  DELETE` (row) and `BEFORE TRUNCATE` (statement) triggers raise an exception. The database owner
  can still drop a trigger; the chain makes that visible.
- **Check.** `public.audit_verify_chain()` walks `seq` order and returns the first broken `seq`, or
  NULL. The owner runs it; Panel 8 shows it.
- **Retention.** The app never deletes. Rows are kept at least one year (DPDP's floor, more than
  CERT-In's 180 days). Archiving after that is a future owner procedure, not built here.

### RLS and grants

- RLS is enabled on all six tables. No policy is created for `anon` or `authenticated`, and
  `REVOKE ALL ... FROM anon, authenticated` on each, so both get nothing.
- The app reads and writes them as `service_role` through `backend/` only (plan: "Phase 1 can ship
  with DAL enforcement alone and add RLS in Phase 2"). A SQL `has_permission()` function and
  `aal2` restrictive policies come with the user-context client in Phase 2. Writing it now would
  mean two copies of the same rule, in SQL and TypeScript, with nothing yet calling the SQL one.
- **Why this matters with `@supabase/ssr`.** A signed-in staff member now holds a real Supabase
  access token for the `authenticated` role. With the public anon key, that token could call
  PostgREST directly. Today's grants already limit `authenticated` to `SELECT` on `articles` and
  `breaking_news` (public data) and nothing on `admin_logs`; the new tables add nothing. A test
  reads the SQL files and fails if any grant to `authenticated` appears on a staff table.

### `admin_logs`

Recommended: **read-only, not migrated.** After the deploy, nothing writes it. The step C SQL
revokes `INSERT`/`UPDATE`/`DELETE` from `service_role`, so it becomes a frozen record of the
shared-password era, queryable in SQL and kept for at least one year. Copying its rows into
`audit_log` was considered and rejected: the copies would carry no actor and would enter the hash
chain as if the new system had recorded them. The activity log in `/admin` reads `audit_log` from
the deploy on.

## 2. Permission catalogue

`database/migrations/<date>-access-catalog.sql` seeds the 15 roles, 39 permissions and the
`role_permissions` rows, generated from the matrix by a script kept in `scripts/`. A test parses the
matrix out of `docs/PANEL_PLAN.md` and the inserts out of the SQL file and requires them to agree
cell for cell, in both directions. `shared/config/permissions.ts` holds the 39 keys as a typed
constant (plan: "so frontend and backend cannot drift"). A test checks it against the SQL too.

**How the cell codes are enforced** in Panel 0. Each check asks for `act` (change something) or
`read` (look at something):

| Code | `read` | `act` | Panel 0 |
|---|---|---|---|
| `F` | ✅ | ✅ | Within the assignment's scope |
| `S` | ✅ | ✅ | Within the assignment's scope. Same rule as `F`; the difference is who may hold it unscoped (`scope_required`) |
| `R` | ✅ | ❌ | So `R` on "sync.run / sync.view" allows `sync.view` reads and refuses `sync.run` |
| `M` | ✅ masked | ❌ | No reader data exists yet; nothing uses it |
| `Own` | ❌ | ❌ | Refused until Panel 2 adds `created_by`. Deny by default |
| `A` | ❌ | ❌ | Refused with "needs a second approver" until the panel that builds the approval queue |
| `F (break-glass)` | only via an `is_break_glass` assignment | same | |

Who holds what is exactly the matrix. Panel 0 routes use these rows:

| Permission | Holders (from the matrix) |
|---|---|
| `article.view_admin` | Super Admin F · Managing Editor F · Desk Editor S · Sub-editor S · Writer S · Ingestion Ops R · Analyst R · Grievance Officer R · Legal/Compliance R · Brand Studio Own |
| `article.edit` | Managing Editor F · Desk Editor S · Sub-editor S · Writer Own · Brand Studio Own (sponsored) |
| `article.create` | as `article.edit` |
| `article.publish_direct` | Managing Editor F · Desk Editor S |
| `article.unpublish` | Super Admin F (break-glass) · Managing Editor F · Desk Editor S · Legal/Compliance F |
| `article.bulk_action` | Managing Editor F · Desk Editor S |
| `breaking_banner.manage` | Managing Editor F · Desk Editor S |
| `sync.run` / `sync.view` | Super Admin F · Managing Editor R · Desk Editor R · Ingestion Ops F · Analyst R · Security Lead R |
| `content.purge` | Super Admin A · Ingestion Ops A |
| `stats.view` | Super Admin F · Managing Editor F · Desk Editor S · Sub-editor S · Writer S · Ingestion Ops R · Analyst F · CRM Mgr R · Ad Ops R |
| `audit.read` | Super Admin F · Managing Editor S (own desk) · Legal/Compliance F · Privacy Officer F · Security Lead F |
| `settings.manage` / `health.view` | Super Admin F · Managing Editor R · Ingestion Ops R · Security Lead F |
| `user.manage` / `role.assign` | Super Admin A · Managing Editor S (assign ≤ Desk Editor in own scope). Seeded now; used in Panel 1 |

## 3. How a request is checked

```
browser ──cookie sb-<ref>-auth-token──▶ proxy.ts (matcher unchanged: /admin/:path*, /api/admin/:path*)
   public allowlist? ──yes──▶ next
   getClaims(): valid, unexpired JWT?  (refreshes the token if due, sets cookies, no DB call)
   or a valid legacy cookie, before the cut-off date (§7)?
   neither ──▶ 401 JSON for /api/admin/*, redirect to /admin/login for pages
   ──▶ route body in backend/api/admin/*
         requirePermission(request, "article.unpublish", { mode: "act", target })
           1. staff session: getClaims() for sub, aal, session_id; getUser() to confirm the
              session still exists (a signed-out JWT stays valid until expiry; getUser catches it)
           2. staff record: staff_profiles + assignments + role_permissions,
              read live from Supabase (service role) on every request (Approval: no cache)
           3. decide(): pure function, deny by default
         ✗ ──▶ 401 / 403 (and an audit row, outcome "denied", for a signed-in staff member)
         ✓ ──▶ audit row "attempted" (if this write fails, stop: 503, nothing changed)
               ──▶ the change ──▶ audit row "succeeded" or "failed"
```

**Where the identity comes from.** Supabase Auth issues the session. `@supabase/ssr` stores it in
the `sb-<project-ref>-auth-token` cookie. There is no browser Supabase client: sign-in, MFA and
sign-out all run in server routes. So the cookie is set by the server, and our `setAll` forces
`HttpOnly`, `Secure` (in production) and `SameSite=Lax` on it. Supabase says `HttpOnly` is "not
necessary". For an admin session it is cheap protection against a script reading the token, and
nothing in the browser needs to read it. Route bodies get the identity only from
`requirePermission`'s return value, never from a header, a body field or a query parameter.

**Modules** (all `backend/auth/`, all `import "server-only"`; `proxy.ts` may import them, P1):

| Module | Job |
|---|---|
| `supabaseServer.ts` | `createServerClient` for route bodies (`cookies()` from `next/headers`) and for the proxy (request and response cookies). One per request, never at module scope (Supabase: "Always initialize the Supabase client inside the request handler") |
| `publicAdminRoutes.ts` | The allowlist (D10) as data: `PUBLIC` = `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/breaking-news`, page `/admin/login`. `SESSION_ONLY` = `POST /api/admin/mfa`, `GET /api/admin/me` (a session, but no permission). The proxy and the tests both import it |
| `staffSession.ts` | `getStaffSession(request)`: the user, `aal`, `session_id`, profile and active assignments, or null |
| `decide.ts` | Pure: `(staff, catalogue, permission, mode, target, now) → { allowed, reason }`. No I/O, so every rule is unit-tested |
| `requirePermission.ts` | Ties them together and returns `{ ok: true, staff }` or `{ ok: false, response }` |
| `scope.ts` | `toScopeLanguage("english") → "en"`, `"hindi" → "hi"`, anything else → null (D5, the one place this happens); `articleScope(article) → { language, section: category[0] ?? null }` (D6) |
| `legacySession.ts` | Today's HMAC cookie, kept until the cut-over (§7), then deleted |

**`decide()`, in order. The first "no" wins:**
1. No staff session, or no profile → 401.
2. Profile `suspended` → 403.
3. Keep the assignments that are not revoked, have `expires_at > now`, and whose role grants the
   permission with a code that allows the mode (table in §2). A break-glass-only cell needs an
   `is_break_glass` assignment.
4. Keep those whose scope covers the target. A scope covers a target when each scope field is NULL
   or equals the target's. A target field that is NULL (an article whose language is not
   `english`/`hindi`, an article with no category, or a site-wide object like the breaking banner)
   is covered only by a NULL scope field. A `read` with no target (a list, a stats page) needs the
   permission in any scope.
5. Keep those whose role does not need `aal2`, or the session is `aal2`. If an assignment was
   dropped only for `aal`, answer 403 with `code: "mfa_required"`, so the UI can send the user to
   the MFA step. Profiles with `mfa_required` need `aal2` for everything (§5).
6. None left → 403 `{ error, required: "<permission>" }`. The permission key is not a secret, and
   it tells the user what to ask for.

Any failure while loading the staff record (Supabase down, a malformed row) is a "no": 503 "Could
not check your permissions. Nothing was changed." An unknown permission key cannot be written,
because the key parameter is the typed union from `shared/config/permissions.ts`. At runtime it
finds no matching row anyway.

**Caching.** *Superseded by the approval: there is no cache in Panel 0, and the record is read live
on every request.* As first proposed (plan: "about 60 s", Upstash): key `staff:v1:<user_id>` would
hold the profile and assignments with their permission rows. That is data, not a decision: expiry
would be evaluated at check time, against the current clock. Any assignment or profile change made
by the app would delete the key in the same request, and a change the owner made by SQL would take
effect within 60 seconds. If Redis were down, the check would read Supabase; a cache failure would
never turn into "allowed".

**What the proxy no longer does.** It stops being the only line of defence, but keeps its job: the
optimistic check, the redirect to `/admin/login`, and the refresh of the Supabase token. The
matcher does not change (CR-05). The Sentry `tunnelRoute` stays off (D12).

## 4. Today's admin routes and what each will require

| Route | Method | Today | Permission | Mode, target |
|---|---|---|---|---|
| `/api/admin/login` | POST | Shared password → HMAC cookie | public (D10) | Staff: email and password through Supabase. Legacy password until the cut-off (§7). Both rate-limited (D1 limiter, unchanged) |
| `/api/admin/logout` | POST | Clears the cookie | public (D10) | Supabase `signOut({ scope: "local" })` and clears the legacy cookie |
| `/api/admin/breaking-news` | GET | Public banner read | public (D10, CR-08) | — |
| `/api/admin/breaking-news` | POST | Set the banner | `breaking_banner.manage` | act, site-wide target → Managing Editor, or a Desk Editor with no language scope |
| `/api/admin/breaking-news` | DELETE | Remove the banner | `breaking_banner.manage` | as POST |
| `/api/admin/articles` | GET | List and search | `article.view_admin` | read, any scope. Panel 2 adds the desk filter (articles are public data) |
| `/api/admin/articles` | PATCH | Edit one article | `article.edit` | act, `articleScope(article)`. Changing `category[0]` needs the scope of both the old and the new section (ADR 0003) |
| `/api/admin/articles` | DELETE | Delete one article | `article.unpublish` | act, `articleScope(article)` |
| `/api/admin/articles/bulk` | DELETE | Delete many | `article.bulk_action` **and** `article.unpublish` | act, every article in scope, or the whole request is refused |
| `/api/admin/publish-article` | POST | Publish an editorial article | `article.publish_direct` (and `article.create`) | act, the new article's language and `category[0]`. It publishes immediately, so it is the direct path; Panel 2 adds review |
| `/api/admin/seed-supabase` | POST | Fetch every category from NewsData | `sync.run` | act, no scope (site-wide) |
| `/api/admin/db-stats` | GET | Database stats | `stats.view` | read, any scope |
| `/api/admin/db-stats` | POST | Purge articles older than 7 days | `content.purge` | **Refused for everyone**: both holders have `A`, and the approval flow is Panel 4. The cron's own purge continues (BL-033) |
| `/api/admin/stats` | GET | Category stats | `stats.view` | read, any scope |
| `/api/admin/health` | GET | Dependency detail | `health.view` | read, no scope |
| `/api/admin/logs` | GET | Activity log | `audit.read` | read. Rows are filtered to the holder's scope when their cell is `S` |
| `/api/admin/logs` | DELETE | **Clears the whole log** | none | **Removed.** The handler is deleted, so Next answers 405, and the UI loses its "clear" button. An append-only log cannot have a clear button |

**New routes** (route table 28 → 30; `docs/_baseline-routes.txt` is updated in the same commit):

| Route | Method | Guard | Job |
|---|---|---|---|
| `/api/admin/mfa` | POST | session only | `{ action: "enroll" }` → QR code and secret; `{ action: "verify", code }` → challenge and verify, which upgrades the session to `aal2` and sets new cookies. Rate-limited per user and IP |
| `/api/admin/me` | GET | session only | Display name, `aal`, active roles and scopes, and the permission keys held, so the UI can hide what the user cannot do. UX only, never a security boundary |

**Pages.** `/admin` and `/admin/login` stay static and keep their URLs. The proxy guards `/admin`.
The login view gains the staff form (email and password), then the MFA step (enrol on first sign-in,
then a code on each sign-in). While the cut-over runs it keeps a "shared password" option that shows
its end date. The admin view reads `/api/admin/me` to show who is signed in and to hide controls the
user lacks.

## 5. MFA

- **Factor.** TOTP (authenticator app): free, on by default. Phone/SMS is not used.
- **Who needs `aal2`.** Every assignment of a role with `requires_aal2` (D3) counts only in an
  `aal2` session (decide(), step 5). In addition, `staff_profiles.mfa_required` defaults to **true**,
  so every staff member uses a second factor unless the owner turns it off for one person. The role
  list is the floor nobody can switch off.
  - Why default true: the matrix gives Sub-editor `article.publish` (S), and Sub-editor is not on the
    `requires_aal2` list. The plan treats an unauthorised publish as a CERT-In incident ("the publish
    permission a security control"). Defaulting `mfa_required` covers that without changing D3.
    **Owner decision needed (Q1).**
- **Enrolment.** First sign-in: email and password give an `aal1` session. `/api/admin/me` reports
  "MFA required, not enrolled", and the login view shows the enrol step: `mfa.enroll({ factorType:
  "totp" })` returns a QR code and a secret, and the user confirms one code (`challenge` + `verify`).
  The session becomes `aal2`. Recommend each Super Admin enrols two devices (Supabase allows several
  factors), so one lost phone is not a lockout.
- **Each sign-in.** Password, then a code. The `aal1` session can reach only the session-only routes
  (`/api/admin/mfa`, `/api/admin/me`) until it is upgraded.
- **The check.** `aal` comes from the verified JWT (`getClaims()`), never from a request field. A
  removed factor downgrades `aal2` only at the next token refresh (Supabase). Removing a factor is
  therefore done together with signing the user out (Panel 1, and the owner runbook).
- **Lost device.** Owner action: delete the factor in the dashboard (Authentication → Users), then
  the user enrols again. Audited by the next sign-in's `auth.mfa_enrolled` row. Panel 1 adds an
  in-app reset that needs two admins.
- **Database side.** Restrictive `aal2` RLS policies need the user-context client, so they come in
  Phase 2 (§1, RLS).

## 6. Audit log

**What is recorded.** For every staff action that changes something, two rows: `attempted` before
the change, then `succeeded` or `failed`. Each carries actor, actor's roles (snapshot), `aal`,
action, target, the target's scope, reason, before/after (changed fields only), IP, user agent,
request id and time. Also recorded:
- sign-in, sign-out, MFA enrolment and every failed MFA code;
- every refusal of a signed-in staff member (`denied`). Unauthenticated 401s are not recorded: the
  proxy refuses them and the login limiter covers brute force;
- every bootstrap grant (`actor_type` `bootstrap`);
- every cron run (`system:cron`, D11), including its purge count.

Reads are not recorded, except `audit.read` itself.

**Why two rows, not one transaction.** The plan asks for the audit row "in the same transaction as
the change". Through supabase-js (PostgREST) each call is its own transaction, so that needs every
action rewritten as a Postgres function. **Panel 0 instead fails closed:** if the `attempted` row
cannot be written, the action does not run and the user gets 503. A crash between the change and
its outcome row leaves an `attempted` row with no outcome, which is visible, rather than a change
with no record. New actions built in Panels 2–4 can be Postgres functions that do both in one
transaction. **Owner decision needed (Q2).**

**Writers.** `backend/repositories/auditLog.ts` gets `recordStaffAudit()`, which throws on failure
(the caller refuses the action), and `recordSystemAudit()` for the cron, which logs and reports to
Sentry but never stops a run: the same contract `logAdminAction` has today. `logAdminAction` and its
callers move to the new writers.

**Append-only and retention.** §1: no `UPDATE`/`DELETE`/`TRUNCATE` for any app role, triggers that
raise, a hash chain, and at least one year.

## 7. Cut-over from the shared password

| Step | Who | What | The way back in |
|---|---|---|---|
| A | Owner | Apply the two migrations (tables, catalogue). Turn off "Allow new users to sign up". Confirm TOTP MFA is enabled | Nothing has changed for users yet |
| Deploy | Owner | Deploy Panel 0. Both logins work: staff accounts, and the shared password | The shared password, unchanged |
| B | Owner | Invite two Super Admins (Dashboard → Authentication → Invite user). Each accepts and sets a password. Run `database/bootstrap/super-admin.sql` once per account. Each signs in and enrols MFA | The shared password; and the SQL editor |
| C | Owner | Verify the step B checks; apply the `admin_logs` freeze | As above |
| Run | Everyone | Editorial work continues on the shared password, now audited as `legacy:shared-password`. Super Admins work on their accounts | As above |
| Removal | Me, then owner | When the conditions below hold, one deletion commit removes the legacy path; the owner deletes `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` from Vercel | The SQL editor (below) |

**What a legacy session may do during the run** (amended by the approval, Q3). A fixed list, in
code (`LEGACY_PERMISSIONS`), with every scope:
- `article.view_admin`, `article.create`, `article.edit`, `article.unpublish`,
  `article.bulk_action`, `article.publish_direct`;
- `breaking_banner.manage`;
- `sync.run`, `sync.view`;
- `stats.view`.

That is today's editorial and sync work. It loses three things it can do today:
- clearing the log (no one can);
- the purge (Q5);
- the activity log and admin health (`audit.read`, `health.view`: no audit or settings permission
  for the shared password).

It never holds `user.manage` or `role.assign`. It is recorded as `legacy:shared-password`, so the
audit shows which actions were still anonymous. It is not mapped to a role, because it is not a
person, and it never needs MFA.

**How long.** Until Panel 1 is done. Panel 0 has no screen for granting roles, so without the shared
password nobody could edit, publish or set the banner: Super Admin holds no editorial verbs (plan).
A **hard end date** is a constant in `backend/auth/legacySession.ts`. After it, the legacy cookie and
login are refused even if the code is never changed. Proposed: **2026-12-31**. An env switch,
`ADMIN_LEGACY_LOGIN=off`, ends it earlier with no deploy. **Owner decision needed (Q3).**

**The exact removal step.** One deletion commit:
- deletes `legacySession.ts` and the legacy branches in `proxy.ts` and `backend/api/admin/login.ts`;
- removes `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` from `.env.local.example` and its sync test;
- removes the "shared password" option from the login view.

Its conditions: two Super Admins have signed in with `aal2` in production, Panel 1 can grant roles,
and the owner says go.

**No lockout, ever.** The owner's own way in does not depend on the app: the Supabase dashboard
(reset a password, delete a lost factor, invite a user) plus the SQL editor (the bootstrap script,
which works as `postgres` and nothing else). That is the sealed break-glass. It is written up as an
owner runbook, `docs/runbooks/staff-access.md`: bootstrap, lost MFA device, locked-out last Super
Admin, suspected stolen session (sign out all sessions from the dashboard).

## 8. Owner actions

1. Approve the `@supabase/ssr` version (below).
2. Supabase dashboard: turn off "Allow new users to sign up"; confirm TOTP MFA is enabled
   (Authentication → MFA); confirm the JWT expiry is the default 1 hour.
3. Apply `<date>-access-foundation.sql`, then `<date>-access-catalog.sql`, with the runbook's
   verification queries. Before the deploy.
4. Deploy Panel 0.
5. Invite two Super Admins; run `database/bootstrap/super-admin.sql` for each; each enrols MFA.
6. Apply `<date>-freeze-admin-logs.sql` once step 5 checks out.
7. Run `select public.audit_verify_chain();` once a week, or on any doubt; it returns NULL when the
   chain is intact.
8. At the end of the cut-over: delete `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` from Vercel and
   from `.env.local`. Also `ADMIN_SECRET_TOKEN`, which nothing reads (HANDOFF §3.9).

No new secret is needed. `@supabase/ssr` uses `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, which are already set.

### The new dependency (D8)

The docs say it is needed (§0). The official package is `@supabase/ssr`, published by Supabase.

| Option | Versions | Published | Cost |
|---|---|---|---|
| **A (recommended)** | `@supabase/ssr@0.12.7`, and `@supabase/supabase-js` 2.109.0 → **2.116.0** | 2026-09-08 and 2026-09-07, both about 8 weeks old | 0.12.7 needs `supabase-js` `^2.114.0` (its `peerDependencies`), so `supabase-js` moves up 7 minor versions. That touches every database call, so it is its own commit with the full test suite |
| B | `@supabase/ssr@0.12.0`, `supabase-js` unchanged | 2026-06-09 | Its peer range `^2.108.0` accepts the installed 2.109.0. But it is five months behind seven releases |

Both are older than two weeks, and both are minor versions. A is recommended because the install is
pinned exact and the package sits on the authentication path, where the newest patch matters more
than the smallest diff. `@supabase/ssr` adds one dependency, `cookie` (`^1.0.2`). It runs on the
server only, so no client bundle grows from it. **Owner decision needed (Q4).**

## 9. Test plan

Tests come first for every authorization module (master prompt rule 4).

| Test | Proves |
|---|---|
| `backend/auth/decide.test.ts` | Each code: `F`, `S`, `R`, `M`, `Own`, `A`, break-glass, both `read` and `act`. Expired, revoked and future assignments. Suspended profile. Unknown role. A role without the permission. Language and section match and mismatch, NULL scope, NULL target fields. `aal1` vs `aal2` for `requires_aal2` roles and for `mfa_required` profiles. Every "no" path, and the allowed path for each |
| `shared/config/permissions.test.ts` | The matrix parsed out of `docs/PANEL_PLAN.md` (31 rows × 15 roles) equals the catalogue SQL's `role_permissions`, and the 39 keys equal the typed constant |
| `backend/auth/scope.test.ts` | `english ↔ en`, `hindi ↔ hi`, anything else → NULL; `category[0]`, empty and NULL categories (D5, D6) |
| `backend/auth/requirePermission.test.ts` | Session errors → 401; staff-record lookup failure → 503 and no handler call; Redis down → falls back to Supabase, never to "allowed"; a denial writes a `denied` row |
| `backend/api/admin/accessWalk.test.ts` | **The route walk.** It lists every `app/api/admin/**/route.ts` from disk and each method the backend module exports. Each must appear either in `publicAdminRoutes.ts` or in the §4 mapping table (also data in that module). The test fails on a route or method that is in neither, so a new route cannot ship unguarded. For every guarded method it calls the handler with (1) no session → 401, (2) a signed-in staff member with no assignments → 403, and (3) an `aal1` session holding the right role → 403 `mfa_required`. The Supabase mock asserts the handler wrote nothing |
| One allowed test per route | The least-privileged role in the matrix gets 2xx, e.g. a Desk Editor `hi` + `sports` can edit a `hindi` article whose `category[0]` is `sports`, and gets 403 on an `english` one |
| `proxy.test.ts` | Characterization first (proxy is at 0% today): public paths, method-aware breaking-news, 401 vs redirect. Then the Supabase session, the legacy cookie before and after the end date, the allowlist read from the shared module |
| `backend/api/admin/login.test.ts`, `mfa.test.ts`, `me.test.ts` | Staff sign-in, MFA enrol and verify, rate limits, legacy cut-off, cookie flags (`HttpOnly`, `SameSite=Lax`) |
| `backend/repositories/auditLog.test.ts` | Staff writer throws on failure; system writer never throws; a privileged route whose `attempted` write fails returns 503 and does not act |
| `backend/repositories/schema.test.ts` (extended) | The SQL files: `REVOKE UPDATE, DELETE, TRUNCATE` on `audit_log`; the append-only triggers; no grant to `anon`/`authenticated` on the new tables; the bootstrap path tied to `current_user = 'postgres'`; every rollback drops what its file creates |
| UI | Characterization tests before changing `AdminLoginView` and `ActivityLog` (no tests today), then the MFA steps and the removed clear button |

Database behaviour (triggers, the chain, the two-admin rule) cannot run in jest, which has no
database. It is proven by the verification queries the owner runs, including negative ones that
must fail (Appendix A).

### Build order for Step 3, after approval

Small commits, tests first, each through the full gate:
1. `@supabase/supabase-js` upgrade alone (option A only).
2. `@supabase/ssr`.
3. The SQL files and their repo tests.
4. The permission catalogue constant and its matrix test.
5. `scope.ts` and `decide.ts`.
6. `staffSession`, `requirePermission`, `publicAdminRoutes`.
7. The proxy: characterization first, then the change.
8. `/api/admin/me` and `/api/admin/mfa`, with the baseline routes file.
9. Each admin route, one commit per route: test, then the guard.
10. The audit writers.
11. The cron moves to `system:cron`.
12. The login view, then the admin view.
13. The runbooks.

Then PANEL_DOCS, HANDOFF, CODEMAP, architecture.

## 10. Questions for the owner

| # | Question | Recommendation |
|---|---|---|
| Q1 | `staff_profiles.mfa_required` defaults to true, so Sub-editors (who can publish) also use MFA? | Yes |
| Q2 | The audit log is "attempted, then outcome", fail closed, instead of one transaction per change? | Yes for Panel 0; Postgres functions for new actions from Panel 2 |
| Q3 | The legacy password runs until Panel 1 is done, with a hard end date of 2026-12-31 and `ADMIN_LEGACY_LOGIN=off` to end it sooner? | Yes |
| Q4 | `@supabase/ssr` 0.12.7 with `supabase-js` 2.116.0 (A), or 0.12.0 alone (B)? | A |
| Q5 | The admin purge button is refused until Panel 4 builds its approval flow (both holders have `A`)? The cron's purge continues | Yes: the matrix says purge needs two people |
| Q6 | `DELETE /api/admin/logs` (clear the activity log) is removed? | Yes: an append-only log cannot be cleared |
| Q7 | `admin_logs` is frozen and kept, not copied into `audit_log`? | Yes |
| Q8 | The bootstrap script lives in `database/bootstrap/`, not `database/migrations/`? | Yes |

## Appendix A: the bootstrap script

`database/bootstrap/super-admin.sql`. The owner runs it in the SQL editor (as `postgres`), once per
account, after inviting the user and after they accept the invite. It changes nothing unless both
values at the top are filled in.

```sql
-- TimesPrime: make one invited user a Super Admin (owner only; D4).
-- Run in Dashboard -> SQL Editor as postgres. Edit the two values below first.
-- Safe to re-run: a user who is already an active Super Admin is left alone.

BEGIN;

DO $$
DECLARE
  v_email     text := 'REPLACE_ME@example.com';                       -- the invited user
  v_name      text := 'REPLACE ME';                                   -- their display name
  v_reason    text := 'bootstrap: first Super Admins, owner, ' || to_char(now(), 'YYYY-MM-DD');
  v_expires   timestamptz := now() + interval '365 days';             -- renewed at the access review
  v_user      uuid;
  v_confirmed timestamptz;
  v_status    text;
  v_id        uuid;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Run this as postgres in the SQL editor (current_user is %)', current_user;
  END IF;
  IF v_email LIKE 'REPLACE_ME%' OR v_name = 'REPLACE ME' THEN
    RAISE EXCEPTION 'Fill in v_email and v_name first';
  END IF;

  SELECT id, email_confirmed_at INTO v_user, v_confirmed
    FROM auth.users WHERE lower(email) = lower(v_email);
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No auth user with email %: invite them first (Authentication -> Invite user)', v_email;
  END IF;
  IF v_confirmed IS NULL THEN
    RAISE EXCEPTION 'User % has not accepted the invite yet', v_email;
  END IF;

  INSERT INTO public.staff_profiles (user_id, display_name, status, mfa_required, created_by)
    VALUES (v_user, v_name, 'active', true, NULL)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT status INTO v_status FROM public.staff_profiles WHERE user_id = v_user;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Staff profile for % is %; reactivating is not a bootstrap', v_email, v_status;
  END IF;

  IF EXISTS (SELECT 1 FROM public.role_assignments
               WHERE user_id = v_user AND role_key = 'super_admin'
                 AND revoked_at IS NULL AND expires_at > now()) THEN
    RAISE NOTICE '% is already an active Super Admin; nothing changed', v_email;
    RETURN;
  END IF;

  -- granted_by and approved_by stay NULL: the role_assignments trigger accepts that only for
  -- super_admin, only with a 'bootstrap:' reason, and only when current_user is postgres.
  INSERT INTO public.role_assignments (user_id, role_key, language, section, reason, expires_at)
    VALUES (v_user, 'super_admin', NULL, NULL, v_reason, v_expires)
    RETURNING id INTO v_id;

  INSERT INTO public.audit_log (actor_type, actor_label, action, outcome,
                                entity_type, entity_id, after, reason)
    VALUES ('bootstrap', 'owner:sql-editor:' || current_user, 'role.assign', 'succeeded',
            'role_assignment', v_id::text,
            jsonb_build_object('user_id', v_user, 'role_key', 'super_admin',
                               'language', NULL, 'section', NULL, 'expires_at', v_expires),
            v_reason);

  RAISE NOTICE 'Super Admin granted to % (assignment %), expires %', v_email, v_id, v_expires;
END $$;

COMMIT;
```

**Verification** (run after each account; each line says what to expect):

```sql
-- 1. The active Super Admins: exactly the accounts bootstrapped so far.
SELECT u.email, p.status, p.mfa_required, a.id, a.reason, a.granted_at, a.expires_at
  FROM public.role_assignments a
  JOIN public.staff_profiles p ON p.user_id = a.user_id
  JOIN auth.users u ON u.id = a.user_id
 WHERE a.role_key = 'super_admin' AND a.revoked_at IS NULL
 ORDER BY a.granted_at;

-- 2. One bootstrap audit row per grant, and the chain intact (expect NULL).
SELECT seq, at, actor_label, action, entity_id, reason FROM public.audit_log
 WHERE actor_type = 'bootstrap' ORDER BY seq;
SELECT public.audit_verify_chain();

-- 3. Negative: the app's role cannot bootstrap. Expect an ERROR from the trigger, then ROLLBACK.
BEGIN;
SET LOCAL ROLE service_role;
INSERT INTO public.role_assignments (user_id, role_key, reason, expires_at)
  SELECT user_id, 'super_admin', 'bootstrap: must fail', now() + interval '1 day'
    FROM public.staff_profiles LIMIT 1;
ROLLBACK;

-- 4. Negative: the audit log cannot be edited. Expect an ERROR, then ROLLBACK.
BEGIN;
SET LOCAL ROLE service_role;
UPDATE public.audit_log SET reason = 'tampered' WHERE actor_type = 'bootstrap';
ROLLBACK;
```

5. In the app: the user signs in at `/admin/login`, enrols TOTP, and `/api/admin/me` lists
   `super_admin` with `aal2`. An `auth.sign_in` and an `auth.mfa_enrolled` row appear in the
   activity log.

**Rollback.** Grants are history, so a rollback revokes; it does not delete:

```sql
BEGIN;
UPDATE public.role_assignments
   SET revoked_at = now(), revoked_by = NULL, revoke_reason = 'bootstrap rollback: <why>'
 WHERE id = '<assignment id from verification 1>' AND revoked_at IS NULL;
INSERT INTO public.audit_log (actor_type, actor_label, action, outcome, entity_type, entity_id, reason)
  VALUES ('bootstrap', 'owner:sql-editor:' || current_user, 'role.revoke', 'succeeded',
          'role_assignment', '<assignment id>', 'bootstrap rollback: <why>');
-- Optional, to stop the person signing in to the admin at all:
-- UPDATE public.staff_profiles SET status = 'suspended' WHERE user_id = '<user id>';
COMMIT;
```

The revocation takes effect within 60 seconds (the permission cache). For an immediate effect, also
sign the user out of all sessions in the dashboard. Rolling back the whole access foundation
(dropping the tables) is in the migration's own rollback section. It is safe only before go-live:
once `audit_log` holds real rows, it is never dropped.
