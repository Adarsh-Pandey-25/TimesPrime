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
a note says otherwise. *Note (17 Nov 2026):* the rows `author.manage` and `media.manage` were added
with the owner's approval of the Panel 2 design. The supporting publisher research is in [`RESEARCH.md`](RESEARCH.md) and in
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
| author.manage | — | F | F | — | — | — | — | — | — | — | — | — | — | — | — |
| media.manage | — | F | S | — | — | — | — | — | — | — | — | — | — | — | — |
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

*Note (19 Nov 2026, the owner's approval of the [Panel 1 design](#panel-1-design-administration)):*
for `user.manage` and `role.assign`, adding access needs two people and removing it needs one.
- **A counts as read** for the permission it is on: whoever may ask must see what they ask about.
- **Removing access is single-actor:** revoking a role, suspending an account and ending its
  sessions, like a takedown. It cannot create privilege.
- **Nobody acts on their own access:** nobody grants or renews their own role, or approves a request
  they made or one about themselves.
- **Break-glass is self-activated:** a Super Admin starts it for themselves, with a reason, for at
  most 2 hours, and the other Super Admins are alerted.

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
| 1 | Administration: users, role assignments with scope and expiry, access review | **In progress:** [design](#panel-1-design-administration) approved 19 Nov 2026 (started at the owner's request while Panel 2's last items are open); [M1](#panel-1-administration) (people and roles, PRs #43 and #44) built; M2 (accounts: adding people, one-time links, lost factors, the welcome page; PRs #46 and #47) built; M3 (break-glass, the access review, roles ending soon; PR #48 and the screens) built; M4 (retiring the shared password) next | — | — |
| 2 | Desk: articles (write, review, approve, publish, unpublish) | **In progress:** [design](#panel-2-design-the-desk-publisher) approved 17 Nov 2026, started before Panel 1 at the owner's request; M1 (stories backend) being built | — | — |
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
- The authenticator app shows the entry as **TimesPrime**, with the person's email under it (the
  owner's choice, 19 Nov 2026; `TOTP_ISSUER` in `packages/server/src/auth/mfa.ts`, from the
  publisher's name in `packages/shared/src/config/site.ts`). It names the publication, not a role:
  one account has one second factor for every role it holds, so a new role or panel needs no change.
  Entries set up before 19 Nov 2026 show "localhost:3000" (OPERATIONS.md, gotcha 3.39).
- One sign-in page for everyone, then the page of their work (the owner's choice, 18 Nov 2026;
  `landingPath` in `packages/shared/src/lib/staffLanding.ts`): a newsroom role (Writer, Sub-editor,
  Desk Editor, Managing Editor) lands on `/admin/desk`; the Super Admin, even holding a Desk role,
  and every other role on `/admin`. Where a person lands decides nothing: the server checks every
  request, as before. If the roles cannot be read, `/admin`.
- Every back-office page's top bar says who is signed in and as what (their roles and desks, as
  "Super Admin · Desk Editor (English, Hindi)"), and offers Sign out (the owner asked, 18 Nov 2026;
  `describeRoles` in `packages/shared/src/lib/staffRoles.ts`).
- `/admin` shows only the widgets and buttons the user's permissions allow, and sends a session that
  still owes its code back to finish signing in.
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
| `database/migrations/2026-11-02-access-2-catalog.sql` | The 15 roles, 41 permissions, 140 matrix rows (39 and 136 until Panel 2 added two rows, 17 Nov 2026), generated from the matrix (then in `PANEL_PLAN.md`, now the access rules (`PANEL_DOCS.md`)) | Re-run the previous version, or the foundation rollback | **No** |
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

### Panel 1: Administration

**In progress.** [Design](#panel-1-design-administration) approved on 19 Nov 2026. Built so far:
**M1**, "people and roles": M1a, the backend (migration admin-1, the reach rules, the API, every
route tested allowed and denied; PR #43), and M1b, the screens (PR #44). **M2a**, the accounts
backend: adding a person, one-time "set your password" links, resetting a lost second factor, and
the welcome and password routes (PR #46); and **M2b**, their screens (PR #47). **M3a**, the
backend of break-glass, the access review and what needs a look (migration admin-2; PR #48), and
**M3b**, their screens. M4 (retiring the shared password) follows.

#### Panel

- **Name:** Administration.
- **URLs:**
  - `GET /api/admin/people` (the directory);
  - `GET` and `PATCH /api/admin/people/[id]` (one person; a new display name);
  - `POST /api/admin/people/[id]/suspend`, `reactivate` and `sign-out`;
  - `POST /api/admin/people/[id]/roles` (grant), `roles/[assignmentId]/renew` and `revoke`;
  - `GET /api/admin/people/requests`, and `POST requests/[requestId]/approve`, `decline` and
    `cancel`;
  - M2: `POST /api/admin/people` (add a person), `POST /api/admin/people/[id]/password-link` and
    `mfa-reset`; `POST /api/admin/welcome` (public: opens a link) and `POST /api/admin/password`
    (session-only: sets one's own password). The page `/admin/welcome` is public too;
  - M3: `GET /api/admin/people/alerts` (what needs a look), `POST` and `DELETE
    /api/admin/people/break-glass` (start, end early), `GET` and `POST /api/admin/people/review`
    (the access review; complete it).

  The screens: `/admin/people` (the directory, and a Super Admin's requests) and
  `/admin/people/[id]` (one person). "People" is in the top bar for holders of `user.manage`.
- **Code:**
  - the routes in `apps/admin/src/app/api/admin/people/`, with `_lib/people.ts` (the gate on a
    person, the audit, a request), `_lib/views.ts` (what is sent back, and what the caller may do)
    and `_lib/decision.ts` (deciding a request);
  - `packages/server/src/services/people/reach.ts` (who may do what to whom);
  - `packages/server/src/repositories/people.ts` (profiles, assignments, requests, Supabase Auth's
    accounts);
  - `packages/shared/src/config/people.ts` (expiry choices, the roles a Managing Editor grants, the
    scope check);
  - the screens: `apps/admin/src/app/admin/people/` and `apps/admin/src/components/people/`
    (`PeopleDirectory.tsx`, `RequestsBox.tsx`, `PersonDetail.tsx`, `peopleClient.ts`);
  - the rules in `packages/server/src/auth/adminRoutePolicy.ts`;
  - the SQL in `database/migrations/2026-11-19-admin-1-access-requests.sql`.

#### Purpose

People and their access are managed in the app instead of by SQL: who is staff, which roles they
hold, in which desk and until when, and taking access away at once when it must go. Adding access
needs two people, and removing it needs one.

#### Roles and responsibilities

| Role | What they do here |
|---|---|
| Super Admin | Sees everyone. Asks to grant, renew, rename or reactivate; a second Super Admin decides. Revokes, suspends and signs out at once |
| Managing Editor | Sees the people of their desks. Grants, renews and revokes Writer, Sub-editor and Desk Editor in their own scope, and renames, suspends, reactivates and signs out those people, all at once |
| Everyone else | Nothing here (403) |

#### Features and functionality

- **The directory:** each person's name, email, status, live roles with desk and expiry, whether a
  second factor is set, and the last sign-in. If Supabase Auth cannot be asked, it still answers,
  without emails and factors (`accounts: false`).
- **A person:** their account, every role they hold or held (live, expired or revoked), the
  requests about them in the last 30 days, their Panel 1 history from the audit log (for holders of
  `audit.read`), and what the caller may do (`can`: `act`, `ask` or nothing, per action and per
  role).
- **Grant** a role, in a scope (a language, a section, or all), for 30, 90, 180 or 365 days (180 by
  default, 365 for a Super Admin), with a reason. Roles of the matrix's Phase 1 to 3 only; the
  commercial roles wait for Panel 9.
- **Renew** a live or expired role: a new row from now, and the old one revoked as "renewed", in
  one transaction.
- **Revoke** a role, with a reason. Applies to the person's next request.
- **Suspend** (with a reason): every check says no, and their sessions are ended; their roles stay
  for a reactivation. **Reactivate**, **rename**, and **sign out everywhere**.
- **Requests:** a Super Admin's grant, renewal, rename or reactivation answers 202 with a request.
  Another active Super Admin approves or declines it within 72 hours; the person who asked may
  cancel it. An approval makes the change in the same transaction.
- **The screens** (M1b), each with loading, error and empty states:
  - **the directory:** search, and filters by role, language and status; each name links to the
    person. A Super Admin sees "Waiting for your approval" (Approve, Decline, with an optional
    note) and "Your requests" (Cancel). A Managing Editor is told which desks they manage;
  - **one person:** the account (email, second factor, last sign-in, staff since); every role,
    with Renew (for 30, 90, 180 or 365 days) and Revoke where allowed, each needing a reason;
    "Grant a role" with the roles the caller may grant; rename, suspend or reactivate, and sign
    out everywhere; the requests about them; their history. A button says "Ask to …" where the
    change is a request, and the answer says a second Super Admin decides it.
- **Adding a person** (M2a): email, name, first role, desk, days, reason. The account is made in
  Supabase Auth with the email confirmed and no password (an existing account with that email, not
  staff, is reused), then the staff profile and the role. A Managing Editor adds Writer, Sub-editor
  or Desk Editor in their scope at once; a Super Admin asks. An email that is already staff is
  refused (409 `staff`).
- **A one-time "set your password" link** (M2a): Supabase's `generateLink` (type `recovery`) gives a
  token, and the app builds its own address, `/admin/welcome?token_hash=…&type=recovery`
  (`welcomePath`); Supabase's redirect is never used. The link goes back **once**: to a Managing
  Editor who added the person or asked for it, or, for a Super Admin's request, to the second Super
  Admin when they approve (*as built:* the design said "to the admin who added them"; the token is
  not stored, so it can only be shown to whoever is on screen when it is made). It is never stored
  or written to the audit log. It works once, until Supabase's email-link expiry: **1 hour** (the
  owner, 19 Nov 2026, amending decision 3 after Supabase warned that 24 hours is more than it
  recommends; `LINK_VALID_FOR` in `packages/shared/src/config/people.ts` says it on screen).
- **Resetting a lost second factor** (M2a): always two Super Admins. One asks, with how they checked
  it is the person; the other approves, and then every factor of the account is deleted and every
  session ended. At their next sign-in the person sets up a new one. A Managing Editor is refused.
- **Opening a link** (`POST /api/admin/welcome`, public, 10 tries per address in 15 minutes):
  Supabase exchanges the token for a session (`verifyOtp`); someone who is not active staff is
  signed out again (403). The answer says whether the account already has a second factor.
- **Setting one's password** (`POST /api/admin/password`, session-only): at least 12 characters,
  without the email's name; with a second factor set up, only from an `aal2` session, so a link
  or a stolen password alone cannot change it. Afterwards every session of the account ends, and
  the person signs in again. Supabase's own refusals (a reused password) come back in its words.
- **The screens** (M2b), each with loading, error and empty states:
  - **`/admin/people/new`, adding a person:** email, name, role (those the caller may grant), desk,
    days, reason. "Add" for a Managing Editor, "Ask to add" for a Super Admin. An email already on
    the staff links to their page. The directory has "Add a person" ("Ask to add a person");
  - **the one-time link box** (`LinkBox.tsx`): the full address (this back office's own origin and
    the API's path), a Copy button, and the warnings: it works once, for 1 hour; it is shown only
    now; hand it over directly, never in a group. It appears after adding a person, after making
    a password link, and, for the approver, after approving an addition or a password link;
  - **one person:** "Make a password link" ("Ask for a password link") and "Ask to reset the
    second factor", each with its reason (for a reset: how they checked it is the person);
  - **`/admin/welcome`** (public): the token leaves the address bar at once and is sent once; a
    used, expired or incomplete link says so, with the way to sign-in; with a second factor, its
    code first; then a password, checked on the page and by the server; then "Go to sign-in",
    where a new person sets up their authenticator (TimesPrime).
- **Break-glass** (M3a; design §5): a Super Admin starts their own emergency access with a reason:
  a `super_admin` row with `is_break_glass`, granted by themselves, ending exactly 2 hours later
  (`BREAK_GLASS_HOURS`; the database allows no more). It turns on the matrix's break-glass cells and
  nothing else: today, taking an article or a Desk story down. One at a time (409 `active`); never
  extended; ended early with `DELETE`. A Managing Editor is refused. Revoking a Super Admin's role
  ends their break-glass with it.
- **What needs a look** (M3a; `GET /api/admin/people/alerts`), for the top bar and the directory:
  every break-glass in use, with who, why and until when (Super Admins: the alert break-glass
  promises); when the access review is due (Super Admins); and live roles ending within 14 days,
  among the people the caller sees. If admin-2 is not applied yet, the review part is null.
- **The access review** (M3a; design §6): `GET` lists every unrevoked assignment, live or expired,
  never break-glass, each flagged if the person has not signed in for 60 days (or ever), has no
  second factor, holds a privileged role, or the row expired; and when the review is due (90 days
  after the last one, or now). Revoking and renewing use their own routes. `POST` completes it: a
  note and a decision per row (`keep`, `revoked`, `renew_asked`, `renewed`; unmarked is `keep`); the
  snapshot is read from the database at that moment, not taken from the screen. Super Admins only.
- **The screens** (M3b), each with loading, error and empty states:
  - **the top bar, for Super Admins, on every page:** a red alert while anyone's emergency access is
    on (whose, until when, why, and a link to People), and a reminder when the access review is due
    (with "Start it");
  - **People:** an "Emergency access" box for Super Admins (the reason, "Start emergency access",
    "End it now", and anyone else's in use); the last review and when the next is due, with the way
    to it; "Roles ending within 14 days", each linking to the person (everyone who manages people,
    for their people);
  - **`/admin/people/review`:** every role with its flags (no sign-in for 60 days, no second factor,
    privileged, expired), Renew and Revoke with a reason ("Access review" if left empty), and
    "Complete the review" with a note; the record cannot be changed afterwards.

#### Access permissions and authorization rules

| Route | Permission | Who, and how | Four-eyes | MFA (`aal2`) | Audited |
|---|---|---|---|---|---|
| `GET people`, `GET people/[id]` | `user.manage`, read | Super Admin (A, now counted as read): everyone. Managing Editor (S): people with a role in their scope; others 403 | — | yes | denials |
| `PATCH people/[id]`, `reactivate` | `user.manage`, act | Managing Editor for their people: at once. Super Admin: a request | Super Admin: a second Super Admin | yes | `staff.rename`, `staff.reactivate`, or `access.request` |
| `suspend`, `sign-out` | `user.manage`, act | Super Admin, or a Managing Editor for their people: at once. Sign-out: anyone for themselves | — (removing access) | yes | `staff.suspend`, `staff.sign_out` |
| `roles` (grant), `renew` | `role.assign`, act | Managing Editor: Writer, Sub-editor, Desk Editor in their scope, at once. Super Admin: a request | Super Admin: a second Super Admin; the database requires two for a privileged role | yes | `role.assign`, `role.renew`, or `access.request` |
| `revoke` | `role.assign`, act | Super Admin; a Managing Editor for the roles they could grant | — (removing access) | yes | `role.revoke` |
| `GET requests` | `role.assign`, read | Super Admins see every open request and those decided in 30 days; others get an empty list | — | yes | denials |
| `approve`, `decline`, `cancel` | `role.assign`, act | Approve and decline: another active Super Admin, not the person it is about, before it lapses. Cancel: the person who asked | yes | yes | `access.approve`, `access.decline`, `access.cancel` |
| `POST people` (add) | `user.manage` and `role.assign`, act | Managing Editor: Writer, Sub-editor, Desk Editor in their scope, at once. Super Admin: a request | Super Admin: a second Super Admin | yes | `staff.add`, or `access.request` |
| `password-link` | `user.manage`, act | Managing Editor for their people, at once; Super Admin: a request. Not for oneself, not for a suspended person | Super Admin: a second Super Admin | yes | `staff.password_link` (no token), or `access.request` |
| `mfa-reset` | `user.manage`, act | Super Admin only, always a request; a Managing Editor gets 403 | always two Super Admins | yes | `access.request`, then `access.approve` with the factors removed |
| `POST /api/admin/welcome` | none: public | Anyone holding a valid token; 10 per address in 15 minutes | — | — | `auth.welcome_link_used` |
| `POST /api/admin/password` | none: session-only | The account's own session; `aal2` once it has a second factor | — | where a factor exists | `auth.password_set` |
| `GET alerts` | `user.manage`, read | Super Admins: break-glass in use and the review due; everyone allowed: roles ending soon among the people they see | — | yes | denials |
| `POST`, `DELETE break-glass` | `role.assign`, act | A Super Admin, for themselves; a Managing Editor gets 403 | — (self-activated, note d) | yes | `access.break_glass_start`, `access.break_glass_end` |
| `GET`, `POST review` | `role.assign`, read / act | Super Admins only; others 403 | — | yes | `access.review_complete` |

- **Nobody changes their own access** (403 `own_access`): no grant, renewal, rename, suspension,
  reactivation or revocation for oneself, and no decision on a request about oneself.
- **The last active Super Admin** cannot be suspended or lose the role (409 `last_super_admin`).
- **Refusals:** 401 with no session; 403 `forbidden`, `mfa_required`, `staff_only` (the shared
  password), `own_access`, `four_eyes` or `not_yours`; 409 for a state that does not allow it
  (`holds`, `suspended`, `revoked`, `decided`, `lapsed`); 400 for a bad body (an unknown role, a
  desk role with no language, an unknown section, days other than 30/90/180/365, no reason).
- **Every audit row** is about the person (`entity_type` `staff`, the person's id), with the role's
  scope for a role's change, the state before, the reason, and the outcome's details.
- **`decide()` change:** A now counts as read for the permission it is on (approval, note a). `/me`
  still reports such a permission as `ask`.

#### Database changes

| Migration file | What it does | Rollback | Applied by the owner |
|---|---|---|---|
| `database/migrations/2026-11-19-admin-1-access-requests.sql` | The one-row index gains `is_break_glass`; `is_active_super_admin` ignores break-glass rows; the guard trigger allows a Super Admin's own break-glass row (for M3); `access_requests` with its decide-once trigger; `access_grant`, `access_decide` and `staff_end_sessions` | At the end of the file, before the first request or break-glass row | **Yes,** 19 Nov 2026; its check returned true, false, false, true, false, true |
| `database/migrations/2026-11-19-admin-2-access-reviews.sql` | `access_reviews` (who, when, a note, the snapshot), append-only through access-1's `reject_change`; the app may read and add | At the end of the file, before the first review | **Yes,** 19 Nov 2026; its check returned 1, false, false, true |

No column changes meaning. A lapsed request is an open one whose `lapses_at` has passed: it is
not stored as an outcome, and it cannot be decided.

#### Tests and verification

| Test file | What it proves | Denied cases covered |
|---|---|---|
| `apps/admin/src/app/api/admin/access.test.ts` | Every Panel 1 route for its least-privileged holder (a Managing Editor for one language; a Super Admin for a decision), through the real gate; a Super Admin's grant becomes a request; an approval is one database call | No session, no grants, expired, no MFA, the shared password, the other language; a privileged role or another desk for a Managing Editor; oneself; the last Super Admin; the asker, the person it is about, or a Managing Editor deciding; lapsed, decided, someone else's cancel; a bad body |
| `packages/server/src/services/people/reach.test.ts` | A and S, reach, "their people", the directory, the plan for each change | Expired or revoked grants give no reach; a Super Admin or Managing Editor is never a Managing Editor's person |
| `packages/server/src/repositories/adminSchema.test.ts` | admin-1, read as text: the index, the guard keeping access-1's rules, the break-glass exception, the checks on requests, the grants, one `SECURITY DEFINER` function | — |
| `packages/server/src/repositories/people.test.ts` | Database errors as statuses; Supabase Auth's accounts, page by page, a verified factor only; "another active Super Admin" asked of the database | Auth's failure is an error, not an empty answer |
| `packages/shared/src/config/people.test.ts` | The role lists equal the catalogue SQL's flags; expiry choices; the scope check | Unknown language or section, a desk role with no language |
| `packages/server/src/auth/decide.test.ts`, `apps/admin/src/app/api/admin/me/route.test.ts` | A counts as read; `/me` still says `ask` | A still cannot act |
| `apps/admin/src/components/people/people.test.tsx` | The directory and a person's page for each answer: a Super Admin's requests and Approve; a Managing Editor's desks; filters; Grant as a request ("Ask to grant") or at once; Revoke with its reason; Suspend and "Ask to reactivate"; oneself; every filter named | No actions where the API offers none; a refusal and "not found" shown; buttons disabled until a reason is given |
| `apps/admin/src/components/AdminTopBar.test.tsx` | "People" for a holder of `user.manage` | Not for a Writer |
| `access.test.ts` (M2) | Adding a person at once (the account confirmed with no password, the profile, the role, the link) or as a request (no account made); a password link at once or asked; a factor reset asked; approving an addition (the account first, then the decision with its id), a reset (every factor deleted, the sessions ended, then the decision) and a link; the link never in the audit log; the public and session-only lists | An email already staff, a bad email, another desk; a Managing Editor resetting a factor; oneself; a suspended person; a decline changes no account |
| `apps/admin/src/components/people/accounts.test.tsx` | Adding a person (the roles the caller may grant; the link box once, with its warnings; a request with no link; an email already on the staff); a password link and a factor reset on a person's page; the approver's link; the welcome page (the token out of the address and sent once; password, confirm and the page's check; the code first with a factor; back to the code when the server asks) | No form without the right; no reset or link where the API offers none; an incomplete link asks nothing of the server; a used link explained |
| `e2e/admin-access.spec.ts` (M2b, read-only) | Signed out, adding a person goes to sign-in; `/admin/welcome` without a token explains itself | No call to the server from the welcome page without a token |
| `access.test.ts` (M3) | Break-glass: a self-granted `super_admin` break-glass row ending in exactly 2 hours, audited; with it a Super Admin takes a Desk story down; revoking a Super Admin's role ends it. The review: a snapshot from the database with the marked decisions. What needs a look: break-glass in use and the review due for a Super Admin; roles ending soon among the people the caller sees | A Managing Editor starting break-glass or reviewing; no reason; a second break-glass; ending one that is not on; without break-glass, no takedown; a bad decision or id |
| `packages/server/src/services/people/review.test.ts` | What a review goes through (unrevoked, live or expired, never break-glass) and its four flags; when it is due; roles ending within 14 days; the snapshot | An unknown factor is not "none"; a revoked row only if marked |
| `adminSchema.test.ts` (admin-2) | Append-only, starts from no rights, read and add only, RLS on, the rollback | — |
| `apps/admin/src/components/people/review.test.tsx`, `AdminTopBar.test.tsx` (M3b) | Emergency access started with a reason and ended; another Super Admin's shown; the review due and the way to it; roles ending soon for a Managing Editor; the review page's flags, Revoke and Renew (a request), and completing it with the decisions; the top bar's red alert and review reminder | No emergency box for a Managing Editor; no alerts asked for anyone else; a refused review shown; a failed revoke explained and left as it was; nothing to review |
| `e2e/admin-access.spec.ts` (M3b, read-only) | Signed out, the review page goes to sign-in | The alerts and break-glass routes answer 401 |
| `apps/admin/src/app/api/admin/welcome/route.test.ts`, `password/route.test.ts` | A good link gives a session and says whether a factor exists; a password is set, then every session ends | A missing, malformed or other-kind token (Supabase not asked); a used or expired link; not staff or suspended (signed out again); 10 tries per address; an `aal1` session with a factor; a weak password; Supabase's refusal |
| `e2e/admin-access.spec.ts` (read-only) | Signed out, `/admin/people` and a person's page go to sign-in | Three people routes answer 401 |

#### Known limits and not yet built

- **M4:** retiring the shared password. Then Panel 1's definition of done, and the walk-through
  with the owner and Vivek (with the roles-and-testing document the owner will ask for).
- **Owner action for M3:** done. admin-2 is applied (19 Nov 2026, its check passed).
- **Owner action for M2:** done. Supabase's email-link expiry is 1 hour (19 Nov 2026; OPERATIONS.md,
  "Panel 1: links and lost factors"). If it changes, `LINK_VALID_FOR` changes with it.
- **An added person who is never given their link** has an account nobody can sign in to; a new
  link (password link) or revoking their role and suspending them tidies it. Accounts are never
  deleted.
- **Owner actions:** admin-1 is applied (19 Nov 2026, its check passed). The second Super Admin is
  Vivek (the owner, 19 Nov 2026), created with B3 of the staff-access runbook; until then no Super
  Admin request can be decided and no Managing Editor granted.
- **Revoking a Super Admin** does not yet revoke their break-glass row; break-glass comes in M3,
  which handles it.

### Panel 2: Desk (the Publisher)

**Status: in progress.** Built so far: M1a (the stories backend's core), M1b (the Desk API, PRs #17
and #18) and the two-person restore. M1 is complete. M2's code is complete (the editor package, the
Desk's screens, the story's revisions on screen); the Hindi typing check still closes it. M3's code
is complete: the reader's story page (PR #23), the preview in the back office (decision 7, PR #24),
scheduled publishing (PR #25), corrections (PR #26) and the takedown alert list (PR #27). M4 is
under way (approved by the owner, 18 Nov 2026): authors and a story's credits (PR #28), the
media library's first part (PR #30), its renditions (PR #31), images in stories (PR #33), authors' photos and
galleries are built (below): M4's code is complete. Its definition of done is checked below; the panel is
not yet Done. Started before Panel 1 at the owner's request (17 Nov 2026);
[the design](#panel-2-design-the-desk-publisher) is approved.

#### Panel

- **Name:** Desk, the Publisher.
- **URLs:** the Desk API under `/api/admin/desk/`:
  - `stories`: GET (the list, in the caller's scopes) and POST (create);
  - `stories/[id]`: GET;
  - `stories/[id]/revisions`: GET and POST (save);
  - `stories/[id]/revisions/[revisionId]`: GET;
  - `stories/[id]/lock`: POST (take, renew, or `take_over`) and DELETE;
  - `stories/[id]/` plus `assign`, `submit`, `send-back`, `approve`, `schedule`, `unschedule`,
    `publish`, `publish-direct`, `unpublish`, `retract` and `kill`: POST;
  - `stories/[id]/details`: POST (the slug, the embargo and the legal-review flag, before publication);
  - `stories/[id]/restore`: POST, to ask for a restore;
  - `stories/[id]/correct`: POST, a live story's public correction note (published at once, or
    asked for);
  - `pending/[actionId]/decide`: POST, to approve or decline a restore or a correction request;
  - `alerts`: GET, the takedowns of the last 30 days in the caller's desks;
  - `authors`: GET (the list) and POST (a new author); `authors/[id]`: PATCH (edit, retire, bring
    back);
  - `stories/[id]/credits`: POST, the story's credits, before publication;
  - `media`: GET (the library, in the caller's desks) and POST (an upload); `media/[id]`: PATCH (its
    record, rights, retiring); `media/[id]/original`: GET (the original file, for staff in its desk).

  The screens (M2): `/admin/desk` (the list), `/admin/desk/new` and `/admin/desk/[id]` (the story),
  linked from the back office's top bar; (M3) `/admin/desk/[id]/preview`, the story's preview; and
  (M4) `/admin/desk/authors`, the authors, and `/admin/desk/media`, the media library. Each app
  also answers `/media/renditions/...` from the local media folder on a laptop (404 on the server,
  and for an original anywhere).

  The reader's story pages (M3): `/{section}/{slug}-{number}` in English and
  `/hi/{section}/{slug}-{number}` in Hindi, where the number is the story's `public_id`.
- **Code:**
  - `packages/shared/src/config/desk.ts`: the states, the table of moves, the checklist, the
    embargo;
  - `packages/shared/src/lib/storyUrl.ts`: a story's address (`deskStoryPath`, `deskStoryIdFrom`);
  - `packages/server/src/services/desk/fourEyes.ts`;
  - `packages/server/src/services/desk/publish.ts` (publishing's rules, shared by the Publish route
    and the scheduler) and `scheduler.ts` (the worker's `publish-scheduled` job, in
    `apps/worker/src/jobs.ts`), started by `deploy/systemd/timesprime-publish.timer`;
  - `packages/server/src/repositories/stories.ts`, including the reader's read, `getPublishedStory`;
  - `packages/editor/src/render.ts`: the reader's renderer;
  - the reader's pages: `apps/web/src/app/_story/storyPage.tsx`, used by `[section]/[story]` and
    `hi/[section]/[story]`;
  - the story's view, shared by the reader's page and the Desk's preview:
    `packages/ui/src/StoryArticle.tsx` and its text styles, `packages/ui/src/story.css`;
  - the preview: `apps/admin/src/components/desk/StoryPreview.tsx`;
  - authors and credits: `packages/server/src/repositories/authors.ts`, `listCredits` and
    `setCredits` in `stories.ts`, the routes' checks in `apps/admin/src/app/api/admin/desk/_lib/authors.ts`,
    and the screens `AuthorsManager.tsx` and `CreditsPanel.tsx`;
  - the media library: `packages/shared/src/config/media.ts` (types, limits, keys),
    `packages/server/src/lib/mediaStorage.ts` (S3 or a folder, one interface),
    `packages/server/src/repositories/media.ts`, the routes' checks in `_lib/media.ts`, and the
    screen `MediaLibrary.tsx`;
  - the renditions: `packages/server/src/services/desk/renditions.ts` (with sharp), the worker's
    `make-renditions` job in `apps/worker/src/jobs.ts`, started by
    `deploy/systemd/timesprime-renditions.timer`; the original's route,
    `apps/admin/src/app/api/admin/desk/media/[id]/original/route.ts`;
  - images in stories: the `image` node in `packages/editor/src/schema.ts` and its drawing in
    `render.ts`; `storyImageIds` and the checklist's `imageChecklist` in `packages/shared`;
    `packages/server/src/services/desk/storyImages.ts` (what a page draws, what the checklist
    reads); the editor's view and picker, `editorImage.ts` and `ImagePicker.tsx`; migration desk-7;
  - authors' photos and galleries: `photo_id` in `repositories/authors.ts`, `photoRefusal` in
    `_lib/authors.ts`, `listAuthorPhotos` in `repositories/media.ts`, `bylinePhotos` and
    `previewPhotos` in `storyImages.ts`, `BylinePhoto` in `packages/ui/src/StoryArticle.tsx`; the
    `gallery` node in `schema.ts`; `ImagePicker.tsx`'s photo and gallery modes; migration desk-8;
  - `packages/server/src/auth/decide.ts`: the Own code;
  - `database/migrations/2026-11-17-desk-1-stories.sql`;
  - the routes in `apps/admin/src/app/api/admin/desk/`, with their shared steps in
    `desk/_lib/desk.ts`;
  - their rules (all `staffOnly`) in `packages/server/src/auth/adminRoutePolicy.ts`.

#### Purpose

The newsroom's own stories, in English and Hindi: written, checked, approved by a second person,
scheduled, published, corrected and taken down. They live in their own tables, apart from the
aggregator's `articles` and its 7-day purge.

#### Roles and responsibilities

| Role | What they do in this panel |
|---|---|
| Writer | Creates and edits their own stories in their scope, and submits them |
| Sub-editor | Edits any story in scope, passes it to the desk, publishes approved stories in scope |
| Desk Editor | Approves (never their own work), publishes, publishes breaking news directly, takes down, in scope |
| Managing Editor | All of the Desk Editor's work, in every language and section |
| Legal/Compliance | Takes down; asks for or approves a restore |

#### Features and functionality

- **Built (M1a), no route uses it yet:**
  - the database tables, history and atomic moves (owner action: apply the migration);
  - the workflow table: from which states each action starts, where it leads, and its permission;
  - Publish Guard, the reasons each move needs, the pre-publish checklist and the embargo check;
  - four-eyes from the history;
  - Own in the permission rule;
  - the store, with lists kept inside the caller's scopes.
- **Built (M1b): the Desk API.**
  - Create, read, list, save, lock, and every move in the table.
  - Each move checks: the move's own permission; four-eyes and the checklist on approval; the
    embargo on publishing; a reason code and a note on a takedown; the lock on a save.
  - Every change is audited, attempted then outcome.
  - The shared password is refused (`staff_only`).
- **Built: the two-person restore.**
  - A holder of `article.restore` (A: Desk Editor, Managing Editor, Legal) asks, with a reason.
  - A different holder decides it, in the story's desk: approved puts the story back live with its
    revision, declined leaves it down.
  - One open request per story. The database refuses a requester deciding their own request.
  - Both steps are audited.
- **Built (M2, first part): `packages/editor`.**
  - **The story schema,** `storyExtensions()`: Tiptap 3.32.2's StarterKit with headings 2–3, no code,
    and links only to https, site paths or mailto; plus factbox, related link, embed (YouTube, X and
    Instagram only, rendered as a plain link) and an ad-slot placeholder.
  - **The body's plain text and word count,** read from the stored JSON without Tiptap.
  - **The revision diff:** blocks first, then words inside a changed block. It is our own code.
- **Built (M2, second part): the Desk's screens.**
  - **The list:** the stories of the person's desks, with filters (language, section, state, mine,
    needs post-hoc review), paging, and loading, empty and error states.
  - **New story:** its desk, format, pitch or draft, and a working headline.
  - **The story screen:**
    - the Tiptap editor with the schema's blocks, and the headline, dek and SEO fields;
    - Save, which adds a revision and is refused if someone saved meanwhile;
    - the soft lock, renewed every 30 seconds, with an audited take-over;
    - the details (slug, with a suggestion from the headline; the embargo; the legal-review flag);
    - the pre-publish checklist;
    - the moves the person holds for the story's state;
    - asking for and deciding a restore;
    - the history.
  - **Shown, never decided:** every button is the server's to allow, and the screen shows the server's
    answer, refusals included. The shared password is told to sign in with a staff account.
  - **JS:** the story screen carries Tiptap, about 1.05 MB of raw JS. It is back-office only, under
    its own budget; no reader page loads it.
- **Built (M2, third part): the story's revisions, on its screen.**
  - **Compare any two:** the revisions are numbered from the first draft, with the current and the
    live one marked. Two picked show what changed in the headline, the dek and the SEO fields, and
    in the text paragraph by paragraph, then word by word; unchanged paragraphs fold into a count.
  - **Bring one back:** its text fills the editor, unsaved, and Save adds it as a new revision, so
    nothing is overwritten and a save's rules (the lock, a save meanwhile) still apply. Offered only
    to someone who may edit the story now; unsaved changes are replaced only after a yes. This is
    not the two-person restore, which puts a taken-down story back live.
- **Built (M3, first part): the reader's story page.**
  - **What it shows:** the published revision only: the section, headline, dek, bylines, the times
    of first publication and of the last update, the text and the correction note. It is labelled
    in the story's language, and its `<article>` carries that `lang`.
  - **Not live means 404:** an unknown story, a draft, a story taken down and one under embargo.
    The read applies the database's reader rules twice, in the query and on the row, and asks only
    for the columns readers are granted.
  - **Its own address:** another slug, section or language for the same story answers 308 there.
  - **Never cached:** the page renders on every request (`force-dynamic`, so `no-store` at
    CloudFront), so publishing and taking down show at once.
  - **The text** is drawn on the server by the story schema's own `renderHTML`. Only known tags
    and attributes reach the page, every link is checked again, and no editor code is sent to
    readers (each page's client JS is smaller than the article page's).
  - **On the Desk:** a published story's screen links to its page ("View on the site").
- **Built (M3, second part): the preview, in the back office** (design decision 7).
  - **Where:** "Preview" on the story screen opens `/admin/desk/[id]/preview` in a new tab, so the
    story screen and its lock stay as they are.
  - **What it shows:** the story's last saved revision, in the reader site's own view: one
    component (`StoryArticle`) and one stylesheet (`story.css`) in `packages/ui`, used by both
    apps. The bar says "Preview, not published" (or "Preview of the live version" when the saved
    revision is the published one), the state, and when the version was saved; unsaved changes on
    the story screen are not in it.
  - **Who:** whoever may open the story on the Desk. The preview reads it through the same route,
    `GET /api/admin/desk/stories/[id]` (`article.view_admin`, in the story's desk), and the server's
    refusal is shown. Nothing is published and no link leaves the back office, so there is no
    `PREVIEW_SECRET`.
  - **Hindi:** the back office now loads the reader site's Devanagari face (Noto Serif Devanagari,
    not preloaded), so Hindi looks the same on the Desk, in its editor and in the preview.
- **Built (M3, third part): scheduled publishing.**
  - **The job:** the worker's `publish-scheduled`, started every 5 minutes by a systemd timer in
    `deploy/` (owner decision 3), publishes every scheduled story whose time has come, oldest
    first, at most 50 a run. A story scheduled for 10:00 goes live at the 10:00 run or the next.
  - **By the Publish route's own rules:** Publish Guard and the embargo (`services/desk/publish.ts`,
    which the route now uses too). A story still under embargo waits for a later run.
  - **On behalf of the editor who scheduled it:** the history names them; the story records them as
    its publisher. The audit log's actor is `system:scheduler`, with them as `on_behalf_of`,
    attempted first and refused if it cannot be written.
  - **Only while they still may** (as built, beyond the design): their access is decided again at
    publication, as if they pressed Publish. If they were suspended, or their assignment expired,
    was revoked or no longer covers the story's desk, the story goes back to approved, with the
    reason in its history, for an editor who may to schedule or publish it.
  - **Never twice:** a story published or unscheduled by hand meanwhile is refused by the database
    and counted as moved. One story's failure does not hold up the others, and fails the run
    (exit 1) so the journal shows it.
  - **On the Desk:** the schedule field says the server publishes within 5 minutes after the time,
    if the editor may still publish then.
  - **Deploying it:** `deploy.sh` now installs and starts every timer in the kit, and stops one an
    older kit installed that the kit does not carry (OPERATIONS.md, Deployment).
- **Built (M3, fourth part): corrections.**
  - **What readers see:** a live story's correction note, under the story (the reader's page shows
    it). The note is up to 600 characters; a new note replaces the old one on the page, and the
    history and the audit log keep every note.
  - **Who:** `correction.publish`. A Desk Editor (S) or the Managing Editor (F) publishes it at once
    (`story.correct`, a `correct` move that keeps the story live). A Sub-editor (A) asks
    (`story.correct_request`), and a holder of S or F, not the one who asked, approves or declines
    it (`story.correct_approve`, `story.correct_decline`). Another A holder never decides, and
    Legal and the Grievance Officer (R) only read.
  - **In the database:** an approved request sets the note in the same transaction as the decision,
    only while the story is live (`desk_decide_pending`, migration desk-3: an owner step).
  - **On the Desk:** a live story's screen has a Correction section for whoever may publish or ask:
    the note readers see now, and "Publish correction" or "Ask for a correction". An open request
    says which kind it is.
  - **`/api/admin/me`** now reports the matrix's A as `"ask"` (beside `"act"` and `"read"`), so the
    screen offers asking only to those who may. The dashboard counts only `act` and `read` as reads.
- **Built (M3, fifth part): the takedown alert list** (design §8, owner decision 5).
  - **Where:** at the top of the Desk's list, for whoever may take stories down
    (`article.unpublish`): the Managing Editor and Legal in every desk, a Desk Editor in theirs.
  - **What:** every story unpublished or retracted in the last 30 days (at most 50, newest first):
    its headline (linking to the story), "Taken down" or "Retracted", the reason code and note, who
    took it down and when, its desk, and "Live again" once restored.
  - **How:** `GET /api/admin/desk/alerts` reads the history in three plain queries (the moves, their
    stories, the names of who made them) and keeps to the caller's desks in code. Email waits for
    an email service; the audit log has every takedown too.
- **Built (M4, first part): authors and a story's credits** (design §2 and §7).
  - **Authors:** records, not staff accounts: a name in English and in Hindi, a kind (staff,
    columnist, freelancer), a beat, a bio in each language and up to five https links. Anyone on the
    Desk sees the list (`/admin/desk/authors`, linked from the Desk); a holder of `author.manage`
    adds an author, edits one, retires one or brings one back. Never deleted: a retired author stays
    credited on what they wrote and cannot be credited again. Agency bylines wait for a wire
    licence (Phase K). Audited (`author.create`, `author.update`, with the record before and after).
  - **Credits:** a story's byline, additional reporting and translator, each an active author, in
    order, up to 20. Set on the story's screen by whoever may edit it (`article.edit`, in its desk),
    before publication only, so a live page's credits never change unseen; on an approved story
    they void the approval, as a details change does. One transaction with the story's history
    (`credits`): `desk_set_credits`, migration desk-4, an owner step. Audited (`story.credits`).
  - **What readers see:** the reader's page and the Desk's preview credit the active authors, by
    their name in the story's language ("By Asha Rao and Vikram Singh"; Hindi names on a Hindi story).
- **Built (M4, second part): the media library's first part** (design §2 and §7).
  - **Upload** (`/admin/desk/media`, linked from the Desk): an image of up to 15 MB for a desk
    (language and section), by whoever may edit stories there (`article.edit`; a Writer's Own covers
    their own uploads). Its type is read from its first bytes (JPEG, PNG, WebP, AVIF only), never from
    its name. It is kept under a new random key (`originals/<uuid>.<ext>`), with what is known: credit,
    source, licence and its end date, alt text and caption in English and in Hindi. Audited
    (`media.upload`).
  - **The record and its rights** (`media.manage`: the Managing Editor, a Desk Editor in the image's
    desk): edit the record; clear the rights, which needs a credit, a source and a licence and names
    who cleared them and when; changing the credit, source or licence voids a clearance; retire an
    image or bring it back. Never deleted. Audited (`media.update`, before and after).
  - **Storage, one interface:** S3 when `MEDIA_BUCKET` is set (the server: the Mumbai bucket, files
    under `media/`), else a local folder (`.media`, or `MEDIA_LOCAL_DIR`). Only the library's key
    shapes ever reach the bucket or a path. What is served to whom is in the third part, below.
  - **In the database:** `media_assets` and `asset_usages` (migration desk-5, an owner step): each
    image in one desk, the app's limits as CHECKs, no DELETE, usages append-only; readers see only
    an image a live story's published revision uses, never who uploaded or cleared it.
  - **Packages** (approved by the owner, 18 Nov 2026): `@aws-sdk/client-s3` 3.1161.0 and `sharp`
    0.35.5 (for the renditions), both pinned and more than two weeks old; `npm audit` is
    unchanged by them.
- **Built (M4, third part): the renditions, and the originals kept private** (design §7).
  - **The worker's `make-renditions` job,** every 5 minutes (`timesprime-renditions.timer`, two
    minutes after scheduled publishing): the images with no renditions yet, oldest first, 20 a run,
    no new one started after 180 s. For each, the original from the storage, turned upright by its
    EXIF, then three crops (16:9 at 480, 960 and 1440; 4:3 at 480 and 960; 1:1 at 240 and 480), each
    in AVIF and WebP, cut with sharp's attention strategy (faces and detail stay in the frame). Never
    wider than the picture: a small one gets one rendition per crop at its own width. Kept under
    `renditions/<id>/<ratio>-<width>.<format>` and listed on the image (`renditions`, `renditions_at`,
    and its upright `width` and `height`).
  - **No camera metadata reaches readers.** sharp writes none unless asked, so a rendition has no
    EXIF (which can hold where a photo was taken, and who took it). The original keeps it, so it is
    never served publicly: CloudFront serves `/media/renditions/*` alone, each app's `/media` route
    serves only renditions, and `mediaUrl` refuses an original's key. Staff see an original through
    `GET /api/admin/desk/media/[id]/original` (`article.view_admin` in its desk, cached privately).
  - **The library** shows each image's 4:3 WebP rendition once made (else the original, through the
    back office), whether its sizes for readers are made, on the way or failed, and a link to the
    original.
  - **A file sharp cannot read or convert, or a picture under 32 pixels once cropped,** is recorded
    with no renditions: not tried again, shown as failed (upload it again). A storage or database
    failure leaves the image waiting for the next run, which exits 1 so the journal shows it.
- **Built (M4, fourth part): images in stories** (design §5 and §7).
  - **In the editor:** Image, on the toolbar, opens the media library (the person's desks, retired
    images left out), each image saying what it still lacks for a story in this language; the one
    chosen goes in with its crop (16:9, 4:3 or square). The node keeps only the image's id and crop:
    alt text, caption and credit stay the library's, so a correction there reaches every story. The
    editor shows the picture through the back office.
  - **Saving** records the images the revision uses (`asset_usages`), in the same transaction
    (`desk_save_revision`, migration desk-7, an owner step); a retired image cannot be saved into a
    story, and an image node that names no library image is refused (400). A new story starts
    without images; they are added in the editor.
  - **The checklist** (approve, publish, publish-now) refuses a story while any image it uses is
    missing, retired or out of licence; lacks a credit, a source, a licence or cleared rights; or
    has no alt text or caption in the story's language. **At a scheduled story's time** the worker
    checks its images again and, if one is no longer ready, sends the story back to approved with
    the reason in its history, never live.
  - **Readers** get each image as a figure: the crop's AVIF and WebP renditions (480 to 1440 wide,
    with its width and height, loaded lazily), the alt text, and the caption with the credit, in
    the story's language. The page reads only the published revision's images, through its usages,
    active ones, with the readers' columns; an image without renditions is left out. Every address
    is checked again as it is drawn (https or a site path), and text is text.
  - **The preview** draws the last saved revision's images the same way, the original through the
    back office standing in until the renditions are made.
- **Built (M4, fifth part): authors' photos and galleries** (design §5 and §7).
  - **An author's photo** (the owner's choice, 18 Nov 2026: beside the byline). On the Authors page
    a holder of `author.manage` chooses it from the media library, which offers only images whose
    rights are cleared; the server refuses an image the library lacks, a retired one, or one not
    cleared (422), audited with the record. Readers see it round, beside the byline, from its
    square rendition (decorative: the name is beside it); the preview shows it the same way. The
    database lets readers read a photo only while it and its author are active (migration desk-8,
    an owner step: `authors.photo_id` and one more reader policy on `media_assets`).
  - **A gallery**, on the toolbar: two to twelve library images, chosen in order, one crop for all,
    added as one block with "Add the gallery", above the library and again below it, in a bar that
    stays in view. It goes where the cursor is in the text. Each is its own image node, so each is recorded with the revision, checked
    before publication and drawn like any image; readers see them two to a row.
- **Not yet:**
  - assigning a writer from the screen, which needs a staff directory (Panel 1; the API exists);
  - the Hindi typing checkpoint (OPERATIONS.md, "The Desk's Hindi typing check"), which needs the
    owner's two typists;
  - linking an author to a staff account (Panel 1's staff directory).

#### Access permissions and authorization rules

Each action's permission is in the [design's workflow table](#3-workflow), mirrored in
`MOVES` (`desk.ts`). The extra rules:
- **Four-eyes on approval:** neither the creator nor anyone who saved since the last approval.
- **Own for a Writer:** only stories they created, and never the desk's review steps: out of
  review, Submit (to the desk) and Send back need `article.submit` for the story's desk, so a
  Sub-editor or an editor takes them (the owner's decision, 18 Nov 2026; `deskOnly` in `MOVES`).
- **Two people for a restore:** the matrix's A.
- **Two people for a Sub-editor's correction:** the matrix's A; a holder of S or F decides.
- **Images belong to a desk:** uploading needs `article.edit` there (the uploader owns the upload, for
  a Writer's Own); an image's record, rights and retirement need `media.manage` in its desk; its original is
  shown to holders of `article.view_admin` in its desk, never to readers.
- **Authors belong to no desk:** `author.manage` is decided in any scope in which the caller holds
  it, which is the matrix's F for a Desk Editor. As a site-wide object an author would admit only
  unscoped grants, and a Desk Editor always has a language. Writing a story's credits rides on
  `article.edit`, in the story's desk. An author's photo must be a library image, not retired, its
  rights cleared.
- **Single actor for a takedown:** with a reason.
- **MFA:** every Desk write needs `aal2`.

The routes enforce them (M1b). A person without the permission gets 403 with Panel 0's message.
Four-eyes answers 403 `four_eyes`, the checklist 422 with its `problems`, a wrong state or an
embargo 409.

#### Database changes

| Migration file | What it does | Rollback | Applied by the owner |
|---|---|---|---|
| `database/migrations/2026-11-02-access-2-catalog.sql` (regenerated) | Adds `author.manage` and `media.manage` (41 permissions, 140 cells) | Re-apply the previous version | **Yes, 17 Nov 2026** (41 and 140 checked) |
| `database/migrations/2026-11-17-desk-1-stories.sql` | The ten Desk tables, the append-only triggers, the three `desk_*` functions, RLS and column grants for readers | In the file; only before the first real story | **Yes, 17 Nov 2026**, checks passed |
| `database/migrations/2026-11-17-desk-2-restore.sql` | One open request per story and action; `desk_decide_pending`, which decides a restore and puts the story back live in one transaction | In the file | **Yes, 17 Nov 2026**, checks passed |
| `database/migrations/2026-11-17-desk-3-corrections.sql` | `desk_decide_pending` decides a correction request too: approved, the live story's note is the request's, with its history row, in one transaction | Run desk-2 again | **Yes, 17 Nov 2026**, checks passed (`decides_corrections` true, `anon_may_call` false) |
| `database/migrations/2026-11-18-desk-4-credits.sql` | `desk_set_credits`: a story's credits replaced, in order, each naming an active author, before publication only; an approved story back to desk review; its history row; one transaction | Drop the function (in the file) | **Yes, 18 Nov 2026**, checks passed (`service_may_call` true, `anon_may_call` false) |
| `database/migrations/2026-11-18-desk-5-media.sql` | `media_assets` and `asset_usages`: an image's desk, record and rights; usages per revision; RLS, no DELETE, readers only for live stories' images | Drop both tables (in the file), before the first real image | **Yes, 18 Nov 2026**: `tables_with_rls` 2 and `anon_sees_uploader` false, but `service_may_delete` **true**: its REVOKE left out `service_role`, so Supabase's default privileges kept the app's DELETE (desk-6 fixes it) |
| `database/migrations/2026-11-18-desk-6-media-grants.sql` | The fix to desk-5: every right on the media tables taken from `service_role`, then exactly desk-5's grants (no DELETE; usages insert-only) | None needed; desk-5's state was `GRANT ALL ... TO service_role` | **Yes, 18 Nov 2026**, checks passed (`false`, `false`, `true`) |
| `database/migrations/2026-11-18-desk-7-image-usages.sql` | `desk_save_revision` records the library images a revision uses (`asset_usages`) in the save's transaction, and refuses a retired one; the rest of the function unchanged | Run desk-1's function again (images then saved but not recorded, so readers would not see them) | **Yes, 18 Nov 2026**, checks passed (`true`, `true`, `false`) |
| `database/migrations/2026-11-18-desk-8-author-photos.sql` | `authors.photo_id`, a library image; readers may read the column, and an image while it is an active author's photo and itself active | In the file, before any author has a photo | **Yes, 18 Nov 2026**, checks passed (`1`, `true`, `1`) |

#### Tests and verification

| Test file | What it proves | Denied case covered |
|---|---|---|
| `packages/shared/src/config/desk.test.ts` | Every move's start states, destination and permission; the checklist; the embargo | Publish from any state but approved, scheduled or live; nothing moves a killed, retracted or unpublished story |
| `packages/server/src/services/desk/fourEyes.test.ts` | A third person may approve | The creator and every editor since the last approval may not; a breaking story's publisher may not review it |
| `packages/server/src/auth/decide.test.ts` | Own allows the caller's own story in scope | Another's story, an ownerless one, one out of scope |
| `packages/server/src/repositories/stories.test.ts` | Writes go through the `desk_*` functions; lists stay in scope | A malformed scope matches nothing; a moved story answers 409 |
| `apps/admin/src/components/desk/desk.test.tsx` | The list shows the desk's stories (Hindi marked `lang`), New story creates and opens; the story screen shows the checklist and the moves the person holds, opens with no unsaved changes, and keeps unsaved text when the details are saved; two revisions compared field by field and word by word; a revision brought back fills the editor, and only Save sends it, as a new revision; a live story links to its page; the preview opens in a new tab and shows the last saved version in the reader's view, in Hindi for a Hindi story, and says when it is the live version; the schedule field says when the server publishes; a Desk Editor publishes a correction and sees the note readers see; a Sub-editor asks for one; an open correction request names itself, and approving it publishes the note | An empty desk; a refusal shown; the shared password; no session; no `article.edit` (read-only, and no Bring back); a story not found; unsaved changes kept when bringing one back is declined; no link before publication; the preview showing the server's refusal, and a story with no text; no Correction section without `correction.publish` |
| `e2e/admin-access.spec.ts` | Signed out, `/admin/desk`, a story's screen, its preview, the authors and the media library go to sign-in; the Desk API calls answer 401, an image's original among them | (all refused) |
| `packages/server/src/repositories/stories.test.ts` (`getPublishedStory`) | One published story past its embargo, with the reader's columns only; the published revision; active bylines in order, in the story's language | No such story; another story's row; a draft; a story taken down; one under embargo; a revision that is not the published one, or another story's; a number that cannot be a story; a database error (thrown, not a 404) |
| `packages/editor/src/render.test.tsx` | Every block of the design, drawn by the schema; a site link followed, an https one nofollow; Hindi text as it is; every node and mark of the schema draws only allowed tags | `javascript:`, `data:` and plain-http links; an embed from another site; unknown nodes, marks and attributes; markup in the text (escaped); anything but a document; nesting past the limit; no h1 |
| `packages/shared/src/lib/storyUrl.test.ts` (Desk) | The English and Hindi addresses, and the number read back from them | A segment with no number, a zero, a leading zero, too many digits |
| `apps/web/src/app/_story/storyPage.test.tsx` | Both routes render on every request; a story at its address, in its language, with its metadata (SEO title, canonical, `og:locale`) | Another slug, section or language: 308 to its own address; not a section, no number, or not shown by the store: 404 without a read where none is needed; a store failure is an error, not a 404 |
| `packages/ui/src/StoryArticle.test.tsx` | Section, headline, dek, times, bylines and credits, the correction note; a Hindi story labelled in Hindi; in the preview, the section named, not linked | No byline and no update shown when there is none |
| `e2e/reader.spec.ts` (Desk stories) | From the stand-in: an English story at its address, `no-store`, `lang="en"` and its canonical; a Hindi one under `/hi/` | Another address: 308; an unknown story: 404 in both languages (this one also against the real database, locally) |
| `packages/server/src/services/desk/publish.test.ts` | An approved revision past its embargo goes live; what publishing sets, keeping the first publication's time | Before the embargo; no approved revision, or one already live |
| `packages/server/src/services/desk/scheduler.test.ts` | A due story goes live on behalf of the editor who last scheduled it, audited as `system:scheduler`, attempt first; a story under embargo waits; one failure does not hold up the others | The attempt cannot be written (nothing published); the scheduler revoked, expired, suspended, no longer staff or out of the desk (back to approved, never live); moved meanwhile (counted, not failed); no scheduler on record; the due list cannot be read |
| `packages/server/src/repositories/stories.test.ts` (`listDueScheduled`) | Scheduled stories whose time has come, oldest first, a batch at a time | A database error is thrown |
| `apps/worker/src/jobs.test.ts` (`publish-scheduled`) | A clean run exits 0 and logs what it did; it never runs the news refresh | A failed story exits 1 and is named; an unreadable list fails the job |
| `scripts/deploy.test.ts` (scheduled publishing) | The timer fires every `PUBLISH_TICK_MINUTES` (5) and runs `publish-scheduled`; a run times out before the next tick; `deploy.sh` installs and starts every timer in the kit | A timer the kit does not carry is stopped |
| `apps/admin/src/app/api/admin/access.test.ts` (details) | A Writer sets their story's slug | A malformed slug; a live story; a Writer clearing the legal flag (needs `article.approve`); approval voided by a change |
| `apps/admin/src/app/api/admin/access.test.ts` (restore) | A Desk Editor (A) asks, with a reason; a different one approves or declines | The requester deciding their own request; a story that is not down; no reason; a decided request; a Writer; an A holder without MFA |
| `apps/admin/src/app/api/admin/access.test.ts` (corrections) | A Desk Editor (S) publishes the note at once, through a move that keeps the story live; a Sub-editor (A) asks, the note in the request; a Desk Editor approves the request (the database sets the note); Legal still decides a restore | A story that is not live; an empty or over-long note; a Writer and Legal (R) cannot publish or ask; another Sub-editor (A) and Legal (R) cannot decide a correction; the requester cannot decide their own |
| `packages/server/src/repositories/deskSchema.test.ts` | Migration desk-3: one transaction; `desk_decide_pending` decides restores and corrections only; an approved correction sets the note from the request, only on a live story, with its history row; the restore branch unchanged; caller's rights, empty search path | Only `service_role` may call it; a decided request and the requester still refused |
| `packages/server/src/repositories/stories.test.ts` (`requestCorrection`) | A correction request with the note as its payload and reason | A second open request answers 409 |
| `apps/admin/src/app/api/admin/me/route.test.ts` | The matrix's A reported as `"ask"` | Nothing held in an aal1 session, A included |
| `apps/admin/src/app/api/admin/access.test.ts` (alerts) | A Desk Editor sees their desk's takedowns, with who took each down; Legal sees every desk's | A Sub-editor and a Writer (no `article.unpublish`) are refused before any read |
| `packages/server/src/repositories/stories.test.ts` (`listTakedowns`) | Unpublish and retract of the last 30 days, newest first; only the caller's desks; the headline, the state now and the name of who took it down | No scope reads nothing; no takedown reads no further; a name not known falls back to the history label; a database error is thrown |
| `apps/admin/src/components/desk/desk.test.tsx` (alerts) | Each takedown: its kind, its story (linked, in its language), why, who, and "Live again" once restored; an empty list says so | Without `article.unpublish` there is no alert list, and it is never asked for |
| `apps/admin/src/app/api/admin/access.test.ts` (authors and credits) | A Desk Editor of any language manages authors (F, no desk); retiring keeps the record, audited with before and after; a story's credits go through `desk_set_credits` from the state the story was read in | A Sub-editor and a Writer cannot create or change an author; a missing English name, an agency, a link that is not https, an empty edit; an unknown author (404); credits on a live story (409), malformed, repeated or more than 20; a Writer crediting another's story |
| `packages/server/src/repositories/authors.test.ts`, `stories.test.ts` (credits) | The list by English name, retired only on request; create and update as given; credits listed in order with names, set through `desk_set_credits` | Nothing deleted; a database error thrown; a story moved meanwhile (409); a retired author (422) |
| `packages/server/src/repositories/deskSchema.test.ts` (desk-4) | One transaction; before publication only, from the state read; an approved story back to desk review; credits replaced in order, each an active author, at most 20; the history row | Only `service_role` may call it |
| `apps/admin/src/components/desk/desk.test.tsx` (authors and credits) | The Authors page lists every author (Hindi names marked) and a manager adds and retires one; credits added in the story's language and saved as one list; the preview credits active authors | Without `author.manage` the list is read-only; a live story's credits shown, not changed; a retired author not credited in the preview |
| `apps/admin/src/app/api/admin/access.test.ts` (media library) | An upload kept under a new random key, with who, the desk and what is known, audited; rights cleared once credit, source and licence are set, naming who; retiring keeps the image; the tile shows the 4:3 WebP rendition once made, else the original through the back office; the original's bytes and type for staff in its desk, cached privately | A GIF named .jpg, no file, no desk, an unknown source, over 15 MB (nothing kept); clearing rights without credit, source and licence (422); a changed credit, source or licence voids a clearance; a Writer changing an image; an unknown image or a missing file (404); the original out of the desk (403) |
| `packages/server/src/lib/mediaStorage.test.ts` | A file written is read back under its key's path; S3 under `media/`, cached for a year, Mumbai by default; each app serves renditions at `/media` | Anything but a library key, before a path is built; an original at `/media`, and an original's address (refused); a file not in the bucket is null; the app serves nothing at `/media` on S3 |
| `packages/server/src/services/desk/renditions.test.ts` | With the real sharp: every crop at its widths in AVIF and WebP, each exactly its size, with no EXIF; a turned picture made upright; a run makes and records each waiting image's renditions | A small picture never enlarged; an unreadable file, a tiny picture or a missing original recorded with none, once; a storage failure leaves the image waiting, nothing recorded; a run's batch and time budget |
| `packages/shared/src/config/media.test.ts` | Types read from the first bytes; the library's key shapes; each crop's widths; the tile's rendition; where renditions stand | A GIF, an SVG, a PDF, a WAV; a path, an SVG key, an upper-case key, an unknown ratio; a picture too small for any rendition |
| `packages/server/src/repositories/media.test.ts` | The list in scope, newest first, active only unless asked; create as given; an update with a time; the worker's list, oldest first; renditions recorded once, with the upright size | No scope reads nothing; nothing deleted; a second record of renditions (false); a database error thrown |
| `packages/server/src/repositories/deskSchema.test.ts` (desk-5, desk-6) | One transaction; RLS on both tables; the app's limits as CHECKs; readers only for a live story's published revision; desk-6 takes every right from `service_role` before granting desk-5's | No DELETE for anyone, usages never changed; readers never see the uploader, the clearer or the licence; desk-6 grants no DELETE and leaves readers' rights alone |
| `packages/server/src/repositories/schema.test.ts` (new tables) | Every table a migration creates has Supabase's default rights taken from `anon`, `authenticated` and `service_role`, in its file or a later one | A table one role keeps its default rights on (desk-5's media tables, without desk-6) |
| `apps/worker/src/jobs.test.ts` (`make-renditions`), `scripts/deploy.test.ts` (renditions timer) | A clean run exits 0, as does one with an unusable file (logged); the timer fires every `RENDITIONS_TICK_MINUTES` (5), at two past, and its run times out before the next tick | An image left waiting, or an unreadable list, exits 1 |
| `apps/admin/src/components/desk/desk.test.tsx` (media library) | Each image with its desk, credit, rights, sizes for readers and a link to the original; an upload sent as a form; a manager clears rights and retires | Without `article.edit` no upload, without `media.manage` no changes; sizes on the way, or failed with what to do |
| `packages/editor/src/renderImages.test.tsx` | An image as a figure: its crop's AVIF and WebP renditions, sized and lazy, its alt text, caption and credit; the preview's stand-in; the node keeps a valid id and crop; the plain text shows it | An image the page was not given, or a crop without renditions (left out); `javascript:`, `data:`, plain-http and `//` addresses, a srcset with anything else in it; markup in an alt or caption (escaped) |
| `packages/shared/src/config/storyImages.test.ts` | The images a body uses, in order, once, at any depth; the checklist's image rules in the story's language | A node with no library id; a malformed crop; an image missing, retired, out of licence, without credit, source, licence, cleared rights, alt text or caption |
| `packages/server/src/services/desk/storyImages.test.ts`, `repositories/media.test.ts` (images) | What a page draws of an image, in English and in Hindi; readers get a published revision's images through its usages, active, with renditions; the preview falls back to the original | A rendition key not the library's; a crop in one format only; an image another revision uses; a retired one |
| `packages/server/src/services/desk/scheduler.test.ts` (images) | A scheduled story whose images are ready goes live | An image retired, out of licence, its clearance withdrawn, without the story's caption, or gone: back to approved, never live |
| `packages/server/src/repositories/deskSchema.test.ts` (desk-7) | One transaction; the same signature, caller's rights, empty search path; every image at any depth, once, recorded with the revision before the story moves | A retired image refused; everything else in the save unchanged (compared with desk-1's text); only `service_role` may call it |
| `apps/admin/src/app/api/admin/access.test.ts` (images) | A story with ready images passes the checklist; the story screen gets the revision's images for its preview | Approval refused for an image lacking rights or the story's alt text, one the library lacks, or a retired one; a new story with an image, a save naming no library image (400) |
| `apps/admin/src/components/desk/desk.test.tsx` (images) | Image opens the library, says what each image lacks, and adds the chosen one with its crop, which Save sends; the preview draws the revision's images | (the server's refusals are the access tests') |
| `apps/admin/src/app/api/admin/access.test.ts` (authors' photos) | A photo with cleared rights set, and removed with null, audited | A photo the library lacks, a retired one, one not cleared (422); a malformed id (400); nothing written |
| `packages/server/src/services/desk/storyImages.test.ts`, `repositories/media.test.ts` (photos) | Each credited author's photo once, with its square rendition; the preview's stand-in; readers' photos only through an active author, active images, the readers' columns | A photo without a square rendition; a malformed id; another image |
| `packages/server/src/repositories/deskSchema.test.ts` (desk-8) | One transaction; the column, the readers' grant, the policy for an active author's active photo | Nothing else about the library's rights changes |
| `packages/ui/src/StoryArticle.test.tsx` (photos) | The photo, round, before the byline, from its square rendition, decorative | A photo the page was not given; an address that is not https or a site path |
| `packages/editor/src/renderImages.test.tsx` (galleries), `desk.test.tsx` (galleries, photos) | A gallery's images together; the schema holds two to twelve images; Gallery adds the chosen images in order with their crop, which Save sends, from the button below the images as from the one above; the Authors page chooses a photo and saves it | A gallery of one, of thirteen, or with anything but images; an image whose rights are not cleared cannot be a photo |
| `packages/shared/src/config/desk.test.ts`, `access.test.ts`, `desk.test.tsx` (the desk's review steps) | Out of review, Submit and Send back are the only `deskOnly` steps; a Sub-editor passes a story on; a Writer still submits their draft and may kill their own story | A Writer passing their own story on from review, or sending it back (403, `article.submit`), and not offered either on screen |
| `apps/admin/src/app/api/admin/access.test.ts` | Every Desk route for its least-privileged holder in scope, with its audit pair | No session, no grants, expired, wrong scope, no MFA and the shared password; four-eyes, the checklist, Publish Guard, the embargo, takedown reasons, Own, send-back's second permission, the lock and take-over, the list's scope |

The database's own rules (immutable revisions, append-only history, RLS) are checked by the owner
with the queries at the end of the migration (definition of done, item 7).

#### Definition of done (checked 18 Nov 2026, for the owner's sign-off)

Every PR of the panel (#17 to #34) is merged; desk-1 to desk-8 are applied and checked. Item by
item, against the code:

| # | Item | Status |
|---|---|---|
| 1 | Every feature works; this entry matches the code | **Met in code and tests, and the core flow walked by the owner** (18 Nov 2026, on a laptop against the real database, a Writer and a Desk Editor): an image uploaded by the Writer; a story written, the image added, its slug set and submitted; passed to the desk; approval refused by the checklist while the image's rights were not cleared, then cleared and approved by the other person; published; the reader's page with the image's rendition; a correction; taken down, with the alert; every step in the audit log. **Then authors' photos and a gallery, walked the same day:** two images uploaded, their rights cleared, their renditions made by the worker; an author added with a photo; the Writer's story with that author as its byline and a gallery of the two images; passed to the desk, approved and published by the Desk Editor; the reader's page with the round photo beside the byline and the gallery, drawn from renditions (AVIF and WebP; the original's address nowhere on the page); then taken down, the author and the images retired. **Not walked yet:** scheduling, the two-person restore |
| 2 | Server-side permission on every route and action; allowed and denied tests | **Done.** Every Desk route has a rule; `access.test.ts` walks every route on disk and tests each for its least-privileged holder in scope, no session, no grants, expired, no MFA, the wrong desk and the shared password |
| 3 | Privileged actions audited; MFA where the plan says | **Done in code.** Every Desk write writes `audit_log` first (attempted, then outcome) and is refused with 503 if it cannot; every Desk write needs `aal2`; the worker audits as `system:scheduler`. The audit log's own database rules are Panel 0's, verified with its runbook |
| 4 | `npm run verify` and CI green; routes, JS and CSS reported | **Done.** Every PR green, with its routes, JS budget and CSS bytes in its report |
| 5 | SQL in migrations with a rollback, listed as owner actions | **Done.** desk-1 to desk-8, each with its rollback (desk-6 needs none), each applied by the owner and its check passed (17 and 18 Nov 2026) |
| 6 | This file, the current status and ARCHITECTURE.md updated | **Done,** in each PR |
| 7 | Real-database tests read-only; the database's own rules verified by the owner | **Partly.** Every migration's check passed on the real database (the owner, 17 and 18 Nov 2026), and the reader's browser test reads a real Desk story locally. desk-1's `BEGIN … ROLLBACK` smoke test, which exercises the triggers, needs a test project and has not run |
| 8 | Browser tests cover the critical flows, including a refused-access flow | **Partly.** Signed out, every Desk screen goes to sign-in and the Desk API answers 401; the reader's story pages are tested against the stand-in. The signed-in Desk flow is not: browser tests may not write to the real database, so it needs a test Supabase project (Phase I's staging) |
| 9 | Every screen has loading, error and empty states | **Done.** The list, the story, the preview, the authors, the media library and the image picker, tested in `desk.test.tsx` |
| 10 | Accessibility checked (keyboard, labels) | **Partly.** Every control has a label or an accessible name (the screen tests find each by it); the toolbar is a labelled `toolbar` with `aria-pressed`; the controls are native buttons, inputs and selects. **Left:** an axe pass and a keyboard walk-through of the signed-in screens, which need a sign-in (the same test project) |
| 11 | Failures reach Sentry; privileged actions audited | **Partly.** The back office's Desk routes report failures to Sentry and are audited. The worker's jobs (scheduled publishing, renditions) report to the journal and the worker's log group only: the worker does not start Sentry |
| 12 | A JS budget per route in CI | **Done.** Each Desk page has its budget in `scripts/js-budget.json` |
| 13 | A runbook for when the main flow breaks | **Done:** OPERATIONS.md, "The Desk is failing" |

**So Panel 2 is not yet Done.** Open: the Hindi typing check (M2; the owner's two typists); the
rest of the owner's walk-through (item 1); a test Supabase project for items 7, 8 and 10;
the worker reporting to Sentry (item 11; a small change, with the manager's choice of Sentry
project). Assigning a writer from the screen waits for Panel 1's staff directory.

#### Known limits and not yet built

- **Next:** the open items above, for the owner's sign-off.
- **Found in the owner's walk-through (18 Nov 2026):**
  - *decided and fixed:* a Writer's Submit and Send back on their own story in review (the desk's
    review steps are now `deskOnly`; see the access rules);
  - *decided and fixed:* on Windows, a worker job printed its result and then Node crashed as it
    exited; the worker now sets its exit code instead (OPERATIONS.md, gotcha 3.38);
  - *decided and fixed:* in the gallery picker, the images were chosen but the gallery was never
    added: "Add the gallery" sat above the library, out of sight once the images were scrolled to.
    It is now also below the images, in a bar that stays in view (the owner's decision);
  - "View on the site" opens the site's own address (`NEXT_PUBLIC_APP_URL`), which answers once
    the site is deployed; on a laptop the page is at `http://localhost:3000/<section>/<slug>-<number>`;
  - setting up the second factor: each reload of the sign-in page makes a new QR code, so a code
    from an earlier scan is never right; five codes within 15 minutes lock the step until they pass.
- **On a live story,** an image retired later disappears from the page at once; a licence that ends
  later is not checked again (the checklist checks it before publishing, and at a scheduled time).
- **The editor shows each image's original file** (through the back office), which can be large.
- **A failed image is not tried again:** upload the file again (a new image). There is no retry
  button; a storage failure, unlike a bad file, is retried by the next run.
- **On the server, images need the manager's AWS work first** (design §9, item 6; OPERATIONS.md):
  the bucket, the role's access, CloudFront's `/media/renditions/*` ("The Desk's images"). Until then
  `MEDIA_BUCKET` and `MEDIA_PUBLIC_BASE` stay unset, and an upload on the server fails (the container
  has no folder it may write): audited as failed, nothing kept.
- **A rendition is public at its address once made,** before any story uses it (CloudFront serves
  `/media/renditions/*`). The address holds a random UUID, so it is found only through the library or
  a published story; it carries no camera metadata, and the database hides the record from readers.
- **Deciding a correction passes the decide route's own gate first,** `article.restore` (A or
  better): every holder of `correction.publish` at S or F holds it today (Desk Editor, Managing
  Editor). A future role with the one but not the other would need the rule changed.
- **Scheduled stories go live only once the server runs the timer:** the deploy installs it. On a
  laptop nothing publishes them; the job is never run from a session (it writes to the database).
- **The reader's story page is reached by its address only:** stories join the home and section
  pages in Panel 3, and the news sitemaps and NewsArticle markup in Phase F (design §12).
- **Bylines** show once authors exist (M4); until then a story shows none.
- **The design's "restore to a revision"** is built as bringing one back into the editor: Save
  then copies it into a new revision, through the save route and its checks, so it needs no route
  of its own.
- **As built, for the restore:**
  - the deciding route is `pending/[actionId]/decide`, not `…/approve`, because it also declines;
  - a route rule can be `twoPerson`, which lets a holder of A pass the gate to ask or to decide;
  - `decide()` now answers `mfa_required` before `needs_approval`, so an A holder without a second
    factor can never ask.
- **M2 to M4:** as the design says.
- **As built, beyond the design's table:**
  - an `unschedule` move (`scheduled` → `approved`, `article.publish`);
  - a scheduled story cannot be saved; it is unscheduled first.

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

## Panel 1 design: Administration

**Status:** **approved** by the owner on 19 Nov 2026, with the recommended answer to every question
in §11 (recorded below). Proposed on 18 Nov 2026 (PR #42). One branch per milestone, starting with
`panel-1-people-roles` (M1). **Started at the owner's request** (18 Nov 2026), while Panel 2's last
items are still open: the Hindi typing check, a test project, the worker's Sentry, and two
walk-through steps. `NEWSROOM_PLAN.md` is unchanged, as it was for Panel 2.

### Approval: decisions (19 Nov 2026)

This section overrides anything later in this design that disagrees with it.
1. **Two Super Admins for every Super Admin change** (the matrix's A, as written). A Managing Editor
   acts alone, up to Desk Editor in their scope. *Then (19 Nov 2026):* the owner named Vivek as the
   second Super Admin (owner action 1).
2. **The four access-rule notes of §3:** A counts as read; removing access is single-actor; nobody
   acts on their own access; break-glass is self-activated. They are written into the access rules
   ("Four-eyes, takedown and MFA rules") in M1.
3. **A one-time set-password link,** shown to the admin and handed over; email later. The link works
   for **24 hours** (Supabase's email-link expiry, set by the owner before M2). *Then (19 Nov
   2026):* Supabase warned that more than an hour is above its recommendation, and the owner set
   **1 hour** (3600 seconds) instead: a link is made when the person is ready to open it, and a new
   one is made if it lapses.
4. **Break-glass as in §5:** a Super Admin alone, at most 2 hours, takedown only, the other Super
   Admins alerted on screen; email later.
5. **Expiry and review:** 180 days by default (30, 90, 180 or 365), 365 for Super Admin, at most 365;
   a review every 90 days.
6. **The shared password goes in M4,** once two Super Admins have signed in with their second
   factor, without waiting for the AWS deployment. *Then (19 Nov 2026):* the owner left it to the
   developers' judgement, so it goes in M4 as recommended: staff sign in with their own accounts on
   the same database wherever the app runs, so the release does not depend on the shared password.
   Vivek reviews and merges the M4 pull request.
7. **Milestones M1 → M2 → M3 → M4,** each shown to the owner before the next.

**Plan:** Phase D of [`NEWSROOM_PLAN.md`](NEWSROOM_PLAN.md). Also the [access rules](#access-rules):
the `user.manage / role.assign` row, "Four-eyes, takedown and MFA rules", and "Retention". Also the
Panel 1 items that Panel 0 left in its "Known limits". **Done when** (the plan): the definition of
done holds, and the shared password no longer works anywhere.

In Panel 1, people and their access are managed in the app instead of by SQL:
- who is staff;
- which roles they hold, in which desk, and until when;
- their second factor;
- emergency access;
- the quarterly access review.

When Panel 1 is done, the shared admin password is deleted.

### 0. What the docs and the code say, and what it changes

- **The matrix.** Only two roles hold `user.manage / role.assign`:
  - **Super Admin: A.** Every change a Super Admin makes needs a second Super Admin's approval.
  - **Managing Editor: S (assign ≤ Desk Editor in own scope).** A Managing Editor acts alone, but
    only for Writer, Sub-editor and Desk Editor, and only inside their own scope.
- **What the database already enforces** (`role_assignments_guard` in access-1):
  - Rows are history: an assignment is revoked, never deleted or edited.
  - A privileged role is inserted only with `granted_by` and `approved_by` set to two different
    active Super Admins. The privileged roles are Super Admin, Managing Editor, Legal/Compliance
    and Privacy Officer.
  - Writer, Sub-editor and Desk Editor need a language.
  - A break-glass row lasts at most 2 hours.

  It does not check that the granter is allowed to grant. The app checks that, as it does for
  every other permission.
- **Three gaps in the database for Panel 1,** all closed by migration admin-1 (§2):
  - The "one active row" index counts an expired row as active (`WHERE revoked_at IS NULL`). A
    renewal or a re-grant must therefore revoke the old row first, in the same transaction.
  - The same index does not include `is_break_glass`. A Super Admin's break-glass row (same role,
    same NULL scope) therefore cannot exist beside their normal one.
  - The trigger requires two Super Admins for every privileged row, so a Super Admin cannot start
    break-glass for themselves (§5).
- **`decide()` today** (`packages/server/src/auth/decide.ts`):
  - For A, it allows no read, and it answers `needs_approval` to an act.
  - The Desk's two-person routes (`twoPerson` in `adminRoutePolicy.ts`) already turn that answer
    into a request that someone else decides (Panel 2's restore). Panel 1 reuses that pattern.
  - Because A allows no read, a Super Admin could not even list the staff they manage. §3 proposes
    that A counts as read.
- **Supabase Auth's admin API.** The installed `@supabase/auth-js` 2.116.0 has what Panel 1 needs,
  all on the server with the service-role key:
  - `createUser`;
  - `generateLink`, which returns a `hashed_token`; `verifyOtp({ token_hash, type })` exchanges it
    for a session;
  - `mfa.listFactors` and `mfa.deleteFactor`.

  Its `signOut` needs the person's own token, so it cannot sign out someone else. Panel 1 ends a
  person's sessions with a database function instead (§2). An ended session is refused at the next
  request: `staffSession.ts` calls `getUser()` on every request, and Supabase refuses a session that
  no longer exists.
- **No email service exists.** Supabase's built-in mailer is meant for testing and is heavily
  rate-limited. Panel 1 therefore gives the admin a one-time link to pass on (§4). Email waits for
  an email service, as the Desk's notifications do (Panel 2, decision 5).
- **The account record is Panel 0's `staff_profiles`:** `display_name`, `status` (active or
  suspended), `mfa_required` and `last_sign_in_at`.
  - The app may already update it: `service_role` has UPDATE.
  - An `auth.users` row is never deleted. `staff_profiles` references it `ON DELETE RESTRICT`, so
    the audit trail always names someone. A person who leaves is suspended, and their roles are
    revoked.
- **The shared password** (`legacy:shared-password`) cannot manage people: it never holds
  `user.manage` or `role.assign` (Panel 0, Q3). Every Panel 1 route is `staffOnly`.

### 1. Milestones

| Milestone | What it delivers | Rough size |
|---|---|---|
| **M1. People and roles** | Migration admin-1; the staff directory and each person's page; grant, renew and revoke, with scope and expiry; requests and approvals (A); suspend, reactivate, sign out everywhere | 1 to 1.5 weeks |
| **M2. Accounts** | Adding a person, with a one-time "set your password" link and the welcome page; a new link for a forgotten password; resetting a lost second factor (two Super Admins) | 1 week |
| **M3. Emergency access and the review** | Break-glass with its alert; the quarterly access review (migration admin-2); roles ending soon | 3 to 4 days |
| **M4. The shared password goes** | One deletion commit; the owner removes its variables; Panel 1's definition of done | 1 to 2 days |

Each milestone is its own pull request, green on `npm run verify`, and is shown to the owner before
the next one starts. The total is 2.5 to 3.5 weeks; the plan estimates 2 to 3.

### 2. Data model

**Migration admin-1** (M1), applied by the owner with its check queries and its rollback:

| Change | What | Why |
|---|---|---|
| `role_assignments_one_active` | Recreated over `(user_id, role_key, language, section, is_break_glass)` | A break-glass row can then sit beside the normal one |
| `role_assignments_guard` | One more exception to the two-admin rule: a `super_admin` break-glass row whose `granted_by` is the person themself, already an active Super Admin, with a reason | Break-glass is self-activated (§5). The 2-hour CHECK stays |
| `access_requests` (new) | `id`, `kind`, `user_id` (NULL until an added person's account exists), `details` (jsonb: role, scope, expiry, email, name), `reason`, `requested_by`, `requested_at`, `lapses_at` (72 hours later), `decided_by`, `decided_at`, `outcome` (`approved`, `declined`, `cancelled`; *as built:* a lapsed request is an open one past `lapses_at`, not a stored outcome), `note` | The matrix's A for Super Admins. A trigger lets a row be decided once and never edited after. A CHECK requires `decided_by` to differ from `requested_by` and from `user_id` |
| `access_grant(...)` (function) | Inserts an assignment. In the same transaction, it revokes the row it replaces (a renewal), or an expired row for the same role and scope | A renewal never leaves a moment with no row, or with two rows |
| `access_decide(...)` (function) | Marks a request decided. For a grant, renewal, reactivation or rename, it makes the change in the same transaction, with `granted_by` set to the requester and `approved_by` to the decider | The approval and the change cannot come apart |
| `staff_end_sessions(user)` (function) | Deletes the person's rows in Supabase's `auth.sessions`, and their refresh tokens with them. `SECURITY DEFINER`, executable by `service_role` only | Sign out everywhere, because Supabase's own sign-out needs the person's token |

- **Kinds of request:** `add_person`, `grant`, `renew`, `reactivate`, `rename`, `password_link` and
  `mfa_reset`.
- **Requests that change the Supabase account** (adding a person, a password link, a factor reset):
  the app makes that change first, and decides the request after it. Each of those steps is safe to
  repeat, so a failure between them is fixed by trying again.
- **Grants, as desk-6 taught:** `REVOKE ALL … FROM anon, authenticated, service_role`, then only what
  the app needs (`schema.test.ts` enforces it). No role may UPDATE or DELETE a decided request.

**Migration admin-2** (M3) adds `access_reviews`: `id`, `completed_by`, `completed_at`, `note`, and
`snapshot` (jsonb: every assignment reviewed, and what was decided for it). It is append-only (a
trigger), like `audit_log`.

No table or column changes meaning. `staff_profiles.status` keeps its two values. An added person
who has not set their password yet is shown as "not signed in yet" (`last_sign_in_at` is NULL).

### 3. Who may do what

The one principle: **adding access needs two people; removing access needs one.**

| Action | Super Admin (A) | Managing Editor (S) | Permission |
|---|---|---|---|
| See the directory and a person | Everyone | People who hold a role in their scope | `user.manage`, read |
| Add a person (the account and a first role) | A request; a second Super Admin approves | Alone: Writer, Sub-editor or Desk Editor in their scope | `user.manage` and `role.assign` |
| Grant or renew a role | A request; a second Super Admin approves (for a privileged role, the database requires it too) | Alone, up to Desk Editor in their scope | `role.assign` |
| Rename, reactivate | A request | Alone, for their people | `user.manage` |
| Revoke a role | Alone | Alone, for roles they could grant | `role.assign` |
| Suspend, sign out everywhere | Alone | Alone, for their people | `user.manage` |
| A new password link | A request | Alone, for their people | `user.manage` |
| Reset a lost second factor | A request; a second Super Admin approves | Not allowed: they ask a Super Admin | `user.manage` |
| Emergency access (break-glass) | Alone, for themselves, at most 2 hours (§5) | Not allowed | `role.assign` |
| Complete the access review | Alone; the renewals in it are requests | Not allowed | `role.assign` |

The rules around it:
- **Nobody acts on their own access.** Nobody grants themselves a role or renews their own, and
  nobody approves a request they made or a request about themselves. The app enforces this, and so
  does the CHECK on `access_requests`. Break-glass is the one exception, by design (§5).
- **A Managing Editor's people** are those whose every live role is Writer, Sub-editor or Desk
  Editor, inside the Managing Editor's scope. So a Managing Editor cannot suspend a Super Admin or a
  fellow Managing Editor.
- **The last active Super Admin** cannot be revoked or suspended in the app. The owner's SQL editor
  remains the way back in.
- **Expiry:** every grant has one (the database requires it). The form offers 30, 90, 180 or 365
  days, with 180 as the default; Super Admin gets 365. The most is 365 days.
- **MFA:** every Panel 1 write needs `aal2`. Super Admin and Managing Editor already require it by
  role.
- **The approver** of a Super Admin's request is a different Super Admin. A request lapses after 72
  hours, so nobody can approve a stale one by surprise.

**The access-rule notes this needs** (question 2). No permission or cell changes, so the catalogue
SQL is not regenerated.
- **(a) A counts as read** for the permission it is on. The matrix says A means "can act but a
  second person must approve"; Panel 0 refused it for reading until a panel used it. No route reads
  with an A cell today, so nothing else changes, and a test proves it.
- **(b) Removing access is single-actor** (revoke, suspend, sign out), like a takedown. It cannot
  create privilege, and speed matters when an account is misused.
- **(c) Nobody acts on their own access,** as above.
- **(d) Break-glass is self-activated** (§5).

### 4. Screens, routes and the welcome page

**Screens** (`apps/admin/src/app/admin/people/…`). Each has loading, error and empty states and is
checked for keyboard use and labels. The top bar shows "People" to holders of `user.manage`.
- **`/admin/people`: the directory.** Each person's name, email, status, roles (with desk and
  expiry), second factor (set or not) and last sign-in, with filters by role, desk and status.
  Above it, for Super Admins:
  - "Waiting for your approval", and the requests they made;
  - active break-glass;
  - roles ending within 14 days;
  - when the next review is due.
- **`/admin/people/new`: add a person.** Email, name, first role, desk, expiry, reason.
- **`/admin/people/[id]`: one person.**
  - Their roles: grant, renew, revoke.
  - Their account: rename, suspend, reactivate, sign out everywhere, a new password link, reset the
    second factor.
  - Their history from the audit log, for those who hold `audit.read`.
- **`/admin/people/review`:** the access review (§6).
- **`/admin/welcome`:** public; where a link lands (below).

**Routes** (`/api/admin/people/…`), one per action:
- `people`: `GET` and `POST`; `people/[id]`: `GET` and `PATCH`;
- `people/[id]/suspend`, `reactivate`, `sign-out`, `password-link` and `mfa-reset`;
- `people/[id]/roles` (grant), `roles/[assignmentId]/renew` and `revoke`;
- `requests` (`GET`), `requests/[id]/approve`, `decline` and `cancel`;
- `break-glass`: `POST` starts it, `DELETE` ends it early;
- `review`: `GET` and `POST`.

Each route is in `ADMIN_ROUTE_RULES` and covered by the route walk. Every route is `staffOnly`, and
the A ones are `twoPerson`: a Super Admin's call makes a request.

**Adding a person, and the one-time link** (M2):
1. The account is made with `createUser`, with the email confirmed and no password. Sign-up stays
   off, and nobody can sign in to the account yet.
2. A "set your password" link is made with `generateLink` (type `recovery`). The app builds its own
   address from the `hashed_token`: `/admin/welcome?token_hash=…&type=recovery`. It never uses
   Supabase's redirect, so no redirect address needs to be allowed.
3. The link is shown **once**, with a copy button, to the admin who added the person (for a Super
   Admin's request, once it is approved). It is not stored; the audit log records only that it was
   made. Whoever holds the link can set the password, so it is handed over in person or in a direct
   message.
4. The person opens the link. The page exchanges the token for a session (`verifyOtp`).
   - If they already have a second factor, they enter its code first, so a link alone cannot take
     over an account.
   - They choose a password.
   - They set up their second factor (Panel 0's existing step) if they have none, and land on
     their page.
5. The link works once, and only until Supabase's email-link expiry: 1 hour by default
   (question 3).

A forgotten password uses the same link. The page needs two new public routes (`/admin/welcome` and
`POST /api/admin/welcome`, which takes the token) and one session-only route, `POST
/api/admin/password`, which sets the password. `PUBLIC_ADMIN_ROUTES`, the proxy and the route walk
gain them.

**Resetting a lost second factor** (M2):
1. One Super Admin asks, saying how they checked that it really is the person.
2. Another Super Admin approves.
3. The app deletes the person's factors (`mfa.deleteFactor`) and ends their sessions.
4. At their next sign-in, the person sets up a new factor.

### 5. Emergency access (break-glass, M3)

The matrix gives Super Admin `article.unpublish` / takedown only as **F (break-glass)**. It is for
the night a court order arrives and no editor answers.
- **How it starts.** A Super Admin starts it for themselves, with a reason, after their second
  factor. It is a `super_admin` row with `is_break_glass` set, and it ends within 2 hours (the
  database's CHECK).
- **What it gives.** Exactly the break-glass cells of the matrix (today: taking an article or a
  story down), and nothing else.
- **Why one person may start it.** Its point is speed. In exchange:
  - the other Super Admins see it at once, on `/admin/people` and in a bar across the back office
    while it lasts;
  - every action taken under it names the break-glass assignment in the audit log;
  - a takedown made with it reaches the Managing Editor and Legal through the Desk's alert list
    (Panel 2);
  - it can be ended early, but not extended: another one needs a new reason;
  - email waits for an email service.

### 6. The access review (M3)

Every 90 days, a Super Admin goes through every live assignment on `/admin/people/review`. The
access rules call this review "the cheapest control against the privilege creep OWASP warns about"
("Retention").
- **Each row shows** the person, the role, the desk, who granted it, when it ends and the person's
  last sign-in.
- **Each row is flagged** if the person has not signed in for 60 days, has no second factor, or
  holds a privileged role, or if the row expired but was never revoked.
- **The reviewer marks each row:**
  - keep;
  - revoke, done at once;
  - renew, a request as usual.
- **To finish,** the reviewer adds a note and completes the review. That writes an `access_reviews`
  row with the snapshot.
- **The reminder:** `/admin` tells Super Admins when a review is due.

### 7. Retiring the shared password (M4)

This is Panel 0's design §7, unchanged.
- **When.** All three must hold:
  - M1 to M3 are merged;
  - two Super Admins have signed in with their second factor;
  - the owner says go.

  Panel 0's runbook also asked for this to happen "in production". The release is not deployed
  yet, so the owner decides whether that condition still applies (question 6). Whatever is decided,
  the code refuses the shared password from 1 January 2027.
- **What.** One deletion commit removes:
  - `adminSession.ts`, and the legacy branches in the proxy, the login route and
    `staffSession.ts`;
  - `decideLegacy` and `LEGACY_PERMISSIONS`;
  - the "shared password" option on the sign-in page;
  - `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` and `ADMIN_LEGACY_LOGIN` from `.env.example` and
    `deploy/env/admin.env.example`.
- **Then the owner** removes those variables, and the unused `ADMIN_SECRET_TOKEN`, from the root
  `.env` and from the server's env file. The sealed way in stays the owner's: the Supabase dashboard
  and the SQL editor (the bootstrap script).

### 8. Audit

- **Every write** records "attempted, then outcome" (Panel 0, Q2). It is refused with 503 if the
  attempt cannot be written. The database parts that must not come apart are one function call
  each (§2).
- **Action names:**
  - `staff.add`, `staff.rename`, `staff.suspend`, `staff.reactivate`, `staff.sign_out`,
    `staff.password_link`, `staff.mfa_reset`;
  - `role.assign`, `role.renew`, `role.revoke`;
  - `access.request`, `access.approve`, `access.decline`, `access.cancel`;
  - `access.break_glass_start`, `access.break_glass_end`, `access.review_complete`;
  - on the welcome page, `auth.password_set`.
- **Each row records** the person acted on, the role and scope before and after, the request and its
  two people where there are two, and the reason. It never records a link or its token.
- **Failures reach Sentry** through the existing reporters.

### 9. Owner actions

1. **A second Super Admin, before M1 is shown.** Every Super Admin change needs a second Super
   Admin, and so does granting a Managing Editor. Use B3 of the staff-access runbook: Add user →
   Create new user, then `super-admin.sql`. Who it is is the owner's choice (question 1).
2. **Apply admin-1** (M1) and **admin-2** (M3), each with its check.
3. **In Supabase,** set the email-link (OTP) expiry under Authentication → Email: it decides how long
   a set-password link works (question 3).
4. **At M4,** remove the shared password's variables from the root `.env` and from the server.
5. **Then grant the first Managing Editor in the app,** with two Super Admins. The Desk roles
   granted by SQL (Panel 2) stay valid as they are; only their renewal goes through Panel 1.

### 10. Tests

- **Every route:**
  - allowed for its least-privileged holder;
  - denied with no assignment, an expired one, no MFA, and a shared-password session;
  - denied for a Managing Editor out of scope, above Desk Editor, or acting on someone who is not
    one of their people.
- **Two people:**
  - a Super Admin's change becomes a request;
  - the requester, and the person it is about, cannot approve it; a second Super Admin can;
  - a lapsed, decided or cancelled request cannot be approved;
  - a self-grant is refused;
  - revoke and suspend act at once;
  - the last Super Admin cannot be removed.
- **`decide()`:** A counts as read, and every existing route's answer is unchanged (the access
  test's matrix).
- **The welcome page:**
  - a missing, wrong or used token shows the error and makes no session;
  - a session from the link must set a password, and then a second factor, before anything else;
  - an account that has a factor must enter its code before the password.
- **Break-glass:**
  - it lasts at most 2 hours and gives takedown only;
  - it is refused to anyone but a Super Admin, and refused while one is already active;
  - it can be ended early.
- **The database rules** (the new index, the trigger's exception, the decide-once trigger and the
  functions) are in admin-1's check queries, run by the owner (definition of done, item 7).
- **Browser tests, read-only:**
  - signed out, `/admin/people` goes to sign-in and its API answers 401;
  - the welcome page without a token shows its error without calling Supabase.
- **JS budgets** for every new page.

### 11. Questions for the owner

1. **Should every Super Admin change need a second Super Admin** (the matrix's A, as written)?
   - **Recommended:** keep it. Grants are rare, and a Managing Editor handles day-to-day newsroom
     roles alone.
   - It means a second Super Admin is needed before Panel 1 is any use to a Super Admin. Who should
     it be?
   - The other way: a Super Admin acts alone for non-privileged roles, and two Super Admins are
     needed only for privileged ones. That is an access-rule change.
2. **The four access-rule notes of §3:** A counts as read; removing access is single-actor; nobody
   acts on their own access; break-glass is self-activated? **Recommended.**
3. **Adding people with a one-time link** that is shown to the admin and handed over, with email
   later? It needs no email service. And how long should the link work?
   - Supabase's default is 1 hour.
   - **Recommended: 24 hours,** the most Supabase allows, so the person can open it the same day.
4. **Break-glass as in §5:** a Super Admin alone, at most 2 hours, takedown only, the other Super
   Admins alerted on screen, and email later? **Recommended.**
5. **Expiry and the review:** 180 days by default (30, 90, 180 or 365), 365 for Super Admin, at most
   365, and a review every 90 days? **Recommended.**
6. **Should the shared password go in M4,** once two Super Admins have signed in with their second
   factor, without waiting for the AWS deployment? **Recommended,** if Vivek's release does not
   depend on it; that needs his word.
7. **Milestones M1 → M2 → M3 → M4,** each shown to the owner before the next? **Recommended.**

### 12. Not in Panel 1

- **Assigning a writer on the Desk.** Panel 2 left it for a staff directory. It is a small Desk
  follow-up once M1 is merged, if the owner wants it.
- **Linking an author record to a staff account** (`authors.staff_user_id`): Panel 2's author
  screen, later.
- **Email** for links, alerts and reminders: when an email service exists.
- **The audit viewer, and `audit_verify_chain()` in the app:** Panel 8.
- **The settings and health pages.** Health stays on `/admin`. `settings.manage` has nothing to
  manage yet.
- **Vendor consoles' user lists** (GAM, Piano and the rest) in the review: Panel 9.
- **RLS with a user-context client, and a SQL `has_permission()`:** Phase 2 (Panel 0).

## Panel 2 design: the Desk (Publisher)

**Status:** **approved** by the owner on 17 Nov 2026, with the recommended answer to every question
in §11 (recorded below). Branch `panel-2-desk`. **Started before Panel 1 at the owner's request**
(17 Nov 2026); `NEWSROOM_PLAN.md` is unchanged.

### Approval: decisions (17 Nov 2026)

The section overrides anything later in this design that disagrees with it.
1. **Hindi story URLs:** `/hi/{section}/{slug}-{public_id}`, for story pages only. The rest of `/hi/`
   stays in Phase F.
2. **Two new permissions,** added to the matrix in M1 and shipped as a catalogue migration:
   - `author.manage`: Managing Editor F, Desk Editor F;
   - `media.manage`: Managing Editor F, Desk Editor S.
3. **Scheduling:** the worker checks for due stories every 5 minutes.
4. **Dependencies:** `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit` and the extensions the
   block list needs, MIT, pinned at 3.32.2, added in M2. The revision diff is our own code.
5. **Notifications** on unpublish and retract: the Desk's alert list and the audit log; email later.
6. **Milestones** in the order M1 → M2 → M3 → M4, each shown to the owner before the next.
7. **Preview in the back office** (owner, 17 Nov 2026, during M3, replacing the draft-mode preview
   of §0, §4, §6, §8, §9 and §10). The design's preview needed the reader site to read unpublished
   stories, while the audit's F-008 takes the reader site's full database key away
   (`deploy/env/web.env.example`), leaving it published stories only. So the preview is a back-office
   page, `/admin/desk/[id]/preview`: the story's last saved version drawn by the reader site's own
   view (`StoryArticle`, with the same text styles and Devanagari face), behind the same session,
   permission and desk as opening the story. No `PREVIEW_SECRET`, no draft mode, no link a reader
   could follow. It differs from the plan's E6 ("a signed preview link renders a draft on the reader
   site"); `NEWSROOM_PLAN.md` is unchanged at the owner's request.

**Plan:** [`NEWSROOM_PLAN.md`](NEWSROOM_PLAN.md), Phase E (E1 to E6), and the
[access rules](#access-rules): the `article.*` rows of the matrix, and "Four-eyes, takedown and MFA
rules". **Done when** (the plan): two people can write, review, approve, schedule and correct one
Hindi and one English story end to end; every action is audited; every allowed and denied path is
tested with the database mocked and, read-only, in the browser; the owner checks the flow against
the real database with the panel's runbook.

The Desk is where the newsroom's own stories are written, checked, approved, scheduled, published,
corrected and taken down, in English and Hindi. Its stories live in new tables of their own: the
aggregator's `articles` table, with its 7-day purge, is not touched.

### 0. What the docs and the code say, and what it changes

- **Next 16, draft mode** (bundled docs: guides/draft-mode.md). `draft.enable()` sets the
  `__prerender_bypass` cookie, and the entry route must check a secret and redirect only to a path
  it trusts ("to avoid open redirect vulnerabilities"). Draft mode bypasses caches; it is **not**
  access control. So a preview also carries a signed, short-lived cookie naming the one story it may
  show (§6). *Not built: decision 7 moved the preview into the back office.*
- **Next 16, `revalidateTag`** (functions/revalidateTag.md). It runs in Route Handlers, and a call
  from another service passes `{ expire: 0 }`. The reader site caches nothing about stories in
  Panel 2 (§6), so Panel 2 needs no revalidation. Phase F adds caching with tags, as its plan says.
- **Panel 0's `decide()`** (`packages/server/src/auth/decide.ts`) refuses the matrix codes **Own** and
  **A** today: "Own needs the item's owner, which Panel 2 adds; A needs a second person, whose approval
  flow comes with the panel that uses it". Panel 2 adds both (§3).
- **The shared password** (`legacy:shared-password`) is not a person. It cannot be an author, an
  editor or an approver, so every Desk route refuses it. Its fixed list (owner decision Q3) still
  covers today's routes only.
- **The app talks to Supabase as `service_role`** (Panel 0 approval): `requirePermission` is the only
  gate on the request path. RLS on the new tables protects direct reads with the anon key: readers
  may read published stories and nothing else.
- **Before Panel 1, roles are granted by SQL.** Panel 0's runbook: "Granting editorial roles … in the
  app is Panel 1". Until then the owner grants the Desk roles with a reviewed SQL snippet (§9).
  Managing Editor is privileged, so the database asks for two Super Admins.
- **Tiptap** (research D3; plan decision 1). The editor is Tiptap, MIT licensed, pinned at **3.32.2**
  (released 30 Oct 2026, more than two weeks old). Stories are stored as Tiptap JSON. The reader
  renders that JSON to HTML on the server with the same schema, so no editor code reaches readers.

### 1. Milestones

Panel 2 is the plan's largest phase (3 to 5 months, research estimate). It is built in four
milestones. Each one is its own branch and pull request, green on `npm run verify`, and shown to the
owner before the next starts.

| Milestone | What it delivers | Rough size |
|---|---|---|
| **M1. Stories backend** | The tables (§2), the workflow (§3), the Desk API (§4), the audit (§8), with every permission tested allowed and denied | 2 to 3 weeks |
| **M2. Desk screens and the editor** | The story list with filters, the story screen with the Tiptap editor (§5), revisions with a diff and a restore, the soft lock, the pre-publish checklist. **Week 1 checkpoint:** Hindi typists test the editor | 4 to 6 weeks |
| **M3. Preview, publishing and the reader page** | The preview link (§6), the minimal reader story page, scheduling and embargo through the worker, unpublish, retract and correct | 2 to 3 weeks |
| **M4. Media library and bylines** | Upload, credit, licence, alt text and renditions (§7); author records | 3 to 4 weeks |

The Panel 2 entry in this file, the current status in `docs/OPERATIONS.md` and `docs/ARCHITECTURE.md`
are updated in each milestone's pull request. The panel is marked Done only after M4, when all 13
items of the [definition of done](#definition-of-done) hold.

### 2. Data model (M1, and M4 for media)

All of it is SQL in migration files that the owner applies (`database/migrations/`), each with a
rollback section. The app never runs DDL.

| Table | Key columns | Rules |
|---|---|---|
| `sections` | `key` (PK, `^[a-z_]+$`, the same keys as `role_assignments.section`), `label_en`, `label_hi`, `position`, `active` | Seeded with the reader site's eight: `india`, `world`, `tech`, `business`, `sports`, `entertainment`, `health`, `science` (R2). One taxonomy for scope, the desk and the URLs |
| `stories` | `id` (uuid), `public_id` (bigint identity, for URLs), `language` (`en` or `hi`), `section` (→ `sections`), `format`, `workflow_state`, `translation_group_id`, `slug`, `created_by`, `assigned_to`, `last_edited_by`, `approved_by`, `approved_revision_id`, `published_by`, `current_revision_id`, `published_revision_id`, `scheduled_at`, `embargo_until`, `legal_hold`, `content_label`, `access` (`free`), `breaking`, `post_hoc_review_due`, `correction_note`, `first_published_at`, `published_at`, `created_at`, `updated_at` | `language` uses the scope codes `en` and `hi` directly, unlike `articles` (Panel 0's D5 mapping is not needed). CHECKs keep the state and its pointers consistent, for example `published` needs `published_revision_id` |
| `story_revisions` | `id`, `story_id`, `body` (Tiptap JSON), `headline`, `dek`, `seo_title`, `seo_description`, `editor_id`, `is_substantive`, `created_at` | **Immutable:** a trigger refuses UPDATE and DELETE, as on `audit_log`. Also the 60-day content record (Rule 19) |
| `workflow_transitions` | `id`, `story_id`, `from_state`, `to_state`, `action`, `actor_id`, `revision_id`, `reason`, `at` | Append-only (trigger). The four-eyes check reads it |
| `pending_actions` | `id`, `story_id`, `action` (`restore`, `correction`), `requested_by`, `reason`, `requested_at`, `decided_by`, `decided_at`, `outcome` | The matrix's **A**: one person asks, a different one approves (§3) |
| `story_locks` | `story_id` (PK), `holder_id`, `heartbeat_at` | Soft lock; it lapses 2 minutes after the last heartbeat. "Take over" is audited |
| `authors`, `story_authors` | `authors`: `id`, `display_name_en`, `display_name_hi`, `kind` (staff, columnist, freelancer, agency), `staff_user_id`, `bio_en`, `bio_hi`, `beat`, `links`, `active`. `story_authors`: `story_id`, `author_id`, `role` (byline, additional reporting, translated by), `position` | Authors are not staff accounts. A translated story credits its translator (research D5) |
| `tags`, `story_tags` | `tags`: `id`, `language`, `slug`, `label` | Per language |
| `media_assets`, `asset_usages` (M4) | `credit`, `source` (staff, agency, stock, handout, social), `licence`, `licence_expires_at`, `cleared_by`, `alt_en`, `alt_hi`, `caption_en`, `caption_hi`, `storage_key`, `renditions` | Publishing is refused while a used image lacks credit, alt text or rights |

- **Formats:** news, opinion, explainer, analysis, interview, live blog, gallery, video, fact-check
  and sponsored are allowed by the CHECK. The API refuses `sponsored` (Panel 9, with
  `sponsored.approve`) and `live blog` (Panel 3).
- **Grants and RLS:** `service_role` has what the app needs, and no grant to UPDATE or DELETE
  revisions, transitions or the audit log. `anon` and `authenticated` may SELECT a story only while it
  is `published` and its embargo has passed, and a revision only when it is that story's
  `published_revision_id`.
- **Retention:** stories and revisions are never purged by the aggregator's 7-day job (another
  table). Deleting a story is not offered; `killed` and `retracted` keep the record.

### 3. Workflow

States, from the plan: `pitch → assigned → draft → in_review → desk_review → approved → scheduled →
published`. After publication a story can become `unpublished` or `retracted`, and abandoned work is
`killed`. "Updated" is an event, not a state.

| Action | From → to | Permission (matrix) | Extra rules |
|---|---|---|---|
| Create | → `pitch` or `draft` | `article.create`: Writer **Own**, Sub-editor and Desk Editor **S**, Managing Editor **F** | The creator is `created_by`. Target scope is the new story's language and section |
| Assign | `pitch` → `assigned` | `article.edit` (S or F) | Names the writer |
| Save (a new revision) | `pitch` to `approved` (stays, except that `approved` goes back to `desk_review`) | `article.edit`: Writer **Own** (only stories they created), others S or F | Needs the soft lock. Saving after approval voids the approval |
| Submit | `draft` → `in_review`; `in_review` → `desk_review` | `article.submit` (Own, S or F); from `in_review`, S or F only | Writer submits to the sub-editors; a Sub-editor passes it to the desk. *Amended by the owner, 18 Nov 2026:* a Writer's Own does not reach the step out of review, even on their own story |
| Send back | `in_review` or `desk_review` → `draft` | The permission that moves the story on from where it is (`article.submit` from `in_review`, at S or F; `article.approve` from `desk_review`) | A reason is required. A Writer cannot send back their own story (amended, 18 Nov 2026) |
| Approve | `desk_review` → `approved` | `article.approve`: Desk Editor S, Managing Editor F | **Four-eyes:** the approver is neither `created_by` nor the editor of the revision being approved, nor anyone who saved it since its last approval (from `workflow_transitions`). The **pre-publish checklist** must pass. Approval binds to one revision (`approved_revision_id`) |
| Schedule | `approved` → `scheduled` | `article.publish`: Sub-editor and Desk Editor S, Managing Editor F | `scheduled_at` in the future; the worker publishes it (§6) |
| Publish | `approved` or `scheduled` → `published` | `article.publish` | Only the approved revision goes live. **Publish Guard:** the button exists only in `approved`, and the server refuses any other state. Refused before `embargo_until` |
| Publish direct (breaking) | `draft` to `desk_review` → `published` | `article.publish_direct`: Desk Editor S, Managing Editor F | Sets `breaking` and `post_hoc_review_due`. A different editor must then approve the live revision; the list shows these stories until that happens |
| Update a live story | `published` (stays) | `article.edit` to save, `article.approve` to approve the new revision, `article.publish` to put it live | The live revision stays until the new one is approved (four-eyes and the checklist, as for Approve) and published. A substantive update can carry a public **correction note** (`correction.publish`: Desk Editor S, Managing Editor F, Sub-editor **A**) |
| Unpublish or retract | `published` → `unpublished` or `retracted` | `article.unpublish`: Desk Editor S, Managing Editor F, Legal F, Super Admin break-glass | **Single actor**, for speed. Reason code required (legal, error, duplicate, other) plus a note. MFA. The Managing Editor and Legal are notified (§8) |
| Restore | `unpublished` → `published` | `article.restore`: **A** for Managing Editor, Desk Editor and Legal | **Two people:** one asks with a reason, a different one approves (`pending_actions`). Nobody holds F, so it is always two |
| Kill | any state before `published` → `killed` | `article.edit` (Writer Own) | Reason required |

- **Own and A in `decide()`.** A target gains `ownerId`. **Own** allows the action when
  `ownerId` is the actor; it is never enough for another person's story. **A** still answers
  `needs_approval`. The two A routes turn that into a request in `pending_actions`, and a second
  holder of A or F, who is not the requester, approves it.
- **MFA.** Every staff member signs in with a second factor (Panel 0, Q1). Desk Editor, Managing
  Editor and Legal also require it by role. Every Desk write needs `aal2`.
- **Pre-publish checklist** (blocks Approve; config values, tested):
  - a headline of at most 110 characters;
  - a dek;
  - an SEO title of at most 65 characters;
  - a slug (a Hindi story's is typed in Latin letters);
  - alt text, credit and cleared rights for every image (M4);
  - the other language's version, when the story is in a translation group;
  - the legal-review flag cleared.
- **Revisions:** a diff between any two (headline, dek and the body's text, word by word), and a
  restore that copies an old revision into a new one. Nothing is ever overwritten.

### 4. API and screens

All under the back office's existing gate: `apps/admin/src/proxy.ts`, then `requirePermission` in
every route body. Every route is listed in `ADMIN_ROUTE_RULES`
(`packages/server/src/auth/adminRoutePolicy.ts`), and the route walk test covers each one.

**Routes** (`/api/admin/desk/…`), one per action so each rule stays static:
- `stories`: GET (the list, filtered to the caller's scopes) and POST (create);
- `stories/[id]`: GET;
- `stories/[id]/revisions`: GET and POST (save);
- `stories/[id]/revisions/[revisionId]`: GET;
- `stories/[id]/lock`: POST (take or renew), DELETE (release), and `take-over`;
- one route each for `assign`, `submit`, `send-back`, `approve`, `schedule`, `publish`,
  `publish-direct`, `unpublish`, `retract`, `kill`, `correct`, `restore`, and the A approval
  `pending/[actionId]/approve`;
- ~~`stories/[id]/preview`: POST, returning a preview link (M3);~~ not needed: the preview is a
  back-office screen that reads the story through `stories/[id]` (decision 7);
- `authors` and `media` (M4).

**Screens** (`apps/admin/src/app/admin/desk/…`), each with loading, error and empty states, and
checked for keyboard use and labels:
- `/admin/desk`: the list, with filters for language, section, state and author, plus "needs
  post-hoc review" and "waiting for a second approver";
- `/admin/desk/new`;
- `/admin/desk/[id]`: the editor, the checklist, the state's buttons (only those the caller may
  use, but the server decides), revisions and the diff, the transitions history;
- `/admin/desk/[id]/preview`: the story's last saved version in the reader site's view (decision 7).

A person without the permission gets **403** with the Panel 0 message, and the screen shows it.
A shared-password session gets 403: "Sign in with your own account to use the Desk."

### 5. The editor (M2)

- **Blocks:** paragraph, heading, list, link, image (from the media library, M4), gallery, embed
  (YouTube, X, Instagram), quote, factbox, related link, ad-slot placeholder.
- **Embeds on the reader site load nothing from the outside until the reader clicks.** YouTube then
  uses `youtube-nocookie.com`. No third-party script arrives with the page (privacy and the CSP).
- **The code lives in a new workspace package, `packages/editor`** (the plan): the schema, which both
  the editor and the reader's renderer use, and the editor component, which only the back office
  imports.
- **Checkpoint, week 1 of M2:** Hindi typists test the editor with InScript and phonetic keyboards.
  If Devanagari input fails and cannot be fixed, the work stops and the owner hears at once. The
  fallback is Quintype (research D3).
- **Checkpoint, about month 3:** if a usable Hindi and English editor with revisions is not working,
  the owner prices Quintype (the plan).

### 6. Preview, publishing and the reader page (M3)

- **The reader's story page** is the minimum Panel 2 needs to preview and publish. It follows the
  plan's URL scheme: **`/{section}/{slug}-{public_id}`** for English, under R2's `[section]` route,
  and **`/hi/{section}/{slug}-{public_id}`** for Hindi (owner question 1). It shows the published
  revision only: headline, dek, bylines, time, body, the correction note if any, and the story's
  `lang` on its `<article>`. An unknown, unpublished or embargoed story is a 404. Phase F adds the
  rest: NewsArticle markup, the news sitemaps, IndexNow, author and tag pages, and caching.
- **No caching in Panel 2.** The page reads the database on each request, with no Next cache and
  `no-store` at CloudFront, like the home page. Publishing and taking down are therefore seen at once.
- **Preview** (decision 7, replacing the draft-mode steps first designed here): the Desk's
  "Preview" opens `/admin/desk/[id]/preview`, which shows the story's last saved revision in the
  reader site's own view (`packages/ui`'s `StoryArticle` and `story.css`), under a "Preview, not
  published" bar. It reads the story through `GET /api/admin/desk/stories/[id]`, so it needs that
  route's permission (`article.view_admin`) in the story's desk, and never leaves the back office,
  which is not indexed.
- **Scheduling and embargo:** a new worker job, `publish-scheduled`, publishes due stories. Its
  actor in the audit log is `system:scheduler`, on behalf of the editor who scheduled.
  - A new systemd timer in `deploy/` runs it every **5 minutes** (owner question 3).
  - `embargo_until` is enforced in the backend: Publish, Publish direct and the job all refuse
    before it.
- **The old editorial endpoint** `POST /api/admin/publish-article`, which wrote into `articles`
  (BL-004), is removed once M3 is live, in its own commit.

### 7. Media library and bylines (M4)

- **Storage:**
  - Images go to an **S3 bucket in Mumbai** (the plan), behind one storage interface.
  - The server's role gets put and get on that bucket.
  - CloudFront serves the files under `/media/*`. *Narrowed in M4 (18 Nov 2026), before any bucket
    existed:* to `/media/renditions/*`, as the originals keep the camera's metadata; staff see them
    through the back office.
  - This is the manager's console work, listed in §9.
- **Renditions:** the worker makes the fixed renditions (16:9, 4:3 and 1:1, in AVIF and WebP) with
  `sharp`, already in the tree through Next.
- **Required fields:** credit, source, licence, rights cleared by, and alt text and caption in each
  language the story uses. Publishing refuses a story whose images lack them.
- **Authors:** records with photo, bio, beat and links. Agency bylines (PTI, ANI and others) wait for
  a wire licence (Phase K).

### 8. Audit and notifications

- **Every Desk write** writes `audit_log` first ("attempted, then outcome", Panel 0 Q2), and is
  refused with 503 if it cannot.
- **Action names:** `story.create`, `story.save`, `story.assign`, `story.submit`,
  `story.send_back`, `story.approve`, `story.schedule`, `story.publish`, `story.publish_direct`,
  `story.unpublish`, `story.retract`, `story.kill`, `story.correct`, `story.restore_request`,
  `story.restore_approve`, `story.lock_take_over`, and `author.*` and `media.*` in M4.
  (`story.preview_link` went with the preview link, decision 7: opening a preview reads the story,
  as opening it on the Desk does, and reads are not audited.)
- **What each row holds:** the story's language and section, the state and revision before and
  after, and the reason where one is required.
- **Unpublish and retract notify** the Managing Editor and Legal through an alert list on the Desk,
  and the audit log. Email waits for an email service (owner question 5).
- **Failures reach Sentry** through the existing reporters.

### 9. Owner actions

1. **Panel 0's SQL and Part B** of the [staff-access runbook](OPERATIONS.md#staff-access-switching-on-panel-0-and-getting-back-in).
   Without staff accounts nobody can use the Desk. It is already a go-live gate.
2. **Apply the Desk migrations** (M1: stories; M4: media) and run their check queries.
3. **Grant the first Desk roles by SQL** until Panel 1: a Managing Editor (two Super Admins), a
   Desk Editor, a Sub-editor and a Writer, from a snippet in the runbook (M1).
4. **Arrange two Hindi typists** for the editor checkpoint in week 1 of M2.
5. ~~**Set `PREVIEW_SECRET`** in the web and admin env files (M3).~~ Not needed (decision 7).
6. **M4: the media bucket,** its IAM permissions and the CloudFront `/media/renditions/*` behaviour
   (manager; narrowed from `/media/*`, §7).
7. **Approve the new dependencies** (question 4) and the access-rule additions (question 2).

### 10. Tests

- **Every route:**
  - allowed;
  - denied with no assignment, an expired one, the wrong scope, missing MFA, and a shared-password
    session;
  - Own allowed on the writer's own story and refused on another's.
- **Workflow:**
  - every transition from the table, allowed and refused from every other state;
  - four-eyes: the author, the last editor and anyone who saved since the approval are refused;
  - Publish Guard;
  - embargo;
  - A: the requester cannot approve their own request;
  - approval voided by a later save.
- **Database rules** (immutable revisions, append-only transitions, RLS) are in the migration's
  check queries, run by the owner (definition of done, item 7).
- **Preview** (decision 7): the last saved version in the reader's view; the route's refusal shown;
  signed out, the preview goes to sign-in.
- **Reader page:** published only; unpublished and embargoed answer 404.
- **Browser tests, read-only:**
  - the Desk list loads;
  - a shared-password session is refused (the refused-access flow);
  - the reader renders a published story from the Supabase stand-in.
- **JS budgets** for every new route.

### 11. Questions for the owner

1. **Hindi story URLs:** `/hi/{section}/{slug}-{id}` now, for story pages only (the plan's scheme;
   the rest of `/hi/` stays in Phase F)? **Recommended.** Or no `/hi/` prefix until Phase F?
2. **Two new permissions** (an access-rule change). The matrix has none for authors or media:
   - `author.manage`: Managing Editor F, Desk Editor F;
   - `media.manage` (credit, licence, retiring an image): Managing Editor F, Desk Editor S.

   Uploading an image to a story rides on `article.edit`. **Recommended.**
3. **Scheduling:** check every **5 minutes** (recommended) or every minute? Every minute starts a
   container 1,440 times a day on the one server.
4. **New dependencies:** `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit` and the extensions
   the block list needs, all MIT and pinned at 3.32.2. The revision diff is our own code, so no
   other package is needed. **Recommended.**
5. **Notifications** on unpublish and retract: on the Desk and in the audit log now, email when an
   email service exists? **Recommended.**
6. **Milestones:** build in the order M1 → M2 → M3 → M4, showing each to the owner before the next?
   **Recommended.**

### 12. Not in Panel 2

- **Phase F** (reader site): NewsArticle markup, news sitemaps, IndexNow, author and tag pages,
  caching with tags, `/hi/` for the rest of the site.
- **Panel 3:** stories on the home page and the section pages, pinned slots, live blogs.
- **Panel 7:** the public corrections page and the grievance queue. Panel 2 stores the correction
  note on the story.
- **Panel 9:** sponsored stories. **Phase K:** agency copy and bylines.
- **Bulk actions** (`article.bulk_action`) on stories, until the Desk needs them.
- **AI help** in the editor.
