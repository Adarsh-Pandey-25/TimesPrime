# Back-office panels

This file records the back office: the rules it follows, and what has been built, panel by panel,
with who is allowed to do what. The [definition of done](#definition-of-done) says when a panel is
finished. The [access rules](#access-rules) say who may do what: the panels, the 15 roles, the
permission matrix, the four-eyes and MFA rules, and the data model. The order of work is in
[`NEWSROOM_PLAN.md`](NEWSROOM_PLAN.md). The [index](#index) and the [panels](#panels) say what has
been built, and they must match the code. Each panel's design, approved before its code, is the
last part of this file.

The panels are built **one at a time**. A panel is finished (backend, screens, permissions, tests
and docs) before the next one starts. Panel 0 comes first because every other panel depends on it.
When a panel is done, its section below is filled in from the template and the index is updated in
the same piece of work.

## Definition of done

The owner's rules for the back office (until 2026-11-04 in `CLAUDE.md`, "Back-office panels";
`CLAUDE.md` now points here).

- **Plan:** [`NEWSROOM_PLAN.md`](NEWSROOM_PLAN.md): the phases, their order and what each delivers.
- **Access rules:** the [access rules](#access-rules) below (roles, the permission matrix, the
  four-eyes and MFA rules, the data model). Change them only with the owner's approval.
- **Progress and per-panel records:** this file. Its [index](#index) says which panel is next.
- **One panel at a time,** in the plan's order: 0 → 1 → 2 → 3 → 7 (launch minimum) → 8 (launch
  minimum) → launch → 7 and 8 in full → 4 → 5 → 6 → 9. No panel starts before the previous one is
  done.
- **Every panel starts with a design**, a section of this file ("Panel N design"), approved by the
  owner before code. Panel 0's is [below](#panel-0-design-the-access-foundation).
- **A panel is done only when:**
  1. Every feature in its entry in this file works, and the entry matches the code.
  2. Every route and action it adds checks a permission server-side; tests prove allowed and denied.
  3. Privileged actions are audited and need MFA where the plan says so.
  4. `npm run verify` and CI are green; routes, JS and CSS reported.
  5. SQL is in migration files with a rollback, listed as an owner action.
  6. This file, the current status in `docs/OPERATIONS.md` and `docs/ARCHITECTURE.md` are updated.
     (Until 2026-11-04 this item named `docs/PANEL_DOCS.md`, `docs/HANDOFF.md` and
     `docs/ARCHITECTURE.md`; HANDOFF became the current status in OPERATIONS.md.)
  7. Database tests against the real database are read-only. The database's own rules (triggers,
     audit hash chain, bootstrap) are verified by the owner via the runbook.
  8. End-to-end browser tests cover the critical flows, including a refused-access flow.
  9. Every screen has loading, error and empty states.
  10. Accessibility is checked (keyboard, labels).
  11. Failures reach Sentry; privileged actions are audited.
  12. A JS size budget per route is enforced in CI.
  13. A runbook covers what to do when the main flow breaks.

## Access rules

The access specification every back-office panel follows. Change it only with the owner's approval:
propose the change in the panel's design (below, or a new design section), then regenerate the
catalogue SQL. Report errors or conflicts with the code instead of working around them. The
generator and `packages/shared/src/config/permissions.test.ts` read the matrix between the two
markers below.

<!-- BEGIN:access-rules -->

**What this is:** the access rules every back-office panel follows: the roles, the permission matrix,
the four-eyes, takedown and MFA rules, and the data model behind them. The build order is in
[`NEWSROOM_PLAN.md`](NEWSROOM_PLAN.md); what is built is in `PANEL_DOCS.md`.

**Where it came from:** the owner's `PANEL_PLAN.md` (2 Nov 2026), retired on 4 Nov 2026 when the
owner approved `NEWSROOM_PLAN.md`. The sections below are copied from it unchanged, except where
a note says otherwise. The supporting publisher research is in [`RESEARCH.md`](RESEARCH.md) and in
git history (`git log --all -- docs/PANEL_PLAN.md`).

**The matrix is canonical.** `scripts/generate-access-catalog.mjs` turns the matrix below into
`database/migrations/2026-11-02-access-2-catalog.sql`, and `packages/shared/src/config/permissions.test.ts` checks
the result cell by cell. To add or change a permission: propose it in the panel's design, get the
owner's approval, edit the row here, regenerate the SQL (`node scripts/generate-access-catalog.mjs`),
and ship it as a new migration.

### Panels

Each panel is gated by permission. The order they are built in is `NEWSROOM_PLAN.md` section 4
(the Phase column of the original table is dropped for that reason).

| Panel | Purpose | Features (exists / new) | Primary roles |
|---|---|---|---|
| Desk (Articles) | Review, edit, publish, unpublish aggregated and editorial items | Articles table, search, bulk actions, publish endpoint (exists); workflow states, revision history, approve queue, desk filter en/hi + section (new) | Writer, Sub-editor, Desk Editor, Managing Editor |
| Front page | Curate what readers see first | Breaking-news banner (exists); pinned slots above algorithmic order, scheduled expiry (new) | Desk Editor, Managing Editor |
| Ingestion | Control sources and sync | NewsData sync dashboard, purge (exists); source registry with licence status, snippet/full-text flag, kill switch, 60-day purge floor (new) | Ingestion Ops, Rights/Legal |
| AI assistant | Configure and monitor the chat assistant | Prompt/config versions, disabled topics, usage metrics; transcript access only if stored and gated as reader data (new) | Super Admin, Managing Editor (read) |
| Insights | Read-only numbers | Category stats, DB stats (exists); traffic and sync KPIs (new) | Analyst, all editors |
| Compliance | Statutory queues | Grievances with 24h/15-day SLA clocks and monthly Rule 18/19 export; corrections log; legal-orders register (restricted); content snapshot export (new) | Grievance Officer, Legal/Compliance, Standards Editor |
| Privacy & security | Reader data and incidents | Rights-request queue (90-day ceiling), consent ledger, incident clock (6h CERT-In / 72h DPDP), audit log viewer (new) | Privacy Officer, Security Lead |
| Administration | People and access | Health page (exists); staff accounts, role assignments with scope and expiry, MFA status, break-glass grants, access review (new) | Super Admin |
| Commercial (later) | Reader revenue and ads | Subscriber lookup (masked), offers, refunds; sponsored-content queue with label lock; ad ops (GAM itself, not rebuilt) | CRM Manager, Support Agent, Brand Studio, Ad Ops, Finance |

The commercial panel should be thin. The publishers studied run GAM, Piano or Evolok, and CleverTap or MoEngage as separate SaaS consoles with their own role systems. TimesPrime should do the same and not rebuild ad trafficking or a CDP. Its own panel then only needs a sponsored-content workflow, a masked subscriber view for support, and links out to vendor consoles whose user lists are reviewed alongside internal roles.

### Generic roles, scoped by language desk and section

Following the Arc, Quintype and OWASP guidance, role names stay generic and scope lives in attributes. There is one "Desk Editor" role assigned with scope `language = hi, section = sports`, not a "hindi_sports_editor" role. OWASP explicitly warns that pure RBAC leads to "role explosion" and recommends attribute- or relationship-based checks at object level ([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)). A null scope means all languages or all sections, and only Managing Editor and above should hold null-scope editorial grants. Every assignment carries `expires_at`, so a stringer covering elections or a contractor gets time-boxed access by default.

The matrix uses these codes: **F** = full, **S** = within assigned language/section scope, **Own** = own items only, **A** = can act but a second person must approve, **R** = read-only, **M** = masked view, **—** = none. Phase 1–3 roles come first and commercial roles last.

| Permission (verb) | Super Admin | Managing Editor | Desk Editor | Sub-editor | Writer | Ingestion Ops | Analyst | Grievance Officer | Legal/Compliance | Privacy Officer | Security Lead | CRM Mgr (P4) | Support (P4) | Brand Studio (P4) | Ad Ops (P4) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| article.view_admin | F | F | S | S | S | R | R | R | R | — | — | — | — | Own | — |
| article.create / edit | — | F | S | S | Own | — | — | — | — | — | — | — | — | Own (sponsored) | — |
| article.submit | — | F | S | S | Own | — | — | — | — | — | — | — | — | Own | — |
| article.approve (≠ author/last editor) | — | F | S | — | — | — | — | — | — | — | — | — | — | — | — |
| article.publish (after approval) | — | F | S | S | — | — | — | — | — | — | — | — | — | — | — |
| article.publish_direct (breaking, flagged) | — | F | S | — | — | — | — | — | — | — | — | — | — | — | — |
| article.unpublish / takedown | F (break-glass) | F | S | — | — | — | — | — | F | — | — | — | — | — | — |
| article.restore | — | A | A | — | — | — | — | — | A | — | — | — | — | — | — |
| article.bulk_action | — | F | S | — | — | — | — | — | — | — | — | — | — | — | — |
| breaking_banner.manage / push.send | — | F | S | — | — | — | — | — | — | — | — | — | — | — | — |
| homepage.curate | — | F | S | — | — | — | — | — | — | — | — | — | — | — | — |
| correction.publish | — | F | S | A | — | — | — | R | R | — | — | — | — | — | — |
| sponsored.label_remove | — | — | — | — | — | — | — | — | F | — | — | — | — | — | — |
| sponsored.approve | — | R | — | — | — | — | — | — | F | — | — | — | — | — | F |
| source.manage (add, licence flags, full-text) | F | A | — | — | — | A | — | — | F | — | — | — | — | — | — |
| source.kill_switch | F | F | — | — | — | F | — | — | F | — | — | — | — | — | — |
| sync.run / sync.view | F | R | R | — | — | F | R | — | — | — | R | — | — | — | — |
| content.purge (respects 60-day floor) | A | — | — | — | — | A | — | — | — | — | — | — | — | — | — |
| ai.configure | F | R | — | — | — | — | — | — | R | — | — | — | — | — | — |
| stats.view | F | F | S | S | S | R | F | — | — | — | — | R | — | — | R |
| grievance.handle / report | — | R | — | — | — | — | — | F | F | — | — | — | — | — | — |
| legal_order.manage (confidential) | — | R | — | — | — | — | — | — | F | — | — | — | — | — | — |
| content_records.export | — | — | — | — | — | — | — | A | F | — | — | — | — | — | — |
| reader_pii.view | — | — | — | — | — | — | — | M | M | F | — | M | M | — | — |
| reader_pii.reveal (reason logged) | — | — | — | — | — | — | — | — | — | F | — | A | — | — | — |
| reader_data.export / dsr.handle | — | — | — | — | — | — | — | — | — | F | — | — | — | — | — |
| subscription.refund (P4) | — | — | — | — | — | — | — | — | — | — | — | F | A | — | — |
| incident.manage | F | — | — | — | — | — | — | — | R | F | F | — | — | — | — |
| audit.read | F | S (own desk) | — | — | — | — | — | — | F | F | F | — | — | — | — |
| user.manage / role.assign | A | S (assign ≤ Desk Editor in own scope) | — | — | — | — | — | — | — | — | — | — | — | — | — |
| settings.manage / health.view | F | R | — | — | — | R | — | — | — | — | F | — | — | — | — |

Two design choices in the matrix need explaining. Super Admin holds no editorial verbs by default. The technical owner who can grant roles should not also be the person who publishes, and on a small team that person gets a separately assigned, audited Managing Editor role if they also edit. This is NIST's separation of duty in its lightest form ([NIST RBAC FAQ](https://webarchive.library.unt.edu/eot2008/20080916003800/http:/csrc.nist.gov/groups/SNS/rbac/faq.html)). Network-wide revenue, when ads and subscriptions arrive, should be its own explicit permission (`revenue.view_all`) and not ride on report access. GAM's lack of such a permission is a gap to avoid copying.

### Four-eyes, takedown and MFA rules

The approval rules borrow directly from documented products. Publishing requires an approval by someone other than the author and the last editor, enforced per object (Contentstack's self-approval block). The Publish action stays hidden until the item is in the Approved state (VIP's Publish Guard). Breaking news gets a narrow escape hatch: `article.publish_direct` held by Desk Editors in scope, which publishes immediately and automatically opens a post-hoc review item. Unpublish and takedown should be **single-actor for speed**, because legal and defamation exposure grows by the hour and intermediary timelines are now measured in hours. They still require a reason code, MFA and an immediate notification to the Managing Editor and Legal. **Restore needs a second approver**, because a wrongful restore is the riskier error. Granting any privileged role (Super Admin, Managing Editor, Legal, Privacy Officer) needs two admins. Bulk purge needs two people and must refuse to delete anything published or aggregated within 60 days, to protect Rule 19(3) records. Every privileged role (Super Admin, Managing Editor, Desk Editor, Legal, Privacy Officer, Security Lead, Ingestion Ops) must sign in at Supabase's **`aal2` assurance level, which is issued only after a verified second factor**. The permission check refuses privileged verbs at `aal1` ([Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa.md)). Break-glass access is a time-boxed (for example 2-hour) grant with a mandatory reason and an alert. It replaces the habit of sharing the old password. Break-glass is standard practice, but no source here prescribes a specific procedure.

### Data model

*Note (4 Nov 2026):* the access tables (`staff_profiles` to `audit_log`) are built in Panel 0. The
`articles (extend)` and `article_revisions` rows are superseded: original journalism gets a new
`stories` table with `story_revisions` (`NEWSROOM_PLAN.md`, Phase E1), and `articles` stays the
aggregator's. The `sources` row becomes Panel 4's licensed wire basket.

The tables below extend Supabase's documented RBAC pattern, which uses `user_roles`, `role_permissions` and a `security definer authorize()` function called from RLS ([Supabase RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac)). They add scope, expiry and live lookups. The official example puts a single role into the JWT, which cannot express "Desk Editor for hi/politics plus Writer for en/sports". Scope must therefore come from the table, not the token.

| Table | Key columns | Notes |
|---|---|---|
| staff_profiles | user_id (→ auth.users), display_name, status (active/suspended), mfa_required, last_seen_at | A row here is what makes an auth user staff. Never derive staff status from user_metadata, which users can edit themselves. |
| roles | key, label, is_privileged, requires_aal2 | About 11 rows in Phase 1–3 |
| permissions | key (e.g. `article.approve`), risk (low/high/critical), description | Verbs as data, so adding one is a migration, not a code rewrite |
| role_permissions | role_key, permission_key | The matrix above, as rows |
| role_assignments | id, user_id, role_key, language (en/hi/null), section_id (nullable), granted_by, approved_by, reason, granted_at, expires_at, revoked_at | Scope and time-boxing live here; supports break-glass rows |
| articles (extend) | language, section_id, workflow_state, created_by, last_edited_by, approved_by, published_by, published_revision_id, legal_hold, sponsored_flag, advertiser_ref | Live revision pointer allows editing a draft without changing the live copy |
| article_revisions | id, article_id, body/snapshot, editor_id, created_at | Also serves the 60-day content-record duty |
| workflow_transitions | article_id, from_state, to_state, actor_id, reason, at | Approve/publish history; feeds the self-approval check |
| sources | id, name, licence_status (licensed/RSS/scraped), full_text_allowed, snippet_cap, enabled, reviewed_by | Ingestion and the copyright kill switch |
| audit_log | id, at, actor_id, actor_roles (snapshot), aal, action, entity_type, entity_id, language, section_id, before/after (jsonb), reason, ip, user_agent, request_id, prev_hash | Supersedes admin_logs; append-only |
| grievances, corrections, legal_orders, dsr_requests, incidents | standard ticket fields + SLA deadlines + assignee | legal_orders readable only with `legal_order.manage` |

The core check is one `security definer` function, conceptually `has_permission(user, permission, language, section)`. It returns true when an unexpired, unrevoked assignment exists for an active staff profile whose role carries that permission and whose scope is null or matches. Object-level checks (four-eyes, own-items-only) are separate helpers that read `workflow_transitions` and `created_by`. `audit_log` is append-only: revoke UPDATE and DELETE from every application role, and chain each row to the previous one with `prev_hash` so tampering is evident. Supabase's supa_audit trigger is useful for row diffs, but it does **not** record the acting user ([Supabase blog](https://supabase.com/blog/2022/03/08/audit)). The backend must therefore write the actor-aware `audit_log` row in the same transaction as the change.

### How the check flows: the proxy guesses, the backend decides

*Note (4 Nov 2026):* the layer names below are the original plan's. In today's code they are
`src/app` (routes), `apps/admin/src/proxy.ts`, `packages/server/src/auth`, `packages/server/src` and `packages/shared/src/config`.

Next.js's guidance is explicit. Middleware (now `proxy.ts`) runs on every request including prefetches, so it should do only **optimistic, cookie-based checks** and "should not be your only line of defense". Secure checks belong in a `server-only` Data Access Layer, and Server Actions and Route Handlers should be treated like public API endpoints ([Next.js](https://nextjs.org/docs/15/app/guides/authentication)). The fetched guide is the v15 version, and the guidance carries over to the Next 16 rename. Today TimesPrime checks only in `proxy.ts`, which is exactly the single line of defence the docs warn against.

| Layer | Responsibility after the change |
|---|---|
| app/ (routing shell) | Renders panels; nav items are hidden using a permission list fetched server-side (UX only, never a security boundary) |
| proxy.ts | Verifies a Supabase session cookie exists and is unexpired on /admin/ *and* /api/admin/, otherwise redirects to login; no database calls; replaces the HMAC shared-password cookie |
| backend/auth (server-only) | `getStaffSession()` (memoised per request) returns user, aal and active assignments; `requirePermission(verb, {language, section, articleId})` calls `has_permission` live and applies object rules; throws 401/403 |
| backend/* modules | Every Server Action and /api/admin handler calls `requirePermission` first, then performs the change and writes `audit_log` in one transaction |
| database/ | Tables, `has_permission`, RLS policies that call the same function (defence in depth), restrictive `aal2` policies on privileged tables |
| Upstash Redis | Short-TTL (about 60 s) cache of a user's resolved permissions, cleared on any role_assignments change; rate limits on login and on high-risk verbs; revocation list for forced sign-out |
| shared/ | The permission-key catalogue as typed constants, so frontend and backend cannot drift |

Live table lookups matter because JWT claims refresh only when the token refreshes. Supabase notes that even an MFA downgrade takes effect only at the next refresh ([Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa.md)). A revoked editor must lose publish rights immediately, not when their token rolls over. The ingestion cron should keep using the service-role key inside `backend/` only. Staff actions should migrate to a user-context Supabase client so RLS applies as a second check. Phase 1 can ship with DAL enforcement alone and add RLS in Phase 2.

### Retention

Retention settings follow from the statutes. Audit and access logs should be kept for **at least one year**, which covers both DPDP's one-year floor and CERT-In's 180 days. Content snapshots are kept for at least 60 days, and orders, takedowns and corrections much longer for litigation holds. Run the Supabase project in an Indian region, or export logs to Indian storage. Whether a cloud region in India satisfies "Indian jurisdiction" was not confirmed. A quarterly access review (who holds what, which assignments are expired, which vendor seats are unused) is the cheapest control against the privilege creep OWASP warns about ([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)).

<!-- END:access-rules -->

## Index

| # | Panel | Status | Date completed | Commits |
|--:|---|---|---|---|
| 0 | Access foundation: staff accounts, roles, permissions, MFA, audit log, the permission check | **In progress**, paused for `release/v1`; on `main` since `chore/integrate` (4 Nov 2026): built and tested with mocks; its database-level checks are unverified (the owner verifies them against the real database when panels resume) | — | `e9bce19`..`f357d71`, then the second half through `chore/integrate`; [list](#commits) |
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
means every item in the [definition of done](#definition-of-done) holds. A panel is
never marked Done while an owner action it depends on is unrecorded.

## Words used in this file

| Word | Meaning |
|---|---|
| Permission | One action on one kind of thing, written as `object.verb`, for example `article.publish`. The full list is the matrix in the access rules (`PANEL_DOCS.md`) |
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
- **Code:** *where its code lives: the view in `src/app/`, the route bodies in `apps/web/src/app/api/`,
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
| *`apps/admin/src/app/api/admin/…test.ts`* | *A Desk Editor in `hi` can publish a `hi` article* | *A Desk Editor in `en` gets 403 for the same article; an expired assignment gets 403* |

*Every permission check needs an allowed test and a denied test. Add what was checked by hand, and
the `npm run verify` and CI result at the time the panel was marked Done.*

#### Known limits and not yet built

*What the plan asks for that this panel does not do yet, and why. Link each item to its
backlog entry (`docs/OPERATIONS.md`) or to the later panel that will do it.*

## Panels

### Panel 0: Access foundation

#### Panel

- **Name:** Access foundation.
- **URLs:** `/admin/login` (staff sign-in and the second factor), `/admin` (shows only what the user
  holds), `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/me` and
  `POST /api/admin/mfa` (new). Every other `/api/admin/*` route now checks a permission.
- **Code:**
  - `packages/server/src/auth/`: `requirePermission.ts` (the gate), `decide.ts` (the rule), `scope.ts`,
    `adminRoutePolicy.ts` (every route's rule), `staffSession.ts`, `supabaseServer.ts`, `mfa.ts`, and
    `adminSession.ts` (the shared password, with its end date);
  - `packages/server/src/repositories/staff.ts` and `auditLog.ts`; `apps/admin/src/app/api/admin/me/route.ts` and `mfa.ts`;
  - `packages/shared/src/config/permissions.ts`, `apps/admin/src/proxy.ts`;
  - `apps/admin/src/app/admin/login/page.tsx` and `apps/admin/src/app/admin/page.tsx` (the dashboard);
  - the SQL in `database/migrations/2026-11-02-access-*.sql` and `database/bootstrap/super-admin.sql`.
- **Design:** [Panel 0's design](#panel-0-design-the-access-foundation), and
  [ADR 0003](ARCHITECTURE.md#adr-0003--an-articles-section-for-permission-scope-is-its-first-category-2026-11-02) for the section rule.

#### Purpose

It replaces the one shared admin password with named staff accounts. Each account holds roles in a
language and section, signs in with a second factor, and leaves a record of every change it makes.
Every later panel depends on knowing who is acting and what they may do.

#### Roles and responsibilities

Panel 0 defines all 15 roles of the plan's matrix ([the access rules](#access-rules)). In this panel:

| Role | What they do here |
|---|---|
| Super Admin | Signs in with a second factor. Sees sync, stats, health, the activity log and the articles list. Holds no editorial verbs (by the plan's design). Granting roles in the app is Panel 1 |
| Managing Editor | Everything editorial in every scope: edit, unpublish, bulk delete, publish, the breaking banner |
| Desk Editor | The same within their language and section. Not the banner: it is site-wide and needs an unscoped grant (Panel 3 gives banners a language) |
| Sub-editor, Writer | Read the articles list and stats; a Sub-editor edits within scope. Writer's "Own" waits for Panel 2 (no `created_by` yet) |
| Ingestion Ops | Runs the full NewsData sync, reads health and stats |
| Legal/Compliance | Unpublishes an article in any scope (takedown, F); reads the articles list and the activity log |
| Analyst, Security Lead, Privacy Officer | Read what their cells allow (stats, sync status, health, the activity log) |
| The owner | Applies the SQL, creates the first Super Admins by SQL, and is the way back in ([runbook](OPERATIONS.md#staff-access-switching-on-panel-0-and-getting-back-in)) |
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
| `GET /api/admin/breaking-news` | `breaking_banner.manage` (read, any scope); the banner manager's list. Readers get the items from `apps/web`'s public `GET /api/news/breaking-news` (since 4 Nov 2026) | Managing Editor F; Desk Editor S | — | yes for these roles | denials |
| `POST`, `DELETE /api/admin/breaking-news` | `breaking_banner.manage`, site-wide | Managing Editor (unscoped grants only) | — | yes | attempted + outcome |
| `POST /api/admin/publish-article` | `article.publish_direct` and `article.create`, in en + the category | Managing Editor F; Desk Editor S | post-hoc review is Panel 2 | yes | attempted + outcome |
| `POST /api/admin/seed-supabase` | `sync.run`, site-wide | Super Admin, Ingestion Ops F | — | yes | attempted + outcome |
| `POST /api/admin/db-stats` (purge) | `content.purge` | Super Admin, Ingestion Ops A: **refused for everyone** until Panel 4's approval flow | needs two people | — | denials |
| `GET /api/admin/db-stats`, `/stats` | `stats.view` (read, any scope) | many (matrix) | — | per role/profile | denials |
| `GET /api/admin/health` | `health.view` (read) | Super Admin, Security Lead F; Managing Editor, Ingestion Ops R | — | per role/profile | denials |
| `GET /api/admin/logs` | `audit.read` (read; a scoped holder sees only their scope) | Super Admin, Legal, Privacy Officer, Security Lead F; Managing Editor S (own desk) | — | yes | denials |
| `GET /api/admin/me`, `POST /api/admin/mfa` | none: session-only | any staff session, `aal1` included | — | — | sign-in and MFA events |
| `POST /api/admin/login`, `/logout` | none: public (D10; the banner's GET left this list on 4 Nov 2026) | — | — | — | sign-in, sign-out |

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
| `database/migrations/2026-11-02-access-2-catalog.sql` | The 15 roles, 39 permissions, 136 matrix rows, generated from the matrix (then in `PANEL_PLAN.md`, now the access rules (`PANEL_DOCS.md`)) | Re-run the previous version, or the foundation rollback | **No** |
| `database/migrations/2026-11-02-access-3-freeze-admin-logs.sql` | `admin_logs` read-only (after the deploy) | `GRANT ALL ... TO service_role` | **No** |
| `database/bootstrap/super-admin.sql` | One invited user becomes a Super Admin, audited as `bootstrap` | Revoke, in the file | **No** |

The order (migrations, deploy, bootstrap, staff sign-in, freeze, then the shared password off) is
in [the staff-access runbook](OPERATIONS.md#staff-access-switching-on-panel-0-and-getting-back-in). `admin_logs` changes meaning: it is
history, no longer written.

#### Tests and verification

| Test file | What it proves | Denied cases covered |
|---|---|---|
| `apps/admin/src/app/api/admin/access.test.ts` | **The route walk** (every admin route file on disk is public, session-only or ruled, and every rule is tested) and **the access matrix**: every guarded route and method through its real handler and the real gate, with grants read from the catalogue SQL | No session (401), no grants, expired, wrong scope, no MFA, the shared password where not allowed, the purge for every holder; nothing written in any of them. Also: moves out of scope, one out-of-scope article in a bulk delete, Sub-editor publish and bulk, an unwritable audit row (503), the 100-article limit |
| `packages/server/src/auth/decide.test.ts` | The rule: each code, scope, expiry, MFA, break-glass, the legacy list | Every "no" path has an allowed twin |
| `packages/server/src/auth/requirePermission.test.ts` | The gate, the audit pair, the denial audit | Revoked or suspended between two requests is refused on the second |
| `packages/server/src/auth/staffSession.test.ts`, `apps/admin/src/proxy.test.ts` | Who is asking; the proxy accepts both sessions; cookie flags | Forged or signed-out JWTs, errors, the legacy end date |
| `apps/admin/src/app/api/admin/login/route.test.ts`, `logout.test.ts`, `me.test.ts`, `mfa.test.ts` | Sign-in, sign-out, `/me`, the second factor | Wrong credentials, not staff, suspended, wrong code, rate limits, the legacy end date and kill switch |
| `packages/shared/src/config/permissions.test.ts`, `packages/server/src/repositories/accessSchema.test.ts` | The catalogue equals the matrix cell for cell; the SQL's guarantees | — |
| `apps/admin/src/app/admin/page.test.tsx`, `apps/admin/src/app/admin/login/page.test.tsx`, `apps/admin/src/components/ActivityLog.test.tsx` | What the UI shows for each user; the sign-in steps; no clear button; each screen's loading, error and empty state | Hidden widgets for missing permissions |
| `apps/admin/src/components/labels.test.tsx` | Every select on `/admin` has an accessible name | — |
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
[the staff-access runbook](OPERATIONS.md#staff-access-switching-on-panel-0-and-getting-back-in), Part B, when panels resume.

Definition of done (CLAUDE.md), at the pause:

| # | Item | Status |
|---|---|---|
| 1 | Features work; this entry matches the code | Built; the staff flows are proven with stubbed Supabase only |
| 2 | Server-side permission on every route and action; allowed and denied tests | Done (`access.test.ts`, the route walk) |
| 3 | Privileged actions audited; MFA where the plan says | In the code and unit-tested; the database side unverified |
| 4 | `npm run verify` and CI green; routes, JS and CSS reported | Verify green; CI on the pushed branch |
| 5 | SQL in migrations with a rollback, listed as an owner action | Done (Database changes, above) |
| 6 | PANEL_DOCS, the current status and ARCHITECTURE updated | PANEL_DOCS and the current status at the pause and at the merge into `main` (4 Nov 2026); CODEMAP was retired on `main` |
| 7 | Real-database tests | **Not done**: the local database was dropped; the owner's check by hand instead |
| 8 | End-to-end tests of the critical flows, with a refused-access flow | Partly: read-only (refused access, the sign-in page, the reader); sign-in and MFA in a browser cannot be read-only |
| 9 | Loading, error and empty states | Done, with tests |
| 10 | Accessibility (keyboard, labels) | Done for the sign-in page (axe, keyboard) and the labels on `/admin`; the signed-in dashboard is not checked by axe (it needs a sign-in) |
| 11 | Failures reach Sentry; privileged actions audited | Done in the code, with tests |
| 12 | A JS budget per route in CI | Done (`scripts/check-js-budget.mjs`, in verify and CI) |
| 13 | A runbook for when the main flow breaks | Done ([the sign-in runbook](OPERATIONS.md#staff-sign-in-or-an-admin-action-is-failing)) |

#### Known limits and not yet built

- **Not applied:** none of the SQL is applied yet, and the back office is not deployable until it is (the current status, `docs/OPERATIONS.md`).
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
second half): `d1bff91` through this entry, listed in the current status (`docs/OPERATIONS.md`), section 4.

## Panel 0 design: the access foundation

**Status:** **Approved with conditions** by the owner on 2026-11-02 (STEP 2), and **built** (STEP 3):
complete on the branch `panel-0-access`, awaiting the owner's merge. What was built, and how it
checks, is in `PANEL_DOCS.md`; where the build went past this file (the
session-only routes and the sign-in flow), PANEL_DOCS is the record.
The section "Approval: decisions and amendments" below overrides anything later in this file that
disagrees with it.
*Note (4 Nov 2026): `PANEL_PLAN.md` was retired; its matrix and rules are now in
[the access rules](#access-rules). References to it below are kept as written.*

**Plan:** `PANEL_PLAN.md`, "The proxy guesses and the backend decides", the
matrix, and "Four-eyes, takedown and MFA rules". **Owner decisions folded in:** the twelve answers to
the Step 1 report (2026-11-02), cited below as D1 to D12.
**Related:** [ADR 0003](ARCHITECTURE.md#adr-0003--an-articles-section-for-permission-scope-is-its-first-category-2026-11-02) (the primary-section rule),
[BL-033](OPERATIONS.md#backlog) (retention), [BL-034](OPERATIONS.md#backlog) (the chain's head hash).

Panel 0 replaces the shared admin password with named staff accounts. Every admin route checks a
permission on the server, privileged staff sign in with a second factor, and every privileged action
lands in an append-only audit log. It adds no new admin screens beyond sign-in and MFA. Managing
people and roles in the app is Panel 1.

### Approval: decisions and amendments (2026-11-02)

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

### 0. What the docs say, and what it changes

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

### 1. Data model

Everything below is SQL in files that the owner applies. The app never runs DDL.

#### Files

| File | What it does | When the owner applies it |
|---|---|---|
| `database/migrations/<date>-access-foundation.sql` | The six new tables, their triggers, RLS, grants | Step A, before the code deploy |
| `database/migrations/<date>-access-catalog.sql` | Seeds `roles`, `permissions`, `role_permissions` from the matrix | Step A, right after |
| `database/bootstrap/super-admin.sql` | Makes one invited user a Super Admin (§7). Run once per account | Step B, after the deploy |
| `database/migrations/<date>-freeze-admin-logs.sql` | Revokes writes on `admin_logs` | Step C, after the deploy is verified |

All are idempotent (`IF NOT EXISTS`, `ON CONFLICT`, `DROP POLICY IF EXISTS`). Each ends with a
rollback section and verification queries, in the style of
[the database runbook](OPERATIONS.md#applying-the-database-files). That runbook gains the new steps.
**Deviation, stated:** the bootstrap script goes in `database/bootstrap/`, not `migrations/`. It is
not a schema change: it takes an email as input and is run by hand once per account.

#### Tables

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

#### RLS and grants

- RLS is enabled on all six tables. No policy is created for `anon` or `authenticated`, and
  `REVOKE ALL ... FROM anon, authenticated` on each, so both get nothing.
- The app reads and writes them as `service_role` through `packages/server/src/` only (plan: "Phase 1 can ship
  with DAL enforcement alone and add RLS in Phase 2"). A SQL `has_permission()` function and
  `aal2` restrictive policies come with the user-context client in Phase 2. Writing it now would
  mean two copies of the same rule, in SQL and TypeScript, with nothing yet calling the SQL one.
- **Why this matters with `@supabase/ssr`.** A signed-in staff member now holds a real Supabase
  access token for the `authenticated` role. With the public anon key, that token could call
  PostgREST directly. Today's grants already limit `authenticated` to `SELECT` on `articles` and
  `breaking_news` (public data) and nothing on `admin_logs`; the new tables add nothing. A test
  reads the SQL files and fails if any grant to `authenticated` appears on a staff table.

#### `admin_logs`

Recommended: **read-only, not migrated.** After the deploy, nothing writes it. The step C SQL
revokes `INSERT`/`UPDATE`/`DELETE` from `service_role`, so it becomes a frozen record of the
shared-password era, queryable in SQL and kept for at least one year. Copying its rows into
`audit_log` was considered and rejected: the copies would carry no actor and would enter the hash
chain as if the new system had recorded them. The activity log in `/admin` reads `audit_log` from
the deploy on.

### 2. Permission catalogue

`database/migrations/<date>-access-catalog.sql` seeds the 15 roles, 39 permissions and the
`role_permissions` rows, generated from the matrix by a script kept in `scripts/`. A test parses the
matrix out of `docs/PANEL_PLAN.md` and the inserts out of the SQL file and requires them to agree
cell for cell, in both directions. `packages/shared/src/config/permissions.ts` holds the 39 keys as a typed
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

### 3. How a request is checked

```
browser ──cookie sb-<ref>-auth-token──▶ apps/admin/src/proxy.ts (matcher unchanged: /admin/:path*, /api/admin/:path*)
   public allowlist? ──yes──▶ next
   getClaims(): valid, unexpired JWT?  (refreshes the token if due, sets cookies, no DB call)
   or a valid legacy cookie, before the cut-off date (§7)?
   neither ──▶ 401 JSON for /api/admin/*, redirect to /admin/login for pages
   ──▶ route body in apps/admin/src/app/api/admin/*
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

**Modules** (all `packages/server/src/auth/`, all `import "server-only"`; `apps/admin/src/proxy.ts` may import them, P1):

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
because the key parameter is the typed union from `packages/shared/src/config/permissions.ts`. At runtime it
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

### 4. Today's admin routes and what each will require

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

### 5. MFA

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

### 6. Audit log

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

**Writers.** `packages/server/src/repositories/auditLog.ts` gets `recordStaffAudit()`, which throws on failure
(the caller refuses the action), and `recordSystemAudit()` for the cron, which logs and reports to
Sentry but never stops a run: the same contract `logAdminAction` has today. `logAdminAction` and its
callers move to the new writers.

**Append-only and retention.** §1: no `UPDATE`/`DELETE`/`TRUNCATE` for any app role, triggers that
raise, a hash chain, and at least one year.

### 7. Cut-over from the shared password

| Step | Who | What | The way back in |
|---|---|---|---|
| A | Owner | Apply the two migrations (tables, catalogue). Turn off "Allow new users to sign up". Confirm TOTP MFA is enabled | Nothing has changed for users yet |
| Deploy | Owner | Deploy Panel 0. Both logins work: staff accounts, and the shared password | The shared password, unchanged |
| B | Owner | Invite two Super Admins (Dashboard → Authentication → Invite user). Each accepts and sets a password. Run `database/bootstrap/super-admin.sql` once per account. Each signs in and enrols MFA | The shared password; and the SQL editor |
| C | Owner | Verify the step B checks; apply the `admin_logs` freeze | As above |
| Run | Everyone | Editorial work continues on the shared password, now audited as `legacy:shared-password`. Super Admins work on their accounts | As above |
| Removal | Me, then owner | When the conditions below hold, one deletion commit removes the legacy path; the owner deletes `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` from the hosting environment | The SQL editor (below) |

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
A **hard end date** is a constant in `packages/server/src/auth/legacySession.ts`. After it, the legacy cookie and
login are refused even if the code is never changed. Proposed: **2026-12-31**. An env switch,
`ADMIN_LEGACY_LOGIN=off`, ends it earlier with no deploy. **Owner decision needed (Q3).**

**The exact removal step.** One deletion commit:
- deletes `legacySession.ts` and the legacy branches in `apps/admin/src/proxy.ts` and `apps/admin/src/app/api/admin/login/route.ts`;
- removes `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` from `.env.local.example` and its sync test;
- removes the "shared password" option from the login view.

Its conditions: two Super Admins have signed in with `aal2` in production, Panel 1 can grant roles,
and the owner says go.

**No lockout, ever.** The owner's own way in does not depend on the app: the Supabase dashboard
(reset a password, delete a lost factor, invite a user) plus the SQL editor (the bootstrap script,
which works as `postgres` and nothing else). That is the sealed break-glass. It is written up as an
owner runbook, the staff-access runbook (`docs/OPERATIONS.md`): bootstrap, lost MFA device, locked-out last Super
Admin, suspected stolen session (sign out all sessions from the dashboard).

### 8. Owner actions

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
8. At the end of the cut-over: delete `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` from the hosting
   environment and from `.env.local`. Also `ADMIN_SECRET_TOKEN`, which nothing reads (gotcha 3.9).

No new secret is needed. `@supabase/ssr` uses `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, which are already set.

#### The new dependency (D8)

The docs say it is needed (§0). The official package is `@supabase/ssr`, published by Supabase.

| Option | Versions | Published | Cost |
|---|---|---|---|
| **A (recommended)** | `@supabase/ssr@0.12.7`, and `@supabase/supabase-js` 2.109.0 → **2.116.0** | 2026-09-08 and 2026-09-07, both about 8 weeks old | 0.12.7 needs `supabase-js` `^2.114.0` (its `peerDependencies`), so `supabase-js` moves up 7 minor versions. That touches every database call, so it is its own commit with the full test suite |
| B | `@supabase/ssr@0.12.0`, `supabase-js` unchanged | 2026-06-09 | Its peer range `^2.108.0` accepts the installed 2.109.0. But it is five months behind seven releases |

Both are older than two weeks, and both are minor versions. A is recommended because the install is
pinned exact and the package sits on the authentication path, where the newest patch matters more
than the smallest diff. `@supabase/ssr` adds one dependency, `cookie` (`^1.0.2`). It runs on the
server only, so no client bundle grows from it. **Owner decision needed (Q4).**

### 9. Test plan

Tests come first for every authorization module (master prompt rule 4).

| Test | Proves |
|---|---|
| `packages/server/src/auth/decide.test.ts` | Each code: `F`, `S`, `R`, `M`, `Own`, `A`, break-glass, both `read` and `act`. Expired, revoked and future assignments. Suspended profile. Unknown role. A role without the permission. Language and section match and mismatch, NULL scope, NULL target fields. `aal1` vs `aal2` for `requires_aal2` roles and for `mfa_required` profiles. Every "no" path, and the allowed path for each |
| `packages/shared/src/config/permissions.test.ts` | The matrix parsed out of `docs/PANEL_PLAN.md` (31 rows × 15 roles) equals the catalogue SQL's `role_permissions`, and the 39 keys equal the typed constant |
| `packages/server/src/auth/scope.test.ts` | `english ↔ en`, `hindi ↔ hi`, anything else → NULL; `category[0]`, empty and NULL categories (D5, D6) |
| `packages/server/src/auth/requirePermission.test.ts` | Session errors → 401; staff-record lookup failure → 503 and no handler call; Redis down → falls back to Supabase, never to "allowed"; a denial writes a `denied` row |
| `apps/admin/src/app/api/admin/accessWalk.test.ts` | **The route walk.** It lists every `apps/admin/src/app/api/admin/**/route.ts` from disk and each method the backend module exports. Each must appear either in `publicAdminRoutes.ts` or in the §4 mapping table (also data in that module). The test fails on a route or method that is in neither, so a new route cannot ship unguarded. For every guarded method it calls the handler with (1) no session → 401, (2) a signed-in staff member with no assignments → 403, and (3) an `aal1` session holding the right role → 403 `mfa_required`. The Supabase mock asserts the handler wrote nothing |
| One allowed test per route | The least-privileged role in the matrix gets 2xx, e.g. a Desk Editor `hi` + `sports` can edit a `hindi` article whose `category[0]` is `sports`, and gets 403 on an `english` one |
| `apps/admin/src/proxy.test.ts` | Characterization first (proxy is at 0% today): public paths, method-aware breaking-news, 401 vs redirect. Then the Supabase session, the legacy cookie before and after the end date, the allowlist read from the shared module |
| `apps/admin/src/app/api/admin/login/route.test.ts`, `mfa.test.ts`, `me.test.ts` | Staff sign-in, MFA enrol and verify, rate limits, legacy cut-off, cookie flags (`HttpOnly`, `SameSite=Lax`) |
| `packages/server/src/repositories/auditLog.test.ts` | Staff writer throws on failure; system writer never throws; a privileged route whose `attempted` write fails returns 503 and does not act |
| `packages/server/src/repositories/schema.test.ts` (extended) | The SQL files: `REVOKE UPDATE, DELETE, TRUNCATE` on `audit_log`; the append-only triggers; no grant to `anon`/`authenticated` on the new tables; the bootstrap path tied to `current_user = 'postgres'`; every rollback drops what its file creates |
| UI | Characterization tests before changing `AdminLoginView` and `ActivityLog` (no tests today), then the MFA steps and the removed clear button |

Database behaviour (triggers, the chain, the two-admin rule) cannot run in jest, which has no
database. It is proven by the verification queries the owner runs, including negative ones that
must fail (Appendix A).

#### Build order for Step 3, after approval

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

### 10. Questions for the owner

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

### Appendix A: the bootstrap script

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
