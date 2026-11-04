# Roles, permissions and approval rules

**What this is:** the access rules every back-office panel follows: the roles, the permission matrix,
the four-eyes, takedown and MFA rules, and the data model behind them. The build order is in
[`NEWSROOM_PLAN.md`](NEWSROOM_PLAN.md); what is built is in [`PANEL_DOCS.md`](PANEL_DOCS.md).

**Where it came from:** the owner's `PANEL_PLAN.md` (2 Nov 2026), retired on 4 Nov 2026 when the
owner approved `NEWSROOM_PLAN.md`. The sections below are copied from it unchanged, except where
a note says otherwise. The supporting publisher research is in [`RESEARCH.md`](RESEARCH.md) and in
git history (`git log --all -- docs/PANEL_PLAN.md`).

**The matrix is canonical.** `scripts/generate-access-catalog.mjs` turns the matrix below into
`database/migrations/2026-11-02-access-2-catalog.sql`, and `packages/shared/src/config/permissions.test.ts` checks
the result cell by cell. To add or change a permission: propose it in the panel's design doc, get the
owner's approval, edit the row here, regenerate the SQL (`node scripts/generate-access-catalog.mjs`),
and ship it as a new migration.

## Panels

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

## Generic roles, scoped by language desk and section

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

## Four-eyes, takedown and MFA rules

The approval rules borrow directly from documented products. Publishing requires an approval by someone other than the author and the last editor, enforced per object (Contentstack's self-approval block). The Publish action stays hidden until the item is in the Approved state (VIP's Publish Guard). Breaking news gets a narrow escape hatch: `article.publish_direct` held by Desk Editors in scope, which publishes immediately and automatically opens a post-hoc review item. Unpublish and takedown should be **single-actor for speed**, because legal and defamation exposure grows by the hour and intermediary timelines are now measured in hours. They still require a reason code, MFA and an immediate notification to the Managing Editor and Legal. **Restore needs a second approver**, because a wrongful restore is the riskier error. Granting any privileged role (Super Admin, Managing Editor, Legal, Privacy Officer) needs two admins. Bulk purge needs two people and must refuse to delete anything published or aggregated within 60 days, to protect Rule 19(3) records. Every privileged role (Super Admin, Managing Editor, Desk Editor, Legal, Privacy Officer, Security Lead, Ingestion Ops) must sign in at Supabase's **`aal2` assurance level, which is issued only after a verified second factor**. The permission check refuses privileged verbs at `aal1` ([Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa.md)). Break-glass access is a time-boxed (for example 2-hour) grant with a mandatory reason and an alert. It replaces the habit of sharing the old password. Break-glass is standard practice, but no source here prescribes a specific procedure.

## Data model

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

## How the check flows: the proxy guesses, the backend decides

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

## Retention

Retention settings follow from the statutes. Audit and access logs should be kept for **at least one year**, which covers both DPDP's one-year floor and CERT-In's 180 days. Content snapshots are kept for at least 60 days, and orders, takedowns and corrections much longer for litigation holds. Run the Supabase project in an Indian region, or export logs to Indian storage. Whether a cloud region in India satisfies "Indian jurisdiction" was not confirmed. A quarterly access review (who holds what, which assignments are expired, which vendor seats are unused) is the cheapest control against the privilege creep OWASP warns about ([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)).
